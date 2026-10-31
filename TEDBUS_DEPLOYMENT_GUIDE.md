# TEDBUS — PRODUCTION DEPLOYMENT GUIDE

**Project:** TedBus (Angular 17 Frontend + Node.js/Express Backend + MongoDB Atlas)

---

## 1. Deployment Architecture Overview

- **Frontend (Angular 17 SPA):** Deployable to **Netlify** or **Vercel**.
  - Build command: `npm run build` (inside `frontend/`)
  - Output / Publish directory: `dist/frontend/browser`
  - SPA Fallback: Configured in `frontend/src/_redirects`, `frontend/netlify.toml`, and `frontend/vercel.json` so deep links (`/select-bus`, `/route-planner`, `/community`, `/profile`, `/payment`) resolve to `/index.html`.
- **Backend (Node.js + Express API):** Deployable to **Render**, **Railway**, or any Node.js container host.
  - Root directory: `server/`
  - Build command: `npm install`
  - Start command: `npm start` (`node index.js`)
  - Health Check Endpoint: `GET /health` (returns HTTP `200` with database connection state when connected, or HTTP `503` if degraded).
- **Database (MongoDB Atlas):**
  - Cloud-hosted MongoDB replica set (`MONGODB_URI`).

---

## 2. Step-by-Step Backend Deployment (Render / Railway)

1. **Configure MongoDB Atlas Network Access:**
   - Log in to MongoDB Atlas -> **Security -> Network Access**.
   - Whitelist your backend host's outbound IP addresses (or `0.0.0.0/0` if deploying on dynamic cloud IPs with strong database credentials).
   - Verify your database user has `readWrite` permissions on the `tedbus` database.

2. **Configure Backend Environment Variables on Host:**
   Set the following environment variables in your Render / Railway service dashboard:
   - `NODE_ENV=production`
   - `PORT=5000`
   - `MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>/tedbus?retryWrites=true&w=majority`
   - `CORS_ORIGINS=https://<your-frontend-domain>.netlify.app,https://<your-frontend-domain>.vercel.app`
   - `JWT_SECRET=<64-char-random-hex-secret>`
   - `JWT_ISSUER=tedbus-api`
   - `JWT_AUDIENCE=tedbus-client`

3. **Verify Backend Health:**
   Once deployed, visit `https://<your-backend-domain>/health` and confirm:
   ```json
   {
     "status": "healthy",
     "environment": "production",
     "database": {
       "connected": true,
       "readyState": 1,
       "state": "connected",
       "source": "atlas"
     }
   }
   ```

---

## 3. Step-by-Step Frontend Deployment (Netlify / Vercel)

1. **Set Production API URL:**
   Update `frontend/src/environments/environment.prod.ts` with your live backend HTTPS URL:
   ```ts
   export const environment = {
     production: true,
     apiUrl: 'https://<your-backend-domain>/',
     googleClientId: '<your-google-client-id>'
   };
   ```

2. **Build & Verify Locally Before Deploying:**
   ```bash
   npm --prefix frontend run build
   ```
   Confirm `frontend/dist/frontend/browser/index.html` and `frontend/dist/frontend/browser/_redirects` are generated.

3. **Deploy to Netlify or Vercel:**
   - **Netlify:** Uses `frontend/netlify.toml` (`command = "npm run build"`, `publish = "dist/frontend/browser"`, `/* -> /index.html 200`).
   - **Vercel:** Uses `frontend/vercel.json` (`rewrites: [{ "source": "/(.*)", "destination": "/index.html" }]`).

---

## 4. Important Production Notes & Honest Limitations

- **MongoDB Atlas Connectivity:** Local MongoDB testing (`127.0.0.1:27017`) verifies schema, controller, and transaction/query logic, but does **not** substitute for whitelisting your production server IP in MongoDB Atlas Network Access. Always verify `/health` shows `"source": "atlas"` after deployment.
- **External Notification Providers (Email / Push):** In-app notifications and delivery attempt tracking (`NotificationDeliveryAttempt`) persist directly in MongoDB. Actual outbound SMTP email delivery or browser WebPush delivery in production requires configuring an external SMTP/Push provider; without external provider credentials, the system records delivery attempts in MongoDB without claiming external email transmission.
- **Interactive Route Planner Mapping:** Uses a self-contained interactive custom SVG highway corridor map (`RoutePlannerComponent`) with coordinate projection, Haversine/corridor distance and duration estimation (`/saved-routes/calculate`), and an external Google Maps directions link—working reliably without requiring secret frontend map API keys.

