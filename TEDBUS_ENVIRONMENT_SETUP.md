# TEDBUS — ENVIRONMENT SETUP GUIDE

**Project:** TedBus (Angular 17 Frontend + Node.js/Express Backend + MongoDB)

---

## 1. Prerequisites

- **Node.js:** v18.x, v20.x, or v22+ (tested on Node.js v24.14.0)
- **npm:** v9+
- **MongoDB:**
  - Local MongoDB instance (`mongodb://127.0.0.1:27017/tedbus`) for local development and automated testing, **OR**
  - MongoDB Atlas cluster (`mongodb+srv://...`) with your IP whitelisted in **Atlas -> Network Access**.

---

## 2. Backend Environment Variables (`server/.env`)

Copy `server/.env.example` to `server/.env` and configure the following variables:

```env
# Application Environment ('development' | 'production')
NODE_ENV=development

# Backend HTTP Port
PORT=5000

# Primary MongoDB Atlas Connection String (Required in production)
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-url>/tedbus?retryWrites=true&w=majority

# Local MongoDB Fallback URI (Used in development when Atlas is unreachable)
LOCAL_MONGODB_URI=mongodb://127.0.0.1:27017/tedbus

# Allowed CORS Origins (comma-separated)
CORS_ORIGINS=http://localhost:4200

# JWT Authentication Configuration (HS256)
# Generate a strong random secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
JWT_SECRET=replace-with-a-strong-256-bit-random-secret
JWT_ISSUER=tedbus-api
JWT_AUDIENCE=tedbus-client
JWT_EXPIRES_IN_SECONDS=86400

# Optional Google OAuth 2.0 Credentials
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Optional SMTP Email Transport (Required for live outbound email delivery)
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-username
SMTP_PASS=your-smtp-password
SMTP_FROM=notifications@tedbus.com

# Optional VAPID Web Push Configuration (Required for Service Worker WebPush)
VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:support@tedbus.com
```

### Variable Reference

| Variable | Required | Default | Description |
| :--- | :---: | :--- | :--- |
| `NODE_ENV` | Yes | `development` | Set to `production` in deployed environments to enforce Atlas connectivity and production checks. |
| `PORT` | No | `5000` | Port on which Express listens. |
| `MONGODB_URI` | Yes (Prod) | — | MongoDB Atlas SRV connection string. Never commit real credentials to Git. |
| `LOCAL_MONGODB_URI` | No | `mongodb://127.0.0.1:27017/tedbus` | Local MongoDB URI used as fallback in `development` mode. |
| `CORS_ORIGINS` | Yes (Prod) | `http://localhost:4200` | Comma-separated list of allowed frontend origins (e.g. `https://your-app.netlify.app`). |
| `JWT_SECRET` | **Yes** | — | Secret key (minimum 16 characters, recommended 64 hex chars) used to sign and verify HS256 Bearer tokens. |
| `JWT_ISSUER` | No | `tedbus-api` | Expected `iss` claim in JWT tokens. |
| `JWT_AUDIENCE` | No | `tedbus-client` | Expected `aud` claim in JWT tokens. |
| `JWT_EXPIRES_IN_SECONDS` | No | `86400` | Token lifetime in seconds (default 24 hours). |
| `SMTP_HOST` | No | — | Outbound SMTP hostname (`server/services/emailService.js`). When unset, email attempts remain `pending` without claiming delivery. |
| `SMTP_PORT` | No | `587` | Outbound SMTP port (`587` or `465`). |
| `SMTP_SECURE` | No | `false` | Set `true` for implicit TLS on port `465`. |
| `SMTP_USER` | No | — | SMTP authentication username. |
| `SMTP_PASS` | No | — | SMTP authentication password. |
| `SMTP_FROM` | No | `SMTP_USER` | Sender email address for `From:` header. |
| `VAPID_PUBLIC_KEY` | No | — | Base64url VAPID public key (`server/services/webPushService.js`). |
| `VAPID_PRIVATE_KEY` | No | — | PEM/DER ES256 VAPID private key for signing push headers. |
| `VAPID_SUBJECT` | No | — | `mailto:` or `https:` contact URI for VAPID claims. |

---

## 3. Frontend Environment Configuration (`frontend/src/environments/`)

### Development (`frontend/src/environments/environment.ts`)
```ts
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/',
  googleClientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
};
```

### Production (`frontend/src/environments/environment.prod.ts`)
Before building for production deployment, replace `PLACEHOLDER_PRODUCTION_API_URL` with your deployed backend URL (including trailing slash):
```ts
export const environment = {
  production: true,
  apiUrl: 'https://your-tedbus-backend.onrender.com/',
  googleClientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
};
```
Note: `frontend/angular.json` is pre-configured with `fileReplacements` so `npm --prefix frontend run build` automatically swaps `environment.ts` with `environment.prod.ts`.

---

## 4. Local Startup Instructions

1. **Install Backend Dependencies & Start API Server:**
   ```bash
   cd server
   npm install
   npm start
   ```
   Verify health at `http://localhost:5000/health`.

2. **Install Frontend Dependencies & Start Angular Dev Server:**
   ```bash
   cd frontend
   npm install
   npm start
   ```
   Open `http://localhost:4200` in your browser.

3. **Seed Canonical Routes & Buses (Admin Only):**
   Once an administrator account exists (`role: "admin"`), call:
   ```bash
   curl -X POST http://localhost:5000/routes/initialize \
     -H "Authorization: Bearer <ADMIN_JWT_TOKEN>"
   ```

4. **Run Automated Verification Suites:**
   ```bash
   node server/test-verification.js
   node server/test-adversarial-security.js
   ```

