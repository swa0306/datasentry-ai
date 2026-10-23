from __future__ import annotations

import json
from unittest.mock import Mock

import pandas as pd
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import main


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(main, "_persist_analysis_metadata", lambda uid, result: None)
    main.app.dependency_overrides[main._current_user] = lambda: "firebase-user-1"
    with TestClient(main.app) as test_client:
        yield test_client
    main.app.dependency_overrides.clear()
    with main._cache_lock:
        main._analysis_cache.clear()


def test_analyze_frame_returns_numerical_statistics():
    frame = pd.DataFrame({"amount": [1, 2, 3, 100], "units": [2, 3, 4, 5]})

    analysis, _ = main._analyze_frame(frame, "orders.csv", 1.0)

    assert analysis.row_count == 4
    assert analysis.numerical_statistics["amount"].mean == 26.5
    assert analysis.numerical_statistics["amount"].median == 2.5
    assert analysis.potential_anomalies["amount"].outlier_count == 1


def test_analyze_rejects_duplicate_headers(client):
    response = client.post(
        "/api/analyze",
        files={"file": ("duplicate.csv", b"amount,amount\n1,2\n", "text/csv")},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "duplicate_headers"


def test_analyze_rejects_upload_over_limit(client, monkeypatch):
    monkeypatch.setattr(main, "MAX_UPLOAD_BYTES", 4)

    response = client.post(
        "/api/analyze",
        files={"file": ("large.csv", b"value\n123\n", "text/csv")},
    )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "file_too_large"


def test_analyze_persists_metadata_after_success(client, monkeypatch):
    persist = Mock()
    monkeypatch.setattr(main, "_persist_analysis_metadata", persist)

    response = client.post(
        "/api/analyze",
        files={"file": ("orders.csv", b"amount,units\n10,1\n20,2\n", "text/csv")},
    )

    assert response.status_code == 200
    result = response.json()
    persist.assert_called_once()
    uid, analysis = persist.call_args.args
    assert uid == "firebase-user-1"
    assert analysis.analysis_id == result["analysis_id"]


def test_failed_analysis_does_not_persist_metadata(client, monkeypatch):
    persist = Mock()
    monkeypatch.setattr(main, "_persist_analysis_metadata", persist)

    response = client.post(
        "/api/analyze",
        files={"file": ("bad.csv", b"amount,amount\n1,2\n", "text/csv")},
    )

    assert response.status_code == 400
    persist.assert_not_called()


def test_failed_history_write_is_reported_and_evidence_is_not_cached(
    client, monkeypatch
):
    monkeypatch.setattr(
        main,
        "_persist_analysis_metadata",
        Mock(side_effect=RuntimeError("database unavailable")),
    )

    response = client.post(
        "/api/analyze",
        files={"file": ("orders.csv", b"amount\n10\n20\n", "text/csv")},
    )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "history_unavailable"


def test_analysis_evidence_is_scoped_to_authenticated_uid():
    analysis_id = "23d8ebda-f6a0-4e5d-9c38-4fa2a130ed98"
    evidence = {"row_count": 1}
    main._cache_evidence("owner", analysis_id, evidence)

    assert main._get_evidence("owner", analysis_id) == evidence
    assert main._get_evidence("other-user", analysis_id) is None


def test_missing_bearer_token_is_rejected():
    with pytest.raises(HTTPException) as exc:
        main._current_user(None)

    assert exc.value.status_code == 401


def test_firebase_token_uid_is_used_not_client_supplied_uid(monkeypatch):
    monkeypatch.setattr(
        main, "_verify_firebase_id_token", lambda token: {"uid": "verified-user"}
    )

    assert main._current_user("Bearer valid-token") == "verified-user"


def test_firebase_id_token_verification_checks_revocation(monkeypatch):
    application = object()
    verify = Mock(return_value={"uid": "verified-user"})
    monkeypatch.setattr(main, "_firebase_application", lambda: application)
    monkeypatch.setattr(main.firebase_auth, "verify_id_token", verify)

    assert main._verify_firebase_id_token("signed-token") == {
        "uid": "verified-user"
    }
    verify.assert_called_once_with(
        "signed-token", app=application, check_revoked=True
    )


def test_invalid_firebase_token_is_rejected(monkeypatch):
    def reject_token(_token):
        raise main._error(401, "invalid_token", "invalid")

    monkeypatch.setattr(main, "_verify_firebase_id_token", reject_token)

    with pytest.raises(HTTPException) as exc:
        main._current_user("Bearer invalid-token")

    assert exc.value.status_code == 401


def test_interpret_returns_unavailable_when_gemini_fails(client, monkeypatch):
    analysis_id = "23d8ebda-f6a0-4e5d-9c38-4fa2a130ed98"
    main._cache_evidence("firebase-user-1", analysis_id, {"row_count": 10})
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setattr(
        main,
        "_generate_interpretation",
        Mock(side_effect=RuntimeError("provider unavailable")),
    )

    response = client.post("/api/interpret", json={"analysis_id": analysis_id})

    assert response.status_code == 200
    assert response.json()["status"] == "unavailable"
    assert response.json()["interpretation"] is None


def test_interpret_cannot_access_another_users_analysis(client):
    analysis_id = "23d8ebda-f6a0-4e5d-9c38-4fa2a130ed98"
    main._cache_evidence("different-user", analysis_id, {"row_count": 10})

    response = client.post("/api/interpret", json={"analysis_id": analysis_id})

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "analysis_expired"


def test_analysis_route_requires_a_bearer_token():
    with TestClient(main.app) as unauthenticated_client:
        response = unauthenticated_client.post(
            "/api/analyze",
            files={"file": ("data.csv", b"value\n1\n", "text/csv")},
        )

    assert response.status_code == 401


def test_health_remains_public_and_available(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_authenticated_identity_endpoint_returns_verified_uid(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.json() == {"uid": "firebase-user-1"}


def test_history_endpoint_returns_user_scoped_records_in_newest_order(
    client, monkeypatch
):
    records = {
        "older-id": {
            "filename": "older.csv",
            "rowCount": 10,
            "columnCount": 2,
            "missingValues": 1,
            "status": "completed",
            "createdAt": 100,
        },
        "newer-id": {
            "filename": "newer.csv",
            "rowCount": 20,
            "columnCount": 3,
            "missingValues": 2,
            "status": "completed",
            "createdAt": 200,
        },
    }
    reference = Mock()
    reference.get.return_value = records
    monkeypatch.setattr(main, "_firebase_application", lambda: object())
    monkeypatch.setattr(main.firebase_db, "reference", Mock(return_value=reference))

    response = client.get("/api/history")

    assert response.status_code == 200
    assert [record["analysis_id"] for record in response.json()] == [
        "newer-id",
        "older-id",
    ]
    main.firebase_db.reference.assert_called_once_with(
        "/analysisHistory/firebase-user-1", app=main.firebase_db.reference.call_args.kwargs["app"]
    )


def test_history_endpoint_reports_database_failures(client, monkeypatch):
    reference = Mock()
    reference.get.side_effect = RuntimeError("database unavailable")
    monkeypatch.setattr(main, "_firebase_application", lambda: object())
    monkeypatch.setattr(main.firebase_db, "reference", Mock(return_value=reference))

    response = client.get("/api/history")

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "history_unavailable"


def test_cors_allows_authorization_header_for_frontend(client):
    response = client.options(
        "/api/analyze",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )

    assert response.status_code == 200
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


def test_analysis_metadata_contains_no_csv_contents(monkeypatch):
    reference = Mock()
    monkeypatch.setattr(main, "_firebase_application", lambda: object())
    monkeypatch.setattr(main.firebase_db, "reference", Mock(return_value=reference))
    analysis = main.Analysis(
        analysis_id="23d8ebda-f6a0-4e5d-9c38-4fa2a130ed98",
        file_name="orders.csv",
        analyzed_at="2026-10-23T00:00:00+00:00",
        row_count=3,
        column_count=2,
        duplicate_rows=0,
        columns=[
            main.ColumnQuality(
                name="amount", missing_count=1, missing_percent=33.33, dtype="int64"
            )
        ],
        numerical_statistics={},
        categorical_summaries={},
        correlations=[],
        potential_anomalies={},
        warnings=[],
        processing_time_ms=1.0,
    )

    main._persist_analysis_metadata("uid-1", analysis)

    path, = main.firebase_db.reference.call_args.args
    assert path == f"/analysisHistory/uid-1/{analysis.analysis_id}"
    metadata = reference.set.call_args.args[0]
    assert metadata == {
        "filename": "orders.csv",
        "rowCount": 3,
        "columnCount": 2,
        "missingValues": 1,
        "status": "completed",
        "createdAt": 1792713600000,
    }
    assert "contents" not in json.dumps(metadata)
