export function buildReport(analysis, ai) {
  return {
    report_title: "DataSentry AI Analysis Report",
    generated_at: new Date().toISOString(),
    deterministic_analysis: analysis,
    ai_interpretation: ai?.available
      ? {
          generated_by: "Google Gemini",
          generated_at: new Date().toISOString(),
          ...ai.interpretation,
        }
      : null,
    ai_status: ai?.status || "pending",
    ai_message: ai?.message || null,
    notes: [
      "Statistics and potential anomalies are deterministically calculated from the uploaded CSV.",
      "Potential anomalies are statistical outliers, not confirmed errors or fraud.",
      "AI-generated explanations and recommendations are advisory and may contain errors.",
    ],
  };
}

export function downloadJson(report) {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `datasentry-report-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
