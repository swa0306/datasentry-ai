// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

const { analyzeCsv, interpretAnalysis } = vi.hoisted(() => ({
  analyzeCsv: vi.fn(),
  interpretAnalysis: vi.fn(),
}));

vi.mock("../../src/api.js", () => ({ analyzeCsv, interpretAnalysis }));

import App from "../../src/App.jsx";

const analysis = {
  analysis_id: "12345678-1234-4234-8234-123456789012",
  file_name: "metrics.csv",
  analyzed_at: "2026-10-23T10:00:00.000Z",
  row_count: 2,
  column_count: 2,
  duplicate_rows: 0,
  columns: [
    { name: "amount", missing_count: 1, missing_percent: 50, dtype: "float64" },
    { name: "region", missing_count: 0, missing_percent: 0, dtype: "str" },
  ],
  numerical_statistics: {
    amount: {
      count: 1, mean: 12, median: 12, std_dev: 0, min: 12, max: 12, q1: 12, q3: 12,
    },
  },
  categorical_summaries: {},
  correlations: [],
  potential_anomalies: {},
  warnings: ["amount has missing values"],
  processing_time_ms: 2,
};

const unavailableAi = {
  available: false,
  status: "unavailable",
  message: "AI interpretation is unavailable.",
};

function chooseFile(file) {
  fireEvent.change(screen.getByLabelText(/Choose CSV file/), {
    target: { files: [file] },
  });
}

describe("DataSentry dashboard", () => {
  beforeEach(() => {
    analyzeCsv.mockReset();
    interpretAnalysis.mockReset();
    interpretAnalysis.mockResolvedValue(unavailableAi);
  });

  afterEach(() => cleanup());

  it("renders the dashboard and accessible file chooser", () => {
    render(<App />);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Data clarity, grounded in evidence." })).toBeTruthy();
    expect(screen.getByLabelText(/Choose CSV file/)).toBeTruthy();
  });

  it("rejects unsupported, empty, and oversized files before making an API request", () => {
    render(<App />);

    chooseFile(new File(["data"], "notes.txt", { type: "text/plain" }));
    expect(screen.getByRole("alert").textContent).toContain("Choose a CSV file");
    expect(analyzeCsv).not.toHaveBeenCalled();

    chooseFile(new File([], "empty.csv", { type: "text/csv" }));
    expect(screen.getByRole("alert").textContent).toContain("file is empty");
    expect(analyzeCsv).not.toHaveBeenCalled();

    chooseFile(new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.csv"));
    expect(screen.getByRole("alert").textContent).toContain("5 MB upload limit");
    expect(analyzeCsv).not.toHaveBeenCalled();
  });

  it("shows progress, prevents duplicate uploads, and renders returned analysis", async () => {
    let finishAnalysis;
    analyzeCsv.mockImplementation(() => new Promise((resolve) => {
      finishAnalysis = resolve;
    }));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /Try sample data/ }));
    expect(screen.getByRole("status").textContent).toContain("processed in memory");
    expect(screen.getByRole("heading", { name: "Taking a closer look…" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Analysis history/ }));
    fireEvent.click(screen.getByRole("button", { name: /Dashboard/ }));
    expect(analyzeCsv).toHaveBeenCalledTimes(1);

    finishAnalysis(analysis);
    expect(await screen.findByRole("heading", { name: "Your dataset, at a glance" })).toBeTruthy();
    expect(screen.getByText("metrics.csv")).toBeTruthy();
    expect(screen.getByText("50.0%")).toBeTruthy();
    expect(screen.getByText("AI interpretation is unavailable.")).toBeTruthy();
    expect(interpretAnalysis).toHaveBeenCalledWith(analysis.analysis_id);
  });

  it("shows API failures and lets the user dismiss them", async () => {
    analyzeCsv.mockRejectedValue(new Error("API is unavailable"));
    render(<App />);

    chooseFile(new File(["amount\n1\n"], "metrics.csv", { type: "text/csv" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("API is unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss error" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("lists successful analyses in session history and reopens the selected result", async () => {
    analyzeCsv.mockResolvedValue(analysis);
    render(<App />);

    chooseFile(new File(["amount\n12\n"], "metrics.csv", { type: "text/csv" }));
    await screen.findByRole("heading", { name: "Your dataset, at a glance" });
    fireEvent.click(screen.getByRole("button", { name: /Analysis history/ }));
    const savedAnalysis = await screen.findByRole("button", { name: /metrics\.csv/ });
    expect(savedAnalysis.textContent).toContain("2 rows");

    fireEvent.click(savedAnalysis);
    expect(await screen.findByRole("heading", { name: "Your dataset, at a glance" })).toBeTruthy();
    expect(screen.getByText("metrics.csv")).toBeTruthy();
  });
});
