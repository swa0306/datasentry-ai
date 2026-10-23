import React, { useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  BarChart3,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FileSpreadsheet,
  Fingerprint,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { analyzeCsv, interpretAnalysis } from "./api.js";
import { buildReport, downloadJson } from "./report.js";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const sampleCsv = `week,visits,revenue,conversion_rate,region
Week 1,820,16400,3.2,North
Week 2,910,18100,3.4,North
Week 3,880,17500,3.3,South
Week 4,970,19400,3.5,East
Week 5,1030,20700,3.6,West
Week 6,990,19900,3.5,South
Week 7,,21400,3.7,North
Week 8,1120,22400,3.8,East
Week 9,1080,21600,3.7,West
Week 10,1210,24200,3.9,North
Week 11,1160,23200,3.8,South
Week 12,1290,25800,4.0,East
Week 13,1240,24900,3.9,West
Week 14,1370,27400,4.1,North
Week 15,1320,26300,4.0,South
Week 16,1460,29100,4.2,East
Week 17,1410,28300,4.1,West
Week 18,1540,30800,4.3,North
Week 19,1490,29700,4.2,South
Week 20,9000,180000,4.4,East
Week 21,1580,31600,4.3,West
Week 22,1630,32600,4.4,North
Week 23,1570,31200,4.2,South
Week 24,1690,33800,4.5,East`;

const number = (value, digits = 1) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);

function MetricCard({ icon: Icon, label, value, note, color }) {
  return (
    <article className="metric-card">
      <span className={`metric-icon ${color}`}><Icon size={18} /></span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function PanelTitle({ kicker, title, detail }) {
  return (
    <div className="panel-title">
      <div><span className="kicker">{kicker}</span><h2>{title}</h2></div>
      {detail && <span className="panel-detail">{detail}</span>}
    </div>
  );
}

function App() {
  const fileInput = useRef(null);
  const requestInProgress = useRef(false);
  const [analysis, setAnalysis] = useState(null);
  const [ai, setAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [expandedStats, setExpandedStats] = useState(false);
  const [page, setPage] = useState("dashboard");
  const [history, setHistory] = useState([]);

  async function analyze(file) {
    if (requestInProgress.current) return;
    setError("");
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Choose a CSV file with a .csv extension.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (!file.size) {
      setError("This file is empty. Choose a CSV with a header and data rows.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError("This file is larger than the 5 MB upload limit.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }

    requestInProgress.current = true;
    setBusy(true);
    setAnalysis(null);
    setAi(null);
    try {
      const result = await analyzeCsv(file);
      setAnalysis(result);
      let interpretation;
      try {
        interpretation = await interpretAnalysis(result.analysis_id);
      } catch (problem) {
        interpretation = {
          available: false,
          status: "unavailable",
          message: problem.message || "AI interpretation is temporarily unavailable.",
        };
      }
      setAi(interpretation);
      setHistory((items) => [
        { analysis: result, ai: interpretation },
        ...items.filter((item) => item.analysis.analysis_id !== result.analysis_id),
      ].slice(0, 10));
      setPage("dashboard");
    } catch (problem) {
      setError(problem.message || "We couldn’t analyze this file. Check your connection and try again.");
    } finally {
      requestInProgress.current = false;
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    analyze(event.dataTransfer.files?.[0]);
  }

  function trySample() {
    analyze(new File([sampleCsv], "weekly-business-metrics.csv", { type: "text/csv" }));
  }

  function exportReport() {
    if (analysis) downloadJson(buildReport(analysis, ai));
  }

  function openHistoryItem(item) {
    setAnalysis(item.analysis);
    setAi(item.ai);
    setError("");
    setPage("dashboard");
  }

  const columns = analysis?.columns || [];
  const numeric = Object.entries(analysis?.numerical_statistics || {});
  const shownNumeric = expandedStats ? numeric : numeric.slice(0, 4);
  const missingCount = columns.reduce((sum, item) => sum + item.missing_count, 0);
  const anomalies = Object.entries(analysis?.potential_anomalies || {});
  const anomalyCount = anomalies.reduce((sum, [, item]) => sum + item.outlier_count, 0);
  const qualityFlags = missingCount + (analysis?.duplicate_rows || 0);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="sidebar-brand" href="#" aria-label="DataSentry AI home" onClick={() => setPage("dashboard")}>
          <span className="brand-mark"><Fingerprint size={21} /></span>
          <span>DataSentry <b>AI</b></span>
        </a>
        <span className="sidebar-label">WORKSPACE</span>
        <nav className="sidebar-nav" aria-label="Main navigation">
          <button className={page === "dashboard" ? "active" : ""} onClick={() => setPage("dashboard")}>
            <LayoutDashboard size={17} /> Dashboard
          </button>
          <button className={page === "history" ? "active" : ""} onClick={() => setPage("history")}>
            <Clock3 size={17} /> Analysis history <span>{history.length}</span>
          </button>
        </nav>
        <div className="sidebar-note"><ShieldCheck size={16} /><span><b>Private by design</b><small>CSV files are not stored</small></span></div>
      </aside>
      <header className="topbar">
        <a className="brand" href="#" aria-label="DataSentry AI home">
          <span className="brand-mark"><Fingerprint size={21} /></span>
          <span>DataSentry <b>AI</b></span>
        </a>
        <span className="privacy-pill"><ShieldCheck size={15} /> Private by design</span>
      </header>

      <main className="main-content">
        {page === "history" ? (
          <section className="history-view">
            <div className="breadcrumb">Workspace <span>/</span> <strong>Analysis history</strong></div>
            <div className="history-heading">
              <div><p className="kicker">YOUR RECENT WORK</p><h1>Analysis history</h1><p>Recent analyses remain available for this browser session only.</p></div>
              <button className="button button-primary" onClick={() => setPage("dashboard")}><Upload size={15} /> New analysis</button>
            </div>
            {history.length ? (
              <div className="history-list">
                {history.map((item) => (
                  <button className="history-item" key={item.analysis.analysis_id} onClick={() => openHistoryItem(item)}>
                    <span className="history-file"><FileSpreadsheet size={18} /></span>
                    <span className="history-info"><b>{item.analysis.file_name}</b><small>{new Date(item.analysis.analyzed_at).toLocaleString()}</small></span>
                    <span className="history-stats">{number(item.analysis.row_count, 0)} rows <i /> {number(item.analysis.column_count, 0)} columns</span>
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="history-empty"><Clock3 size={24} /><h2>No analyses yet</h2><p>Upload a CSV to see its results here during this session.</p><button className="button button-primary" onClick={() => setPage("dashboard")}><Upload size={15} /> Analyze a CSV</button></div>
            )}
          </section>
        ) : (
          <>
        <div className="breadcrumb">Workspace <span>/</span> <strong>Data analysis</strong></div>
        <section className="hero-row">
          <div>
            <p className="kicker">DATA QUALITY, AT A GLANCE</p>
            <h1>Data clarity, grounded in evidence.</h1>
            <p className="hero-copy">Find the signal in your CSV: reliable metrics, quality checks, and understandable next steps.</p>
          </div>
          {analysis && (
            <button className="button button-quiet" onClick={() => { setAnalysis(null); setAi(null); setError(""); }}>
              <RefreshCw size={15} /> New analysis
            </button>
          )}
        </section>

        {error && (
          <div className="alert error-alert" role="alert">
            <AlertCircle size={18} /><span>{error}</span>
            <button className="icon-button" aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button>
          </div>
        )}

        {!analysis && (
          <>
            <section className="welcome-panel">
              <div>
                <span className="welcome-label"><span /> YOUR DATA, MADE CLEAR</span>
                <h2>Make sense of your data,<br /><em>not just your numbers.</em></h2>
                <p>Check data quality, explore numerical patterns, and get useful guidance without needing a spreadsheet expert.</p>
                <div className="welcome-benefits">
                  <span><Check size={15} /> Actual calculations</span>
                  <span><ShieldCheck size={15} /> Files aren’t stored</span>
                </div>
              </div>
              <div className="welcome-visual" aria-hidden="true">
                <div className="visual-orbit orbit-a" /><div className="visual-orbit orbit-b" />
                <div className="visual-card">
                  <div className="visual-card-head"><span /><span /><span /><small>DATA CHECK</small></div>
                  <div className="visual-chart">
                    {[34, 52, 43, 69, 58, 77, 66, 91].map((height, i) => <i key={i} style={{ height: `${height}%` }} />)}
                    <svg viewBox="0 0 180 70" preserveAspectRatio="none"><polyline points="0,59 30,46 56,52 82,35 109,40 133,21 157,27 180,8" /></svg>
                  </div>
                  <div className="visual-card-foot">Pattern detected <b><Check size={12} /> Verified</b></div>
                </div>
                <div className="visual-chip"><Sparkles size={15} /><span><b>Insight ready</b><small>Evidence-backed</small></span></div>
              </div>
            </section>
            <section
              className={`upload-panel ${dragging ? "dragging" : ""}`}
              onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
              onDrop={onDrop}
              aria-label="Upload a CSV file"
            >
              <input
                ref={fileInput}
                id="csv-file"
                className="visually-hidden"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => analyze(event.target.files?.[0])}
                disabled={busy}
              />
              <div className="upload-icon">{busy ? <LoaderCircle className="spin" size={22} /> : <Upload size={21} />}</div>
              <div className="upload-copy">
                <h2>{busy ? "Taking a closer look…" : "Start with a CSV file"}</h2>
                <p>{busy ? "Checking quality and calculating evidence-based statistics." : "Drop your file here, or choose one from your device."}</p>
                <div className="upload-actions">
                  <label htmlFor="csv-file" className={`button button-primary ${busy ? "disabled" : ""}`}>
                    <FileSpreadsheet size={16} />{busy ? "Analyzing…" : "Choose CSV file"}
                  </label>
                  {!busy && <><span className="or-text">or</span><button className="sample-button" onClick={trySample}>Try sample data <ArrowUpRight size={14} /></button></>}
                </div>
              </div>
              <div className="upload-meta"><span>CSV format</span><i /><span>Up to 5 MB</span><i /><span>No file storage</span></div>
            </section>
            {busy && <p className="processing" role="status" aria-live="polite"><LoaderCircle className="spin" size={15} /> Files are processed in memory. This can take a few seconds.</p>}
          </>
        )}

        {analysis && (
          <div className="results">
            <section className="dataset-heading">
              <div>
                <span className="file-name"><FileSpreadsheet size={16} /> {analysis.file_name} <b>ANALYZED</b></span>
                <h2>Your dataset, at a glance</h2>
                <p>{new Date(analysis.analyzed_at).toLocaleString()} <span>·</span> Processed in {number(analysis.processing_time_ms, 0)} ms</p>
              </div>
              <button className="button button-outline" onClick={exportReport}><ArrowDownToLine size={16} /> Download JSON</button>
            </section>

            <section className="metric-grid" aria-label="Dataset summary">
              <MetricCard icon={BarChart3} label="Data points" value={number(analysis.row_count, 0)} note="Rows analyzed" color="teal" />
              <MetricCard icon={FileSpreadsheet} label="Variables" value={number(analysis.column_count, 0)} note={`${numeric.length} numerical`} color="blue" />
              <MetricCard icon={qualityFlags ? AlertCircle : ShieldCheck} label="Quality flags" value={number(qualityFlags, 0)} note={`${missingCount} missing · ${analysis.duplicate_rows} duplicate`} color="amber" />
              <MetricCard icon={Activity} label="Potential outliers" value={number(anomalyCount, 0)} note="Tukey IQR method" color="violet" />
            </section>

            {!!analysis.warnings.length && (
              <section className="warning-panel">
                <div className="warning-heading"><AlertCircle size={17} /><div><h3>Worth a closer look</h3><p>Quality signals are prompts to investigate, not proof of incorrect records.</p></div></div>
                <ul>{analysis.warnings.map((warning, i) => <li key={`${warning}-${i}`}>{warning}</li>)}</ul>
              </section>
            )}

            <section className="panel">
              <PanelTitle kicker="DATA QUALITY" title="Completeness by column" detail={`${columns.length} columns checked`} />
              {columns.some((item) => item.missing_count > 0) ? (
                <div className="missing-chart">
                  {columns.filter((item) => item.missing_count > 0).sort((a, b) => b.missing_percent - a.missing_percent).slice(0, 8).map((item) => (
                    <div className="missing-row" key={item.name}>
                      <span title={item.name}>{item.name}</span>
                      <div className="bar-track" role="img" aria-label={`${item.missing_percent}% missing values in ${item.name}`}><i className={item.missing_percent >= 20 ? "high" : ""} style={{ width: `${Math.max(item.missing_percent, 2)}%` }} /></div>
                      <b>{number(item.missing_percent, 1)}%</b>
                    </div>
                  ))}
                </div>
              ) : <div className="good-state"><span><Check size={15} /></span><div><b>No missing values found</b><p>Every column has a value in every row.</p></div></div>}
              <div className="table-scroll">
                <table><thead><tr><th scope="col">Column</th><th scope="col">Inferred type</th><th scope="col">Missing values</th><th scope="col">Completeness</th></tr></thead>
                  <tbody>{columns.map((item) => <tr key={item.name}><td className="strong-cell">{item.name}</td><td><span className="type-label">{item.dtype}</span></td><td>{number(item.missing_count, 0)}</td><td><span className={item.missing_count ? "quality-bad" : "quality-good"}>{number(item.missing_percent, 1)}%</span></td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section className="panel">
              <PanelTitle kicker="NUMERICAL PROFILE" title="What the numbers say" detail={`${numeric.length} numerical columns`} />
              {shownNumeric.length ? (
                <>
                  <div className="numeric-grid">{shownNumeric.map(([name, stats]) => {
                    const span = stats.max - stats.min;
                    const marker = span ? Math.max(2, Math.min(98, ((stats.median - stats.min) / span) * 100)) : 50;
                    return (
                      <article className="numeric-card" key={name}>
                        <div className="numeric-title"><h3 title={name}>{name}</h3><span>{number(stats.count, 0)} values</span></div>
                        <div className="range-track" aria-label={`${name} range ${number(stats.min)} to ${number(stats.max)}`}><i style={{ left: `${marker}%` }} /></div>
                        <div className="range-labels"><span>{number(stats.min)}</span><span>Median {number(stats.median)}</span><span>{number(stats.max)}</span></div>
                        <div className="numeric-values"><span><small>Average</small><b>{number(stats.mean)}</b></span><span><small>Median</small><b>{number(stats.median)}</b></span><span><small>Std. dev.</small><b>{number(stats.std_dev)}</b></span></div>
                      </article>
                    );
                  })}</div>
                  {numeric.length > 4 && <button className="expand-button" onClick={() => setExpandedStats((value) => !value)}>{expandedStats ? "Show fewer" : `Show all ${numeric.length} columns`}<ChevronDown size={15} className={expandedStats ? "rotate" : ""} /></button>}
                </>
              ) : <div className="inline-empty"><BarChart3 size={18} />No numerical columns were found in this dataset.</div>}
              {!!Object.keys(analysis.categorical_summaries || {}).length && (
                <div className="category-section">
                  <h3>Categorical columns</h3>
                  <div className="category-grid">{Object.entries(analysis.categorical_summaries).map(([name, summary]) => (
                    <div className="category-card" key={name}><b>{name}</b><span>{number(summary.unique_count, 0)} unique values · frequent category counts only</span><ul>{summary.top_value_counts.map((count, index) => <li key={index}><span>Category {index + 1}</span><strong>{count}</strong></li>)}</ul></div>
                  ))}</div>
                </div>
              )}
            </section>

            <div className="results-grid">
              <section className="panel">
                <PanelTitle kicker="RELATIONSHIPS" title="Correlations" detail="Pearson coefficient" />
                {analysis.correlations.length ? <div className="correlation-list">
                  {analysis.correlations.slice(0, 8).map((item) => <div className="correlation-row" key={`${item.column_a}-${item.column_b}`}>
                    <div className="correlation-names"><span>{item.column_a}</span><ArrowUpRight size={13} /><span>{item.column_b}</span></div>
                    <div className="correlation-track"><i className={item.value < 0 ? "negative" : ""} style={{ width: `${Math.abs(item.value) * 100}%` }} /></div>
                    <b>{item.value > 0 ? "+" : ""}{item.value.toFixed(2)}</b>
                  </div>)}
                  <p className="panel-footnote">Correlation describes association, not causation.</p>
                </div> : <div className="inline-empty"><CircleHelp size={17} />At least two numerical columns are needed for correlations.</div>}
              </section>
              <section className="panel">
                <PanelTitle kicker="STATISTICAL SIGNALS" title="Potential anomalies" detail="Tukey IQR" />
                {anomalyCount ? <div className="anomaly-list">{anomalies.map(([name, item]) => <details key={name}>
                  <summary><i /><b>{name}</b><span>{item.outlier_count} potential</span><ChevronDown size={15} /></summary>
                  <p>Values outside the 1.5×IQR range. A statistical flag, not a confirmed error.</p>
                  <ul>{item.examples.slice(0, 5).map((example) => <li key={`${example.row_index}-${example.value}`}>Row {example.row_index}<b>{number(example.value)}</b></li>)}</ul>
                </details>)}</div> : <div className="good-state"><span><Check size={15} /></span><div><b>No potential outliers flagged</b><p>The 1.5×IQR rule is applied to columns with 4+ values.</p></div></div>}
              </section>
            </div>

            <section className={`ai-panel ${ai?.available ? "ai-available" : ""}`}>
              <div className="ai-header">
                <span className="ai-icon"><Sparkles size={18} /></span>
                <div><div className="ai-title"><h2>AI interpretation</h2><span>{ai?.available ? "EVIDENCE-BASED" : "OPTIONAL"}</span></div>
                  <p>{ai?.available ? "Gemini explains calculated results; all metrics above remain deterministic." : ai?.message || "Getting a plain-language explanation from the calculated metrics…"}</p></div>
              </div>
              {ai?.available && ai.interpretation ? <div className="ai-content">
                <p className="executive-summary">{ai.interpretation.executive_summary}</p>
                <div className="ai-columns">{[
                  ["Key findings", ai.interpretation.key_findings],
                  ["Practical next steps", ai.interpretation.recommendations],
                  ["Risks to consider", ai.interpretation.potential_risks],
                  ["Limitations", ai.interpretation.limitations],
                ].filter(([, items]) => items?.length).map(([title, items]) => <div key={title}><h3>{title}</h3><ul>{items.map((item, index) => <li key={`${title}-${index}`}>{item}</li>)}</ul></div>)}</div>
              </div> : <div className="ai-fallback"><ShieldCheck size={17} /><p>Your deterministic analysis is ready even when AI interpretation is unavailable.</p></div>}
              <div className="ai-foot"><span><ShieldCheck size={14} /> AI advice is advisory, not verified fact.</span><span>Only calculated summaries are sent to Gemini.</span></div>
            </section>

            <section className="report-banner"><span className="report-icon"><ArrowDownToLine size={18} /></span><div><h3>Take your findings with you</h3><p>Export the measured results and any available AI interpretation as JSON.</p></div><button className="button button-primary" onClick={exportReport}>Download report <ArrowDownToLine size={15} /></button></section>
          </div>
        )}

        <footer className="footer"><a className="footer-brand" href="#"><Fingerprint size={15} /> DataSentry AI</a><span>Files are processed in memory and not stored.</span><span>Potential outliers are not confirmed errors.</span></footer>
          </>
        )}
      </main>
    </div>
  );
}

export default App;
