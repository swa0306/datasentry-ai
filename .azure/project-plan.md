# Project Plan

**Status**: Planning
**Created**: 2026-10-23
**Mode**: AUGMENT

---

## 1. Project Overview

**Goal**: Upgrade the existing DataSentry AI FastAPI backend to enforce verified Firebase Authentication and per-user Firebase Realtime Database history while preserving deterministic in-memory Pandas analysis, optional evidence-grounded Gemini interpretation, and downloadable JSON reports. The project is designed so that every module is independently testable.

**App Type**: SPA + API

**API Login**: Yes

**Mode**: AUGMENT

**Deployment Plan**: No deployment plan found

---

## 2. Backend — Azure Functions

| Component | Technology |
|-----------|-----------|
| **Language** | Python |
| **Runtime** | CPython |
| **Package Manager** | pip |
| **Test Runner** | pytest |
| **Mocking Library** | unittest.mock |
| **Test Command** | `python -m pytest` |
| **Orchestration** | docker-compose |

> **Language vs Runtime**: `Language` is the source language the user picked in this service's `language` question. `Runtime` is the execution runtime — default `Node` for TypeScript/JavaScript, `CPython` for Python, `.NET` for C#. Only deviate from the default (e.g. `Bun`, `Deno`, `PyPy`) when the user explicitly asks. **Package Manager and Test Runner are language-dependent** — match them to this service's Language (e.g. C# → `dotnet (NuGet)` + `xUnit`/`NUnit`/`MSTest`). The `Orchestration` row is recorded for the scaffold step but hidden in the plan UI — always keep it set to `docker-compose`.

This backend remains a FastAPI service with Pydantic validation, bounded CSV intake, and deterministic Pandas analysis. Firebase ID tokens are verified by the backend before any analysis or interpretation request is accepted. Only verified UID-scoped metadata is written to the user's Realtime Database record, and raw CSV content is never persisted.

---

## 3. Frontend — Web App

| Component | Technology |
|-----------|-----------|
| **Language** | JavaScript |
| **Framework** | React + Vite |
| **Package Manager** | npm |
| **Test Runner** | vitest |
| **Mocking Library** | vi.mock |
| **Test Command** | `npm test` |

The planned dashboard is a React + Vite application that signs in users with Firebase email/password auth, preserves browser sessions, and listens only to the signed-in user's history and settings. It sends Firebase ID tokens to the API, renders deterministic and optional AI-backed analysis results, and lets users download JSON report payloads.

---

## 4. Services Required

| Azure Service | Role in App | Environment Variable | Default Value (Local) | Classification |
|---------------|------------|---------------------|----------------------|----------------|
| Firebase Authentication | Email/password identity and verified tokens for API access | `VITE_FIREBASE_API_KEY` | public Firebase web config | Essential |
| Firebase Realtime Database | User profile, settings, and per-user analysis metadata | `FIREBASE_DATABASE_URL` | `https://<project-id>-default-rtdb.firebaseio.com` | Essential |
| Gemini API | Optional evidence-grounded interpretation layer | `GEMINI_API_KEY` | unset; deterministic analysis remains available | Enhancement |

---

## 5. Prerequisites

### Run

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| Python | `datasentry-api` | ✅ | 3.11.9 |
| pip | `datasentry-api` | ✅ | 24.2 |
| Node.js | `datasentry-frontend` | ✅ | 22.10.0 |
| npm | `datasentry-frontend` | ✅ | 10.9.0 |

### Debug

| Tool | Service(s) | Installed | Version |
|------|------------|-----------|---------|
| Docker | `datasentry-api`, `datasentry-frontend` | ❓ | not confirmed in this sandbox |
| Docker Compose | `datasentry-api`, `datasentry-frontend` | ❓ | not confirmed in this sandbox |
| `ms-python.python` | `datasentry-api` | ❓ | not confirmed in this sandbox |

Every row resolves to a positive detection or a conservative unknown state. The sandbox does not prove tool absence, so this plan intentionally avoids marking any row as failed. Please double-check all `❓` entries before running the scaffolded app locally.

---

## 6. Design System & UI

**Component Library**: Fluent UI v9
**Style Direction**: Modern analytics workspace with calm indigo actions, teal quality signals, and crisp data-dense cards that emphasize scanability over decoration.
**Typography**: Segoe UI Variable, Segoe UI, system-ui

### Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `primary` | `#3B82F6` | Primary actions, navigation highlights, and focused analysis states |
| `accent` | `#14B8A6` | Success indicators, quality badges, and key trend highlights |
| `surface` | `#F5F7FB` | Main page and panel backgrounds |
| `text` | `#111827` | Main content text, metrics, and dataset names |
| `muted` | `#64748B` | Secondary labels, timestamps, and helper text |
| `border` | `#E2E8F0` | Dividers, inputs, and card borders |

### Pages

| Page | Route | Purpose | Layout |
|------|-------|---------|--------|
| Dashboard | `/` | Review the latest uploaded dataset, quality signals, and the next action. | `header, nav, sidebar, hero, form, grid, table, footer` |
| History | `/history` | Review saved analyses, statuses, and downloadable JSON reports. | `header, nav, sidebar, table, actions, footer` |
| Settings | `/settings` | Manage the signed-in user profile, default export preferences, and notification rules. | `header, nav, sidebar, form, table, footer` |

### Sample Content

Dashboard — analyzed datasets:
| File | Rows | Columns | Status |
|-------|------|---------|--------|
| `retail_orders_q3.csv` | 1,248 | 8 | `complete` |
| `subscription_churn.csv` | 864 | 11 | `complete` |
| `regional_sales.csv` | 2,405 | 9 | `warning` |

History — analysis records:
| Analysis | Rows | Quality | Status |
|----------|------|---------|--------|
| `retail_orders_q3.csv` | 1,248 | 96.8% | completed |
| `subscription_churn.csv` | 864 | 98.1% | completed |
| `regional_sales.csv` | 2,405 | 99.2% | completed |

Settings — user defaults: theme: system · export: JSON · alerts: email summary

---

## 7. Project Structure

```text
project-root/
├── .azure/
│   ├── project-plan.md
│   └── .preview-temp/
│       ├── theme.css
│       ├── manifest.json
│       ├── dashboard.html
│       ├── history.html
│       └── settings.html
├── backend/
│   ├── main.py
│   ├── services/
│   ├── tests/
│   └── __init__.py
├── .env.example
├── .gitignore
├── database.rules.json
├── firebase.json
├── README.md
├── requirements.txt
└── package.json
```

---

## 8. Route Definitions

| # | Method | Path | Description | Request Body | Response Body | Status Codes |
|---|--------|------|-------------|-------------|--------------|-------------|
| 1 | GET | `/api/health` | Public health check for the API | — | `{ status, services }` | 200, 503 |
| 2 | POST | `/api/analyze` | Verify Firebase bearer token, validate bounded CSV input, run deterministic analysis, and write per-user history metadata | `multipart/form-data` file plus `Authorization: Bearer <id-token>` | `{ analysis_id, file_name, row_count, column_count, warnings, processing_time_ms }` | 200, 400, 401, 413, 422, 503 |
| 3 | POST | `/api/interpret` | Verify token and scoped evidence; optionally enrich with Gemini-backed interpretation | `{ analysis_id }` plus `Authorization: Bearer <id-token>` | `{ available, status, interpretation, message, processing_time_ms }` | 200, 401, 404, 422, 503, 504 |

---

## 9. Next Steps

1. Run **azure-project-scaffold** to execute this plan
2. Run **azure-project-integrate** to wire the frontend to live data, smoke-test the backend, and create the migrations
3. Run **azure-debug-plan** → **azure-debug-generate** for Docker emulators and VS Code debugging
4. Run the **azure-deploy** agent when ready; it uses **azure-app-onboard** for architecture, cost estimation, IaC generation, provisioning, and health verification
