# DataSentry AI

DataSentry AI analyzes bounded CSV uploads in memory with Pandas, returns deterministic data-quality and numerical statistics, and optionally adds evidence-grounded Gemini interpretation. Firebase Authentication protects API operations, and Firebase Realtime Database stores only per-user profiles/settings and analysis-history metadata. Raw CSV contents are not persisted or uploaded to Firebase Storage.

## Local application

The React/Vite frontend runs from the repository root; FastAPI is `backend/main.py`. Firebase Authentication and Realtime Database must be configured in Firebase Console before sign-in and protected analysis can work. This repository does not include real Firebase credentials.

## Backend setup

1. Create a Firebase project and enable **Authentication → Email/Password**.
2. Create a **Realtime Database** and copy its database URL.
3. Configure the Realtime Database rules from [`database.rules.json`](./database.rules.json). Deploy them with the Firebase CLI after selecting your project:

   ```powershell
   firebase use <your-project-id>
   firebase deploy --only database
   ```

4. Create a backend service account with the minimum Firebase Admin access needed for ID-token verification and Realtime Database writes. For local development, store its JSON file outside the repository and set `FIREBASE_SERVICE_ACCOUNT` to its absolute path. Production should use the hosting platform's Application Default Credentials / workload identity instead of a downloaded key.
5. Copy `.env.example` to `.env`, set `FIREBASE_DATABASE_URL`, and configure `FIREBASE_SERVICE_ACCOUNT` or the platform's ADC. Set `GEMINI_API_KEY` only on the backend if AI interpretation is wanted. Never put a service-account key or Gemini key in a `VITE_*` variable.
6. Install the Python dependencies and run the API:

   ```powershell
   python -m pip install -r requirements.txt
   uvicorn backend.main:app --reload
   ```

   `GET /health` is public. `POST /api/analyze` and `POST /api/interpret` require `Authorization: Bearer <Firebase ID token>`. The API derives the UID from the verified token; it does not accept a caller-supplied UID. Analysis metadata is written only after successful CSV validation and analysis to `analysisHistory/{uid}/{analysisId}`. A failed metadata write returns a service error rather than claiming that history was saved.

## Realtime Database data and access

The intended JSON shape is:

```json
{
  "users": {
    "{uid}": {
      "profile": {
        "displayName": "Example User",
        "email": "user@example.com"
      },
      "settings": {
        "theme": "system",
        "compactMode": false
      }
    }
  },
  "analysisHistory": {
    "{uid}": {
      "{analysisId}": {
        "filename": "orders.csv",
        "rowCount": 120,
        "columnCount": 8,
        "missingValues": 4,
        "status": "completed",
        "createdAt": 1792713600000
      }
    }
  }
}
```

The rules deny access by default, scope profile/settings and history reads to `auth.uid`, validate allowed profile/settings/metadata fields, and deny client writes to analysis history. The Admin SDK bypasses rules for server writes. Do not loosen rules to public reads/writes. Firebase's local emulator can be added when an actual frontend integration needs an isolated end-to-end test; these files alone do not establish a live Firebase connection.

## React/Vite Firebase integration

The frontend uses Firebase email/password authentication, persistent local sessions, and the signed-in user's Firebase ID token for authenticated API calls. The FastAPI backend scopes Realtime Database history access to the UID in the verified token. Never expose Firebase Admin credentials or `GEMINI_API_KEY` to the browser.

## CSV and AI behavior

The backend limits uploads by byte size, row count, and column count; checks extension, UTF-8 text, headers, duplicate names, and CSV structure; and analyzes uploads in memory. It retains only bounded calculated evidence in a short-lived, UID-scoped process cache for `/api/interpret`. Gemini receives calculated evidence, not the uploaded CSV. Invalid, unavailable, or timed-out AI output degrades to an explicit unavailable response while deterministic analysis remains usable.

## Tests

Run backend tests with:

```powershell
python -m pytest
```

The tests mock Firebase and Gemini external calls. No live Firebase connection is required for the test suite. Run `npm run build` to verify the frontend production bundle.
