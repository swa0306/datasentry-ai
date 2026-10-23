// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeCsv, interpretAnalysis } from "../../src/api.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("frontend API client", () => {
  it("sends CSV as multipart data without setting a boundary header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ analysis_id: "analysis-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["amount\n12\n"], "metrics.csv", { type: "text/csv" });

    await expect(analyzeCsv(file)).resolves.toEqual({ analysis_id: "analysis-1" });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/api/analyze");
    expect(options.method).toBe("POST");
    expect(options.body).toBeInstanceOf(FormData);
    expect(options.body.get("file").name).toBe("metrics.csv");
    expect(options.headers).toBeUndefined();
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends the analysis ID for interpretation and surfaces API errors", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: "unavailable" }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Analysis expired." } }),
      });
    vi.stubGlobal("fetch", fetchMock);

    await expect(interpretAnalysis("analysis-1")).resolves.toEqual({ status: "unavailable" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ analysis_id: "analysis-1" });
    await expect(interpretAnalysis("expired")).rejects.toThrow("Analysis expired.");
  });

  it("rejects invalid JSON from a successful API response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError("invalid"); },
    }));

    await expect(analyzeCsv(new File(["x"], "x.csv"))).rejects.toThrow(
      "The server returned an invalid response.",
    );
  });

  it("aborts API requests that exceed the client timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, { signal }) => new Promise((_, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    })));

    const request = analyzeCsv(new File(["amount\n1\n"], "metrics.csv"));
    const result = expect(request).rejects.toThrow("Analysis timed out.");
    await vi.advanceTimersByTimeAsync(30_000);
    await result;
  });
});
