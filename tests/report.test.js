import test from "node:test";
import assert from "node:assert/strict";
import { buildReport, downloadJson } from "../src/report.js";

test("report contains actual analysis values and a labeled AI interpretation", () => {
  const analysis = {
    row_count: 4,
    columns: [{ name: "amount", missing_count: 1 }],
    numerical_statistics: { amount: { mean: 12.5 } },
  };
  const ai = {
    available: true,
    status: "available",
    interpretation: {
      executive_summary: "Amounts vary.",
      key_findings: ["One value is missing."],
      potential_risks: [],
      recommendations: ["Review the missing value."],
      limitations: [],
    },
  };

  const report = buildReport(analysis, ai);

  assert.equal(report.deterministic_analysis.row_count, 4);
  assert.equal(report.deterministic_analysis.numerical_statistics.amount.mean, 12.5);
  assert.equal(report.ai_interpretation.generated_by, "Google Gemini");
  assert.equal(report.ai_interpretation.executive_summary, "Amounts vary.");
  assert.ok(report.notes.some((note) => note.includes("not confirmed errors")));
  assert.equal(JSON.stringify(report).includes("GEMINI_API_KEY"), false);
});

test("report remains valid without an available AI response", () => {
  const report = buildReport({ row_count: 1 }, {
    available: false,
    status: "unavailable",
    message: "AI unavailable",
  });

  assert.equal(report.ai_interpretation, null);
  assert.equal(report.ai_status, "unavailable");
  assert.equal(report.ai_message, "AI unavailable");
});

test("JSON export triggers a browser download with a dated filename", () => {
  const previousDocument = globalThis.document;
  const originalCreateUrl = URL.createObjectURL;
  let clicked = false;
  let appended = false;
  let removed = false;
  const anchor = {
    click() { clicked = true; },
    remove() { removed = true; },
  };
  globalThis.document = {
    body: { append() { appended = true; } },
    createElement(tag) {
      assert.equal(tag, "a");
      return anchor;
    },
  };
  URL.createObjectURL = () => "blob:test-report";

  try {
    downloadJson({ report_title: "DataSentry AI Analysis Report" });
    assert.match(anchor.download, /^datasentry-report-\d{4}-\d{2}-\d{2}\.json$/);
    assert.equal(anchor.href, "blob:test-report");
    assert.equal(clicked, true);
    assert.equal(appended, true);
    assert.equal(removed, true);
  } finally {
    globalThis.document = previousDocument;
    URL.createObjectURL = originalCreateUrl;
  }
});
