const apiBase = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
const REQUEST_TIMEOUT_MS = 30_000;

async function parseResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch {
    if (response.ok) {
      throw new Error("The server returned an invalid response.");
    }
  }
  if (!response.ok) {
    throw new Error(body?.error?.message || "The request could not be completed.");
  }
  if (!body || typeof body !== "object") {
    throw new Error("The server returned an invalid response.");
  }
  return body;
}

async function request(url, options, timeoutMessage) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return await parseResponse(response);
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function analyzeCsv(file) {
  const form = new FormData();
  form.append("file", file);
  return request(
    `${apiBase}/api/analyze`,
    { method: "POST", body: form },
    "Analysis timed out. Try a smaller CSV or try again.",
  );
}

export function interpretAnalysis(analysisId) {
  return request(
    `${apiBase}/api/interpret`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis_id: analysisId }),
    },
    "AI interpretation timed out. Your deterministic analysis is still available.",
  );
}
