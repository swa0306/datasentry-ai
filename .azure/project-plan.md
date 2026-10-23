# Project Plan

**Status**: Planning
**Created**: 2026-10-23
**Mode**: AUGMENT

---

## 1. Project Overview

**Goal**: Extend the existing DataSentry AI workspace into a responsive React/Vite dashboard and FastAPI service for secure, in-memory CSV analysis, deterministic Pandas metrics, optional evidence-based Gemini interpretation, and client-side JSON reports. The project is designed so that every module is independently testable.

**App Type**: SPA + API

**API Login**: No

**Mode**: AUGMENT

**Deployment Plan**: No deployment plan found

---

## 2. Backend — FastAPI API

| Component | Technology |
|-----------|-----------|
| **Language** | Python |
| **Runtime** | CPython |
| **Package Manager** | pip |
| **Test Runner** | pytest |
| **Mocking Library** | unittest.mock |
| **Test Command** | `python -m pytest` |
| **Orchestration** | docker-compose |

---

## 3. Frontend — Web App

| Component | Technology |
|-----------|-----------|
| **Language** | JavaScript |
| **Framework** | React + Vite |
| **Package Manager** | npm |
| **Test Runner** | Node.js built-in test runner (`node:test`) |
| **Mocking Library** | Node.js built-in test mocks |
| **Test Command** | `npm test` |

---

## 4. Services Required

| Azure Service | Role in App | Environment Variable | Default Value (Local) | Classification |
|---------------|------------|---------------------|----------------------|----------------|
| Azure App Service | Host the Python FastAPI API | `GEMINI_API_KEY` | Unset; deterministic analysis remains available | Essential |
| Azure Static Web Apps | Host the React/Vite single-page frontend | `VITE_API_BASE_URL` | `http://localhost:8000` | Essential |
| Google Gemini API (external) | Optional evidence-grounded explanation of calculated metrics; no CSV rows are sent | `GEMINI_API_KEY`, `GEMINI_MODEL` | Unset; model defaults to `gemini-4-argon` | Enhancement |

---

## 5. Prerequisites

### Run

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| Python | `datasentry-api` | ✅ | 3.11.9 |
| pip | `datasentry-api` | ✅ | 26.2.1 |
| Uvicorn | `datasentry-api` | ✅ | 0.41.0 |
| pytest | `datasentry-api` | ✅ | 9.1.1 |
| Node.js | `datasentry-frontend` | ✅ | 24.13.1 |
| npm | `datasentry-frontend` | ✅ | 11.8.0 |

### Debug

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| Docker | `datasentry-api`, `datasentry-frontend` | ❓ | not confirmed in this sandbox |
| Docker Compose | `datasentry-api`, `datasentry-frontend` | ❓ | not confirmed in this sandbox |
| `ms-python.python` | `datasentry-api` | ✅ | 2026.10.0 |
| `ms-vscode.js-debug` | `datasentry-frontend` | ❓ | not confirmed in this sandbox |

Every prerequisite is marked installed only when positively detected; sandbox limitations mean an unknown state is not proof that a tool is absent. Please double-check that all `❓` tools are installed before proceeding.

---

## 6. Design System & UI

**Component Library**: Fluent UI v9
**Style Direction**: A calm, forest-green analytics workspace with clean, data-dense cards, restrained elevation, and clear quality signals. Keep the interface approachable and privacy-conscious, with teal-green actions and warm amber reserved for potential anomalies.
**Typography**: DM Sans, Manrope, system-ui

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#147B64` | DataSentry actions, active dashboard navigation, and links |
| `accent` | `#D98A35` | Potential-anomaly counts and attention cues in analysis results |
| `surface` | `#F6F8F7` | Dashboard canvas behind upload and analysis panels |
| `text` | `#1D302D` | Dataset names, metric values, and explanatory copy |
| `muted` | `#70827A` | Column metadata, timestamps, and secondary guidance |
| `border` | `#E1EAE5` | CSV upload boundary, result cards, and table dividers |

### Pages

| Page | Route | Purpose | Layout |
|------|-------|---------|--------|
| Dashboard | `/` | Upload a CSV, review its calculated quality and statistical signals, and download the resulting JSON report. | `header, nav, hero, form, grid, table, actions, footer` |

### Sample Content

Dashboard — sample CSV rows from `weekly-business-metrics.csv`:
| Week | Visits | Revenue | Region |
|------|--------|---------|--------|
| Week 1 | 820 | $16,400 | North |
| Week 7 | Missing | $21,400 | North |
| Week 20 | 9,000 (potential outlier) | $180,000 | East |

Dashboard — analysis summary: 24 rows · 5 columns · 1 missing `visits` value · possible IQR outlier at Week 20. Gemini interpretation: optional and unavailable until a backend key is configured.

---

## 7. Project Structure

```text
project-root/
├── .azure/
│   ├── project-plan.md
│   └── .preview-temp/
│       ├── theme.css
│       ├── manifest.json
│       └── dashboard.html
├── backend/
│   ├── __init__.py
│   └── main.py
├── src/
│   ├── App.jsx
│   ├── api.js
│   ├── dashboard.css
│   ├── main.jsx
│   └── report.js
├── tests/
│   ├── report.test.js
│   └── test_backend.py
├── .env.example
├── index.html
├── package.json
└── requirements.txt
```

---

## 8. Route Definitions

| # | Method | Path | Description | Request Body | Response Body | Status Codes |
|---|--------|------|-------------|-------------|--------------|-------------|
| 1 | GET | `/health` | Confirm that the API process is responding | — | `{ status, service }` | 200 |
| 2 | POST | `/api/analyze` | Validate a bounded CSV and return deterministic metrics, quality signals, and a short-lived analysis ID | `multipart/form-data` with `file` | `{ analysis_id, file_name, row_count, column_count, columns, numerical_statistics, correlations, potential_anomalies, warnings, processing_time_ms }` | 200, 400, 413, 415, 422 |
| 3 | POST | `/api/interpret` | Optionally interpret the cached calculated evidence with Gemini; return a graceful unavailable result when the provider cannot be used | `{ analysis_id }` | `{ available, status, interpretation, message, processing_time_ms }` | 200, 404, 422 |

---

## 9. Next Steps

1. Run **azure-project-scaffold** to execute this plan
2. Run **azure-project-integrate** to wire the frontend to live data, smoke-test the backend, and create the migrations
3. Run **azure-debug-plan** → **azure-debug-generate** for Docker emulators and VS Code debugging
4. Run the **azure-deploy** agent when ready; it uses **azure-app-onboard** for architecture, cost estimation, IaC generation, provisioning, and health verification
