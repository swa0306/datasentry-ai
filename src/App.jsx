import { useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  getIdToken,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "@firebase/auth";
import { auth, configurationError } from "./firebase.js";

const apiBase = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000";

async function api(path, user, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${await getIdToken(user)}`,
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message || `Request failed (${response.status})`);
  return data;
}

function App() {
  const [user, setUser] = useState(null);
  const [restoring, setRestoring] = useState(true);
  const [page, setPage] = useState("overview");
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [history, setHistory] = useState([]);
  const [interpretation, setInterpretation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const picker = useRef(null);

  useEffect(() => {
    if (!auth) {
      setRestoring(false);
      return undefined;
    }
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setRestoring(false);
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return undefined;
    }
    let active = true;
    setBusy(true);
    api("/api/history", user)
      .then((records) => active && setHistory(records))
      .catch((problem) => active && setError(problem.message))
      .finally(() => active && setBusy(false));
    return () => { active = false; };
  }, [user]);

  async function authenticate(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (register) await createUserWithEmailAndPassword(auth, email, password);
      else await signInWithEmailAndPassword(auth, email, password);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  async function analyze(event) {
    event.preventDefault();
    if (!file || !file.name.toLowerCase().endsWith(".csv") || file.size > 5 * 1024 * 1024) {
      setError("Choose a CSV file smaller than 5 MB.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    setAnalysis(null);
    setInterpretation(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const result = await api("/api/analyze", user, { method: "POST", body: form });
      setAnalysis(result);
      setHistory(await api("/api/history", user));
      setNotice("Analysis completed. CSV contents were not retained.");
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  async function explain() {
    setBusy(true);
    setError("");
    try {
      setInterpretation(await api("/api/interpret", user, {
        method: "POST",
        body: JSON.stringify({ analysis_id: analysis.analysis_id }),
      }));
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  }

  if (restoring) return <main className="center"><span className="spinner" /> Restoring session…</main>;
  if (configurationError) return (
    <main className="center"><section className="card setup">
      <Brand /><span className="eyebrow">FIREBASE SETUP REQUIRED</span>
      <h1>Connect your Firebase web app</h1><p>{configurationError}</p>
      <p>Copy the web app configuration from Firebase Console to a local <code>.env</code> file, then restart Vite.</p>
    </section></main>
  );
  if (!user) return (
    <main className="auth-layout">
      <section className="card auth-card">
        <Brand /><span className="eyebrow">YOUR PRIVATE DATA WORKSPACE</span>
        <h1>{register ? "Create your account" : "Welcome back"}</h1>
        <p className="muted">Sign in to analyze datasets and review your history.</p>
        <form onSubmit={authenticate}>
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" minLength="6" autoComplete={register ? "new-password" : "current-password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="error" role="alert">{error}</p>}
          <button disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
        </form>
        <button className="text-button" type="button" onClick={() => { setRegister(!register); setError(""); }}>
          {register ? "Already registered? Sign in" : "Create an account"}
        </button>
      </section>
      <aside className="auth-aside"><span className="eyebrow">CLARITY IN EVERY COLUMN</span><h2>Understand your data before it matters.</h2><p>Explore missing values, duplicates, distributions, and outliers — without storing your CSV.</p></aside>
    </main>
  );

  const rowsTotal = history.reduce((sum, item) => sum + item.row_count, 0);
  return (
    <div className="layout">
      <aside className="sidebar"><Brand /><span className="eyebrow">WORKSPACE</span>
        <button className={page === "overview" ? "nav active" : "nav"} onClick={() => setPage("overview")}>▦ &nbsp; Overview</button>
        <button className={page === "history" ? "nav active" : "nav"} onClick={() => setPage("history")}>◷ &nbsp; Analysis history <span className="count">{history.length}</span></button>
        <button className={page === "settings" ? "nav active" : "nav"} onClick={() => setPage("settings")}>⚙ &nbsp; Settings</button>
        <div className="sidebar-bottom"><span className="secure"><i /> Secure workspace</span><div className="account"><div className="avatar">{user.email?.[0]?.toUpperCase()}</div><span>{user.email}<small>Personal account</small></span><button className="logout" title="Sign out" onClick={() => signOut(auth)}>↗</button></div></div>
      </aside>
      <main className="main">
        <header><span>Workspace <b>/</b> {page}</span><button className="secondary" disabled={busy} onClick={() => { setBusy(true); api("/api/history", user).then(setHistory).catch((e) => setError(e.message)).finally(() => setBusy(false)); }}>↻ Refresh</button></header>
        <div className="content">
          {error && <div className="notice error" role="alert">{error}<button onClick={() => setError("")}>×</button></div>}
          {notice && <div className="notice success" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
          {page === "settings" ? <section className="card"><span className="eyebrow">ACCOUNT</span><h1>Settings</h1><p className="muted">Signed in as {user.email}</p><p className="muted">Firebase email/password authentication. Uploaded CSV contents are processed temporarily and not saved.</p><button className="secondary" onClick={() => signOut(auth)}>Sign out</button></section> : <>
            <section className="page-title"><div><span className="eyebrow">{page === "overview" ? "DATA QUALITY, AT A GLANCE" : "YOUR WORK"}</span><h1>{page === "overview" ? "Good to see you." : "Analysis history."}</h1><p className="muted">{page === "overview" ? "A clear picture of your data starts here." : "Completed analyses for your account."}</p></div><span className="session">● &nbsp; Secure session</span></section>
            {page === "overview" && <div className="stats">
              <Stat label="Analyses saved" value={history.length} detail="In your private history" icon="▤" />
              <Stat label="Rows analyzed" value={rowsTotal.toLocaleString()} detail="Across completed analyses" icon="⌗" />
              <Stat label="CSV retention" value="None" detail="Processed in memory only" icon="◈" />
            </div>}
            {page === "overview" && <section className="card upload"><div className="section-title"><div><span className="eyebrow">NEW ANALYSIS</span><h2>Analyze a dataset</h2></div><span className="limit">CSV · Up to 5 MB</span></div>
              <form onSubmit={analyze}><input ref={picker} className="hidden" type="file" accept=".csv,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                <button className={`dropzone ${file ? "selected" : ""}`} type="button" onClick={() => picker.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); setFile(e.dataTransfer.files[0] || null); }}>
                  <span className="upload-icon">↑</span><strong>{file?.name || "Drop your CSV here or browse"}</strong><small>{file ? `${(file.size / 1024).toFixed(1)} KB selected` : "UTF-8 CSV · file is not stored"}</small>
                </button>
                <div className="form-actions"><span className="muted">Your file is analyzed in memory and discarded.</span><button disabled={busy || !file}>{busy ? "Analyzing…" : "Analyze dataset →"}</button></div>
              </form>
            </section>}
            {analysis && page === "overview" && <section className="card">
              <div className="section-title"><div><span className="eyebrow">ANALYSIS COMPLETE</span><h2>{analysis.file_name}</h2><span className="muted">{analysis.row_count.toLocaleString()} rows · {analysis.column_count} columns</span></div><button className="secondary" onClick={() => download(analysis)}>↓ JSON report</button></div>
              <div className="stats compact"><Stat label="Duplicate rows" value={analysis.duplicate_rows} /><Stat label="Missing values" value={analysis.columns.reduce((n, c) => n + c.missing_count, 0)} /><Stat label="Numeric fields" value={Object.keys(analysis.numerical_statistics).length} /></div>
              <h3>Column quality</h3><div className="table-scroll"><table><thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>Missing %</th></tr></thead><tbody>{analysis.columns.map((c) => <tr key={c.name}><td>{c.name}</td><td>{c.dtype}</td><td>{c.missing_count}</td><td>{c.missing_percent}%</td></tr>)}</tbody></table></div>
              {Object.keys(analysis.numerical_statistics).length > 0 && <><h3>Numerical summary</h3><div className="table-scroll"><table><thead><tr><th>Column</th><th>Mean</th><th>Median</th><th>Min</th><th>Max</th></tr></thead><tbody>{Object.entries(analysis.numerical_statistics).map(([name, s]) => <tr key={name}><td>{name}</td><td>{s.mean.toFixed(2)}</td><td>{s.median.toFixed(2)}</td><td>{s.min}</td><td>{s.max}</td></tr>)}</tbody></table></div></>}
              {analysis.warnings.length > 0 && <ul>{analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
              <div className="ai-row"><div><strong>AI interpretation</strong><p className="muted">Optional explanation based on calculated evidence.</p></div><button className="secondary" disabled={busy} onClick={explain}>{busy ? "Working…" : "Explain results"}</button></div>
              {interpretation && <div className="interpretation">{interpretation.interpretation ? <><h3>Summary</h3><p>{interpretation.interpretation.executive_summary}</p>{interpretation.interpretation.key_findings.map((finding) => <p key={finding}>• {finding}</p>)}</> : <p>{interpretation.message}</p>}</div>}
            </section>}
            <section className="card"><div className="section-title"><div><span className="eyebrow">YOUR WORK</span><h2>{page === "overview" ? "Recent analyses" : "All analyses"}</h2></div><span className="muted">{busy ? "Loading…" : `${history.length} records`}</span></div><History records={page === "overview" ? history.slice(0, 5) : history} loading={busy} /></section>
          </>}
          <footer>DataSentry AI <span>·</span> Your data stays yours.</footer>
        </div>
      </main>
    </div>
  );
}

function Brand() { return <div className="brand"><span className="brand-mark">D</span> DataSentry <b>AI</b></div>; }
function Stat({ label, value, detail, icon }) { return <article className="stat"><span className="stat-icon">{icon}</span><small>{label}</small><strong>{value}</strong>{detail && <span className="muted">{detail}</span>}</article>; }
function History({ records, loading }) {
  if (loading && !records.length) return <div className="empty"><span className="spinner" /> Loading your history…</div>;
  if (!records.length) return <div className="empty"><strong>No analyses yet</strong><span className="muted">Upload a CSV to see your first result here.</span></div>;
  return <div className="table-scroll"><table><thead><tr><th>Dataset</th><th>Rows</th><th>Columns</th><th>Missing</th><th>Analyzed</th><th>Status</th></tr></thead><tbody>{records.map((item) => <tr key={item.analysis_id}><td><span className="filetag">CSV</span>{item.filename}</td><td>{item.row_count.toLocaleString()}</td><td>{item.column_count}</td><td>{item.missing_values}</td><td>{new Date(item.created_at).toLocaleString()}</td><td><span className="complete">Completed</span></td></tr>)}</tbody></table></div>;
}
function download(data) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${data.file_name.replace(/\.csv$/i, "")}-report.json`;
  link.click();
  URL.revokeObjectURL(url);
}
export default App;
