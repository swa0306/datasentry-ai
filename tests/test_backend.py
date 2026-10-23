from __future__ import annotations

import json
import time
from unittest.mock import Mock

import pytest
from fastapi.testclient import TestClient

from backend import main


@pytest.fixture
def client():
    with TestClient(main.app) as test_client:
        yield test_client
    with main._cache_lock:
        main._analysis_cache.clear()


def upload(client, name="metrics.csv", contents=b"amount,units\n1,2\n2,3\n"):
    return client.post(
        "/api/analyze",
        files={"file": (name, contents, "application/octet-stream")},
    )


def analyze_for_interpret(client):
    response = upload(client)
    assert response.status_code == 200
    return response.json()["analysis_id"]


def test_health_check_is_available(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "datasentry-api"}


def test_valid_csv_returns_deterministic_analysis(client):
    response = upload(client, contents=b"amount,units\n10,1\n20,2\n30,3\n")

    assert response.status_code == 200
    result = response.json()
    assert result["row_count"] == 3
    assert result["column_count"] == 2
    assert result["numerical_statistics"]["amount"]["mean"] == 20
    assert result["processing_time_ms"] >= 0
    assert result["analysis_id"]


@pytest.mark.parametrize(
    ("contents", "code"),
    [
        (b"", "empty_file"),
        (b"amount,units\n", "no_data_rows"),
        (b'amount,units\n1,"unfinished\n', "invalid_csv"),
        (b"amount,amount\n1,2\n", "duplicate_headers"),
        (b"a" * 121 + b"\n1\n", "invalid_header"),
        (b"\xff\xfe", "invalid_encoding"),
    ],
)
def test_csv_validation_errors_are_structured(client, contents, code):
    response = upload(client, contents=contents)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == code
    assert response.json()["error"]["message"]


def test_unsupported_file_type_is_rejected(client):
    response = upload(client, name="metrics.txt")

    assert response.status_code == 415
    assert response.json()["error"]["code"] == "unsupported_file_type"


def test_oversized_upload_is_rejected(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 4)

    response = upload(client, contents=b"value\n123\n")

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"


def test_request_body_limit_rejects_large_multipart_envelope(
    client, monkeypatch
):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 4)
    response = upload(client, contents=b"value\n" + b"x" * (65 * 1024))

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"


def test_row_and_column_limits_are_enforced(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_ROWS", 2)
    too_many_rows = upload(client, contents=b"value\n1\n2\n3\n")
    assert too_many_rows.status_code == 413
    assert too_many_rows.json()["error"]["code"] == "too_many_rows"

    monkeypatch.setattr(main, "MAX_COLUMNS", 1)
    too_many_columns = upload(client, contents=b"left,right\n1,2\n")
    assert too_many_columns.status_code == 413
    assert too_many_columns.json()["error"]["code"] == "too_many_columns"


def test_missing_values_and_duplicate_rows_are_counted(client):
    response = upload(
        client,
        contents=b"amount,region\n10,west\n,west\n10,west\n",
    )

    result = response.json()
    assert result["columns"][0]["missing_count"] == 1
    assert result["columns"][0]["missing_percent"] == pytest.approx(33.33)
    assert result["duplicate_rows"] == 1


def test_numerical_statistics_are_calculated(client):
    response = upload(client, contents=b"amount\n1\n2\n3\n100\n")

    stats = response.json()["numerical_statistics"]["amount"]
    assert stats["mean"] == 26.5
    assert stats["median"] == 2.5
    assert stats["min"] == 1
    assert stats["max"] == 100


def test_constant_numeric_column_and_missing_values_are_stable(client):
    response = upload(
        client,
        contents=b"constant,measurement\n5,1\n5,2\n5,\n5,4\n",
    )

    assert response.status_code == 200
    result = response.json()
    assert result["columns"][1]["missing_count"] == 1
    assert result["numerical_statistics"]["constant"]["std_dev"] == 0
    assert result["numerical_statistics"]["constant"]["mean"] == 5
    assert result["potential_anomalies"] == {}
    assert result["correlations"] == []


def test_extreme_finite_values_return_finite_statistics(client):
    response = upload(
        client,
        contents=b"value\n1e308\n-1e308\n1\n2\n",
    )

    assert response.status_code == 200
    stats = response.json()["numerical_statistics"]["value"]
    assert stats["count"] == 4
    assert stats["std_dev"] == pytest.approx(8.164965809e307, rel=1e-9)
    assert all(
        value == value and abs(value) != float("inf")
        for value in stats.values()
    )


def test_iqr_anomaly_is_reported_as_potential(client):
    response = upload(client, contents=b"amount\n1\n2\n3\n4\n5\n100\n")

    anomaly = response.json()["potential_anomalies"]["amount"]
    assert anomaly["method"].startswith("Tukey IQR rule")
    assert anomaly["outlier_count"] == 1
    assert anomaly["examples"][0]["value"] == 100


def test_dataset_without_numeric_columns_does_not_fail(client):
    response = upload(
        client,
        contents=b"region,status\nwest,active\neast,inactive\nwest,active\n",
    )

    assert response.status_code == 200
    result = response.json()
    assert result["numerical_statistics"] == {}
    assert result["correlations"] == []
    assert result["categorical_summaries"]["region"]["unique_count"] == 2
    assert result["categorical_summaries"]["region"]["top_value_counts"] == [2, 1]


def test_empty_column_is_handled(client):
    response = upload(client, contents=b"region,unused\nwest,\neast,\n")

    assert response.status_code == 200
    result = response.json()
    assert result["columns"][1]["dtype"] == "empty"
    assert result["columns"][1]["missing_count"] == 2


def test_interpretation_gracefully_handles_missing_key(client, monkeypatch):
    analysis_id = analyze_for_interpret(client)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    response = client.post("/api/interpret", json={"analysis_id": analysis_id})

    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"
    assert "GEMINI_API_KEY" in response.json()["message"]


def test_interpretation_gracefully_handles_invalid_model_configuration(
    client, monkeypatch
):
    analysis_id = analyze_for_interpret(client)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "m" * 101)

    response = client.post("/api/interpret", json={"analysis_id": analysis_id})

    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"
    assert "configuration is invalid" in response.json()["message"]
    assert "deterministic analysis is still available" in response.json()["message"]


def test_interpretation_gracefully_handles_provider_failure(client, monkeypatch):
    analysis_id = analyze_for_interpret(client)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        main, "_generate_interpretation", Mock(side_effect=RuntimeError("provider failed"))
    )

    response = client.post("/api/interpret", json={"analysis_id": analysis_id})

    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"
    assert "deterministic analysis" in response.json()["message"]


def test_interpretation_validates_and_returns_structured_gemini_output(
    client, monkeypatch
):
    analysis_id = analyze_for_interpret(client)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "")
    output = {
        "executive_summary": "The metrics rise across the observed rows.",
        "key_findings": ["The two numeric fields move together."],
        "potential_risks": ["A statistical outlier may merit review."],
        "recommendations": ["Check the source of the flagged value."],
        "limitations": ["Correlation does not show causation."],
    }
    model_api = Mock()
    model_api.generate_content.return_value = Mock(
        text=json.dumps(output)
    )
    client_instance = Mock(models=model_api)
    client_factory = Mock(return_value=client_instance)
    monkeypatch.setattr(main.genai, "Client", client_factory)

    response = client.post("/api/interpret", json={"analysis_id": analysis_id})

    assert response.status_code == 200
    assert response.json()["status"] == "available"
    assert response.json()["interpretation"] == output
    assert client_factory.call_args.kwargs["api_key"] == "test-key"
    model_api.generate_content.assert_called_once()
    assert model_api.generate_content.call_args.kwargs["model"] == "gemini-4-argon"


@pytest.mark.parametrize(
    "provider_text",
    [
        "not json",
        '{"executive_summary":"Only one field"}',
    ],
)
def test_invalid_gemini_responses_degrade_gracefully(client, monkeypatch, provider_text):
    analysis_id = analyze_for_interpret(client)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    generated = Mock(text=provider_text)
    model_api = Mock()
    model_api.generate_content.return_value = generated
    monkeypatch.setattr(main.genai, "Client", Mock(return_value=Mock(models=model_api)))

    response = client.post("/api/interpret", json={"analysis_id": analysis_id})

    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"


def test_interpretation_timeout_preserves_analysis(client, monkeypatch):
    analysis_id = analyze_for_interpret(client)
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(main, "AI_TIMEOUT_SECONDS", 0.01)

    def slow_provider(_evidence):
        time.sleep(0.05)
        raise RuntimeError("provider timeout")

    monkeypatch.setattr(main, "_generate_interpretation", slow_provider)
    response = client.post("/api/interpret", json={"analysis_id": analysis_id})

    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"
    assert "timed out" in response.json()["message"]


def test_interpretation_cannot_access_expired_analysis(client):
    response = client.post(
        "/api/interpret",
        json={"analysis_id": "23d8ebda-f6a0-4e5d-9c38-4fa2a130ed98"},
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "analysis_expired"


def test_correlation_is_returned_from_calculated_numeric_columns(client):
    response = upload(
        client,
        contents=b"visits,revenue\n1,10\n2,20\n3,30\n4,40\n",
    )

    correlation = response.json()["correlations"][0]
    assert correlation["value"] == 1.0
    assert {correlation["column_a"], correlation["column_b"]} == {"visits", "revenue"}


def test_analysis_does_not_echo_uploaded_cell_contents(client):
    response = upload(
        client,
        contents=b"secret,amount\nprivate-customer-name,10\nanother-name,20\n",
    )

    assert response.status_code == 200
    assert "private-customer-name" not in response.text
    assert "another-name" not in response.text


def test_ai_evidence_contains_aggregates_not_categorical_cell_values():
    frame = main.pd.DataFrame(
        {"customer": ["sensitive-name-1", "sensitive-name-2"], "amount": [10, 20]}
    )

    _, evidence = main._analyze_frame(frame, "private.csv", 1.0)

    assert "sensitive-name-1" not in json.dumps(evidence)
    assert "sensitive-name-2" not in json.dumps(evidence)
    assert evidence["row_count"] == 2


def test_invalid_interpret_request_has_safe_error_shape(client):
    response = client.post("/api/interpret", json={"analysis_id": "bad"})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"
