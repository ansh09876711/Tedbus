# TEDBUS — PHASE 2.2 SECURITY FIX IMPLEMENTATION REPORT

**Date:** October 31, 2026  
**Project:** TedBus (Angular 17 + Node.js/Express + MongoDB/Mongoose)  
**Scope:** Full remediation of all 7 security vulnerabilities identified in `TEDBUS_PHASE2_1_SECURITY_REPORT.md`, adversarial verification across 16 live HTTP attack scenarios, and full regression verification across 37 functional and security tests.

---

## 1. Executive Summary

Following the independent read-only audit in Phase 2.1, all **7 failing security vulnerabilities** have been remediated and verified against the running Express application and MongoDB instance:

| Phase 2.1 Finding | Remediation Implemented in Phase 2.2 | Phase 2.2 Status |
| :--- | :--- | :---: |
| **`ADV-01` — Unverified Customer Identity (`X-Customer-Id` / `X-Customer-Email` spoofing)** | Replaced trust in client-supplied headers/query parameters with cryptographic RFC 7519 HS256 Bearer JWT verification (`verifyCustomerAuth`). | **PASS** |
| **`ADV-02` — Cross-Customer Booking Access (`GET /booking/:id`)** | Protected `GET /booking` and `GET /booking/:id` with `verifyCustomerAuth`, deriving identity strictly from the verified JWT and rejecting any cross-customer ID/email/booking access with `HTTP 403`. | **PASS** |
| **`ADV-04` — Unauthorized Booking Cancellation via Spoofed Body** | Protected `PUT /booking/:id/cancel` with `verifyCustomerAuth`; ownership is verified strictly against the token's `Customer._id` and `email`. Forged body/header identities return `HTTP 403`. | **PASS** |
| **`ADV-05` — Cancellation of Already-Departed Trips (`hoursUntilDeparture < 0`)** | Fixed departure cutoff logic in `server/controller/booking.js` (`parseDepartureTimeMs`) so both `hoursUntilDeparture < 0` (already departed) and `0 <= hoursUntilDeparture < 2` (within 2-hour cutoff) return `HTTP 400 CancellationWindowClosed`. | **PASS** |
| **`ADV-08` — Unverified Moderator Header (`X-Moderator-Id` spoofing)** | Replaced `X-Moderator-Id` header/body lookup in `server/middleware/auth.js` with signed Bearer JWT verification (`verifyModeratorOrAdmin` and `verifyAdminOnly`) backed by live MongoDB account lookup. | **PASS** |
| **`ADV-11` — Missing `moderator` vs `admin` Role Separation** | Implemented dedicated `verifyAdminOnly` middleware requiring `customer.role === 'admin'` and `customer.isVerified !== false` on `POST /routes/initialize`, `POST /notifications/retry-failed`, `POST /notifications/trigger`, and `GET /notifications/delivery-history`. | **PASS** |
| **`ADV-13` — Moderator Access to Route Initialization (`POST /routes/initialize`)** | Restricted `POST /routes/initialize` to `verifyAdminOnly`; moderator accounts are rejected with `HTTP 403 AdminPrivilegesRequired`. | **PASS** |

---

## 2. Backup Checkpoint

Before modifying any project files, a complete backup of the backend (`server/controller`, `server/middleware`, `server/models`, `server/routes`, `server/services`, `server/index.js`) and frontend (`frontend/src`) was created at:
- `C:\Users\ANSH AGARWAL\.gemini\antigravity\brain\6e23fff6-cc88-40ce-a9f9-361e6c247366\scratch\pre_phase2_2_backup\`

---

## 3. Authentication Architecture Implemented

### 3.1 Inspection of Previous Flow & Documented Limitation
- **Previous Limitation:** Prior to Phase 2.2, `POST /customer` (`server/controller/customer.js`) performed an unauthenticated lookup/upsert by `email` (`Customer.findOne({ email })`) without verifying a password or cryptographic credential. Any caller submitting `{ name, email }` received the matching customer document from MongoDB.
- **Remediation:**
  1. **Password Hashing & Storage (`server/models/customer.js`, `server/middleware/auth.js`):**
     - Added `passwordHash` (`select: false`) and `passwordSalt` (`select: false`) to `customerSchema`.
     - Implemented `hashPassword(password)` and `verifyPassword(password, salt, hash)` using Node's `crypto.scryptSync` (64-byte key derivation with a 16-byte random salt) and constant-time `crypto.timingSafeEqual`.
  2. **Credential-Verified Registration & Login (`server/controller/customer.js`, `server/routes/customer.js`):**
     - `POST /customer` (along with `/customer/login` and `/customer/register`) now **never** issues a token based solely on `{ name, email }` or an unverified `googleId`.
     - Requests without a valid `password` (minimum 6 characters) are rejected with `HTTP 401 CredentialsRequired`.
     - When an email already exists in MongoDB, the submitted password is verified against the stored `passwordHash` and `passwordSalt` in constant time. Accounts without a stored `passwordHash` (or with a mismatched password) are rejected with `HTTP 401 InvalidCredentials`, preventing takeover of pre-existing accounts.
     - New registrations hash the password, force `role: "user"` (ignoring any client-supplied `role` field), strip `passwordHash`/`passwordSalt` from the response, and return a signed JWT (`authToken`).
  3. **RFC 7519 HS256 JWT Implementation (`server/middleware/auth.js`):**
     - Signs tokens using HMAC-SHA256 (`alg: "HS256"`, `typ: "JWT"`) with `process.env.JWT_SECRET` stored exclusively in environment variables (`server/.env`, documented in `server/.env.example`).
     - Includes and validates `sub` (MongoDB `Customer._id`), `email`, `role`, `iat`, `exp` (expiration), `iss` (`tedbus-api`), and `aud` (`tedbus-client`).
     - Verifies signatures using constant-time `crypto.timingSafeEqual` and rejects non-canonical base64url encodings, tampered payloads, wrong algorithms, expired tokens, or deleted MongoDB accounts (`Customer.findById(payload.sub)`).
  4. **Frontend Token Storage & HTTP Interceptor (`frontend/src/app/service/auth.interceptor.ts`):**
     - Created `AuthInterceptor` and registered it with `HTTP_INTERCEPTORS` in `frontend/src/app/app.module.ts`.
     - Stores `authToken` in `sessionStorage` upon login/registration in `NavbarComponent` and automatically attaches `Authorization: Bearer <token>` to outgoing API requests.
     - Clears `Loggedinuser` and `AuthToken` from `sessionStorage` on logout.

---

## 4. Booking Ownership Enforcement

In `server/controller/booking.js`:
- **`GET /booking` (`getAllBookings`):**
  - Enforces `verifyCustomerAuth(req)`. Unauthenticated requests (even if `X-Customer-Id` or `customerId` query parameters are supplied) are rejected with `HTTP 401`.
  - Derives `authCustomerId` and `authEmail` exclusively from `auth.customer` (the database record loaded from `decoded.sub`).
  - Rejects any request where `req.query.customerId`, `req.headers['x-customer-id']`, `req.query.email`, or `req.headers['x-customer-email']` differs from the authenticated token identity with `HTTP 403 CustomerIsolationViolation`.
- **`GET /booking/:id` (`getBooking`):**
  - Enforces `verifyCustomerAuth(req)` (`HTTP 401` if unauthenticated).
  - Allows `:id` if it matches the authenticated customer's `_id` or `email`, or if `:id` is a specific `Booking._id` owned by the authenticated customer.
  - Rejects any attempt by Customer A to request Customer B's `customerId` or Customer B's `bookingId` with `HTTP 403 CustomerIsolationViolation`.
- **`PUT /booking/:id/cancel` & `PATCH /booking/:id/cancel` (`cancelBooking`):**
  - Enforces `verifyCustomerAuth(req)` (`HTTP 401` if unauthenticated).
  - Rejects forged `customerId` or `email` in `req.body`, `req.query`, or `req.headers` that conflict with the token identity (`HTTP 403 BookingOwnershipMismatch`).
  - Verifies that the target booking's `customerId` or `email` matches the authenticated customer's MongoDB record; cross-customer cancellation attempts are rejected with `HTTP 403 BookingOwnershipMismatch`.

---

## 5. Moderator vs Admin Authorization

In `server/middleware/auth.js`:
- **`verifyModeratorOrAdmin(req)` / `requireModeratorOrAdmin`:**
  - Verifies the signed Bearer JWT via `verifyCustomerAuth(req)`.
  - Loads the live `Customer` document from MongoDB (`Customer.findById(payload.sub)`).
  - Rejects unverified accounts (`customer.isVerified === false`) with `HTTP 403 UnverifiedModerator`.
  - Requires `['moderator', 'admin'].includes(customer.role)` (`HTTP 403 InsufficientPrivileges` otherwise).
  - Used for:
    - `GET /community/reports`
    - `POST /community/posts/:id/moderate`
    - `POST /community/comments/:id/moderate`
    - `POST /reviews/:id/moderate`
- **`verifyAdminOnly(req)` / `requireAdminOnly`:**
  - Verifies the signed Bearer JWT via `verifyCustomerAuth(req)`.
  - Loads the live `Customer` document from MongoDB.
  - Rejects unverified accounts (`customer.isVerified === false`) with `HTTP 403 UnverifiedAdmin`.
  - Strictly requires `customer.role === 'admin'`. Moderator accounts (`role === 'moderator'`) are rejected with `HTTP 403 AdminPrivilegesRequired`.
  - Used for:
    - `POST /routes/initialize` (`server/controller/route.js`)
    - `POST /notifications/retry-failed` (`server/controller/notification.js`)
    - `POST /notifications/trigger` (`server/controller/notification.js`)
    - `GET /notifications/delivery-history` (`server/controller/notification.js`)

---

## 6. Cancellation Cutoff Fix

In `server/controller/booking.js` (`parseDepartureTimeMs` & `cancelBooking`):
- Previously, the cutoff check used `if (hoursUntilDeparture >= 0 && hoursUntilDeparture < 2)`, which allowed cancelling bookings where `hoursUntilDeparture < 0` (trips that had already departed).
- The updated check computes `hoursUntilDeparture = (depTimeMs - Date.now()) / (1000 * 60 * 60)` supporting both numeric hours (`8`, `14.5`) and `HH:mm` time strings (`"14:30"`):
  - If `hoursUntilDeparture < 0`: rejects with `HTTP 400 CancellationWindowClosed` (*"Bookings cannot be cancelled after the scheduled departure time has passed."*).
  - If `hoursUntilDeparture < 2`: rejects with `HTTP 400 CancellationWindowClosed` (*"Bookings cannot be cancelled within 2 hours of scheduled departure."*).

---

## 7. Adversarial Security Test Results

Executed via `node server/test-adversarial-security.js` against the live Express server and MongoDB (`16 PASS / 0 FAIL`):

| Test ID | Adversarial Scenario | Expected | Actual Result | Status |
| :--- | :--- | :--- | :--- | :---: |
| **`ADV-01`** | Missing Bearer token on `GET /booking`, `GET /booking/:id`, `PUT /booking/:id/cancel` (even with `X-Customer-Id` header) | `HTTP 401` | `401` across all 3 endpoints | **PASS** |
| **`ADV-02`** | Invalid signature (JWT signed with wrong secret key) | `HTTP 401` | `401 InvalidTokenSignature` | **PASS** |
| **`ADV-03`** | Tampered token (payload modified to change `sub` and `role: 'admin'`) | `HTTP 401` | `401 InvalidTokenSignature` | **PASS** |
| **`ADV-04`** | Expired token (`exp` in the past) | `HTTP 401` | `401 TokenExpired` | **PASS** |
| **`ADV-05`** | Deleted customer account (validly signed token for a deleted MongoDB user) | `HTTP 401` | `401 AccountNotFound` | **PASS** |
| **`ADV-06`** | Customer A accessing Customer B's bookings via `?customerId=B`, `?email=B`, `/booking/B_id`, `/booking/B_bookingId` | `HTTP 403` | `403` on all 4 cross-customer vectors; `200` on own bookings | **PASS** |
| **`ADV-07`** | Customer A cancelling Customer B's booking (`PUT /booking/:B_id/cancel`) | `HTTP 403` | `403 BookingOwnershipMismatch`; DB status remains `confirmed` | **PASS** |
| **`ADV-08`** | Forged `customerId`/`email` in request body & passwordless `POST /customer` login attempt | `HTTP 401` / `403` | Passwordless/wrong-password -> `401`; Forged cancel/create body -> `403` | **PASS** |
| **`ADV-09`** | Forged `X-Moderator-Id` and `X-Admin-Id` headers on `/community/reports` | `HTTP 401` / `403` | Unauth with header -> `401`; Normal user token with header -> `403` | **PASS** |
| **`ADV-10`** | Forged `X-Role: admin` header and `role: 'admin'` in registration/moderation body | `HTTP 403` | Moderation -> `403`; Registered user persisted with `role: 'user'` | **PASS** |
| **`ADV-11`** | Moderator attempting admin-only operations (`/routes/initialize`, `/notifications/retry-failed`, `/notifications/trigger`, `/notifications/delivery-history`) | `HTTP 403` on admin endpoints, `200` on moderation | `200` on `/community/reports`; `403 AdminPrivilegesRequired` on all 4 admin endpoints | **PASS** |
| **`ADV-12`** | Unverified moderator (`isVerified: false`) accessing `/community/reports` and `/reviews/:id/moderate` | `HTTP 403` | `403 UnverifiedModerator` on both endpoints | **PASS** |
| **`ADV-13`** | Unauthorized route initialization (`POST /routes/initialize`) & admin repeat-call idempotency | `401` / `403` / `0` duplicates | Unauth -> `401`, User -> `403`, Admin 2nd run `seededRoutes=0, seededBuses=0` | **PASS** |
| **`ADV-14`** | Unauthorized notification retry, trigger, and delivery-history access | `HTTP 401` / `403` | Unauth -> `401`; Normal user -> `403 AdminPrivilegesRequired` | **PASS** |
| **`ADV-15`** | Cancellation of already-departed journey (departure 3 hours in the past) | `HTTP 400` | `400 CancellationWindowClosed`; DB status remains `confirmed` | **PASS** |
| **`ADV-16`** | Cancellation within 2-hour pre-departure cutoff (departure 1 hour in the future) | `HTTP 400` | `400 CancellationWindowClosed`; DB status remains `confirmed` | **PASS** |

---

## 8. Regression Test Results

1. **Backend Verification Suite (`node server/test-verification.js`):**
   - **37 / 37 PASS** (Tests 1 through 37, covering MongoDB read/write, atomic seat conflict detection `HTTP 409`, offline DB rejection `HTTP 503`, CORS headers, bus search & filters, customer theme/language preferences, notification idempotency & retry engine, verified journey reviews & 24h edit window, community verified authoring & moderation, route planner polylines & saved routes, and Phase 2 security/functional checks).
2. **Adversarial Security Suite (`node server/test-adversarial-security.js`):**
   - **16 / 16 PASS** (`ADV-01` through `ADV-16`).
3. **Angular 17 Production Build (`npm --prefix frontend run build`):**
   - **PASS** (`Exit Code: 0`, output bundle generated cleanly at `frontend/dist/frontend` with zero compilation errors).

---

## 9. Files Modified

| File | Summary of Changes |
| :--- | :--- |
| `server/.env.example` | Added `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, and `JWT_EXPIRES_IN_SECONDS` configuration template keys. |
| `server/models/customer.js` | Added `passwordHash` (`select: false`) and `passwordSalt` (`select: false`) fields to `customerSchema`. |
| `server/middleware/auth.js` | Implemented HS256 JWT signing/verification (`signJwtToken`, `verifyJwtToken`), scrypt password hashing (`hashPassword`, `verifyPassword`), `verifyCustomerAuth`, `verifyModeratorOrAdmin`, and `verifyAdminOnly`. |
| `server/controller/customer.js` | Enforced password credential verification on `POST /customer`, prevented passwordless token issuance or account takeover, stripped password fields from responses, and issued signed JWTs. |
| `server/routes/customer.js` | Added `/customer/login` and `/customer/register` routes alongside `POST /customer`. |
| `server/controller/booking.js` | Protected `GET /booking`, `GET /booking/:id`, and `PUT /booking/:id/cancel` with `verifyCustomerAuth`; enforced strict token-derived ownership and fixed the 2-hour/already-departed cancellation cutoff. |
| `server/controller/route.js` | Updated `POST /routes/initialize` to enforce `verifyAdminOnly`. |
| `server/controller/notification.js` | Updated `POST /notifications/retry-failed`, `POST /notifications/trigger`, and `GET /notifications/delivery-history` to enforce `verifyAdminOnly`. |
| `server/index.js` | Added `Authorization` to CORS `allowedHeaders`. |
| `frontend/src/app/model/customer.model.ts` | Added optional `password`, `authToken`, and `role` fields to `Customer` interface. |
| `frontend/src/app/service/auth.interceptor.ts` | Created Angular `HttpInterceptor` to attach `Authorization: Bearer <token>` from `sessionStorage`. |
| `frontend/src/app/app.module.ts` | Registered `AuthInterceptor` in `HTTP_INTERCEPTORS` providers. |
| `frontend/src/app/service/customer.service.ts` | Included `password` in `POST /customer` payload. |
| `frontend/src/app/Component/navbar/navbar.component.ts` | Added password validation, stored `authToken` in `sessionStorage`, removed unauthenticated client-side login fallback on error, and cleared `AuthToken` on logout. |
| `frontend/src/app/Component/navbar/navbar.component.html` | Added password input field to the Sign-In modal form. |
| `frontend/src/app/Component/profile-page/my-trip/my-trip.component.ts` | Updated `MyTripComponent` to rely on the verified JWT Bearer token via `AuthInterceptor`. |
| `server/test-verification.js` | Updated existing verification tests to authenticate with signed Bearer JWT tokens. |
| `server/test-adversarial-security.js` | Created automated 16-test adversarial security verification suite. |

---

## 10. Production Security Readiness Verdict

**VERDICT: PASS — READY FOR NEXT PHASE**

All 7 security vulnerabilities identified in Phase 2.1 have been resolved with cryptographic HS256 JWT authentication, scrypt password verification, strict token-derived booking ownership enforcement, separated `verifyModeratorOrAdmin` and `verifyAdminOnly` role checks against live MongoDB records, and complete pre-departure/post-departure cancellation cutoff validation. All 16 adversarial security tests (`16/16 PASS`), all 37 backend verification tests (`37/37 PASS`), and the Angular production build (`0 errors`) pass without regressions.

