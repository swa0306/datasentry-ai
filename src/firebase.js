import { getApp, getApps, initializeApp } from "@firebase/app";
import { browserLocalPersistence, getAuth, setPersistence } from "@firebase/auth";

const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_DATABASE_URL",
  "VITE_FIREBASE_APP_ID",
];
const missing = required.filter((key) => !import.meta.env[key]);
export const configurationError = missing.length
  ? `Missing Firebase web configuration: ${missing.join(", ")}`
  : "";

const app = missing.length
  ? null
  : getApps().length
    ? getApp()
    : initializeApp({
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      });

export const auth = app ? getAuth(app) : null;
if (auth) void setPersistence(auth, browserLocalPersistence);
