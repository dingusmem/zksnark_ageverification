# Issuer Module

Standalone demo issuer for signed age credentials. It uses an Ed25519 signature; it does not generate zk-SNARK proofs and is not connected to a real identity authority.

## Structure

- `backend/` - Express API, key storage, and automated tests.
- `frontend/` - React/Vite issuer interface.

## Run locally

Prerequisite: Node.js and npm.

In one terminal, start the backend:

```powershell
cd issuer-module/backend
npm install
npm run dev
```

In another terminal, start the frontend:

```powershell
cd issuer-module/frontend
npm install
npm run dev
```

Open the Vite URL shown in the frontend terminal (typically `http://localhost:5173`). The frontend proxies `/api` requests to the backend at `http://localhost:3001`.

## Verify

Run backend tests with `npm test` from `backend/`. Check the frontend production build with `npm run build` from `frontend/`.
