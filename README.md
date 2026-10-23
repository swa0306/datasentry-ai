# DataSentry AI

DataSentry AI helps students, small businesses, and organizations turn CSVs into understandable, evidence-based reports. It combines deterministic Python/Pandas analysis with optional Gemini explanations; it is an analysis tool, not a generic chatbot.

## What works

- Bounded CSV upload with server-side extension, encoding, header, row, column, and structure validation.
- Deterministic missing-value, duplicate-row, numerical, categorical, Pearson correlation, and potential-outlier analysis.
- Tukey's 1.5×IQR rule for potential anomalies; statistical flags are not confirmed errors or fraud.
- Categorical summaries include unique counts and anonymized top-category frequencies; raw category labels and source rows are not returned.
- Optional Google Gemini interpretation of calculated evidence, with validated JSON output and graceful fallback.
- Responsive dark dashboard with measured metrics, charts, quality warnings, loading/error/empty states, session-only analysis history, and downloadable JSON reports.
- Uploads are processed in memory. The backend retains only bounded calculated evidence in a short-lived process cache so `/api/interpret` can use server-computed results; it does not persist uploaded files.

There is no user login, database, Firebase dependency, or permanent analysis history in this prototype. The recent-history view holds calculated results in browser memory for the current page session only; refreshing or closing the page clears it.

## Architecture

```text
React + Vite browser
  ├── POST /api/analyze (CSV multipart upload)
  ├── POST /api/interpret (short-lived analysis ID)
  └── download JSON report locally
             │
FastAPI + Pydantic
  ├── CSV validation and resource limits
  ├── Pandas deterministic analysis
  └── Optional Google Gemini API (server-side only)
```

Deterministic metrics are calculated by Pandas. Gemini receives a compact summary of those results—not the uploaded CSV—and only explains them. Dataset-derived values are treated as untrusted input, and validated AI output is presented as advisory. Gemini's current model setting defaults to `gemini-4-argon`, listed in the [official Gemini models documentation](https://ai.google.dev/gemini-api/docs/latest-model); override it with `GEMINI_MODEL` if needed.

## Requirements

- Python 3.10+
- Node.js 20+
- A Gemini API key is optional. Without it, deterministic analysis and report export still work.

## Setup

From the workspace root, create a local environment file:

```powershell
Copy-Item .env.example .env
```

Install the Python dependencies and start the backend:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
uvicorn backend.main:app --reload
```

In a second terminal, install and start the frontend:

```powershell
npm install
npm run dev
```

Open the Vite URL printed by the dev server (normally `http://localhost:5173`). The API is normally at `http://localhost:8000`; `VITE_API_BASE_URL` can override the browser's API URL. Set `GEMINI_API_KEY` in the backend environment to enable AI interpretation. Never use a `VITE_` variable for the Gemini key.

## API

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/health` | Backend health check |
| `POST` | `/api/analyze` | Validate and analyze one CSV; send multipart field `file` |
| `POST` | `/api/interpret` | Optional interpretation; send `{"analysis_id":"..."}` |

`/api/analyze` returns a random analysis ID and calculated analysis. A bounded in-memory cache keeps the corresponding compact evidence for up to 30 minutes (and at most 100 analyses) for `/api/interpret`. Restarting the process clears it. The frontend builds the JSON report from returned analysis and interpretation; there is no persistent report endpoint.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | unset | Backend-only Gemini API key |
| `GEMINI_MODEL` | `gemini-4-argon` | Gemini model name |
| `MAX_UPLOAD_BYTES` | `5242880` | Maximum CSV body size (5 MiB) |
| `MAX_ROWS` | `50000` | Maximum data rows |
| `MAX_COLUMNS` | `100` | Maximum columns |
| `AI_TIMEOUT_SECONDS` | `20` | Maximum wait for Gemini |
| `FRONTEND_ORIGINS` | localhost Vite origins | Comma-separated allowed browser origins |
| `VITE_API_BASE_URL` | `http://localhost:8000` | API origin used by the frontend |

## Tests

Run backend tests:

```powershell
python -m pytest
```

Run frontend report tests and production build:

```powershell
npm test
npm run build
```

Latest verification:

| Check | Result |
|---|---|
| `python -m pytest -q` | 29 passed, 0 failed, 0 skipped |
| `npm test` | 3 passed, 0 failed, 0 skipped |
| `npm run build` | Passed |
| `python -m compileall -q backend tests` | Passed |
| `pip check` | No broken requirements found |

The backend tests use synthetic CSVs and mock Gemini responses; no live Gemini key was used.

## Security and limitations

- Uploaded files are size-, row-, and column-limited; CSV parsing is strict, and content is never executed.
- Secrets are read only by the backend; `.env` and local credentials are ignored by Git.
- CORS is restricted to configured frontend origins. Use HTTPS and configure the deployed frontend origin for production.
- AI output is schema-validated and treated as untrusted advisory text. Data-derived evidence is cached in process memory for interpretation; it is not encrypted at rest because it is not written to disk.
- This prototype has no authentication or per-user isolation. Do not expose it as a public multi-tenant service without adding real authentication, quotas/rate limits, and tenant-scoped analysis storage.
- CSV downloads are unavailable as a feature; reports export analysis JSON only and do not include source rows.

## Demo flow

1. Start the backend and Vite frontend.
2. On the dashboard, choose a CSV or select **Try sample data**.
3. Review the dataset summary, quality signals, statistics, correlations, anomalies, and AI availability.
4. Select **Download JSON** to export the calculated results and any validated interpretation.
