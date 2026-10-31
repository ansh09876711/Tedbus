# TEDBUS — FINAL SECURITY REPORT

**Date:** October 31, 2026  
**Project:** TedBus (Angular 17 + Node.js/Express + MongoDB/Mongoose)  
**Verification Suite:** `server/test-adversarial-security.js` (`16/16 PASS`) & `server/test-verification.js` (`37/37 PASS`)

---

## 1. Security Architecture Summary

| Security Domain | Implementation Details | Verified Status |
| :--- | :--- | :---: |
| **Customer Credential Verification** | Passwords hashed with `crypto.scryptSync` (64-byte key, random 16-byte salt) and verified in constant time via `crypto.timingSafeEqual`. `passwordHash` and `passwordSalt` are marked `select: false` in `server/models/customer.js` and stripped before serialization. | **PASS** |
| **JWT Signing & Verification** | Standard RFC 7519 HS256 JWT (`alg: "HS256"`, `typ: "JWT"`) signed with `process.env.JWT_SECRET` in `server/middleware/auth.js`. Enforces signature integrity, canonical base64url encoding, expiration (`exp`), issuer (`iss: "tedbus-api"`), audience (`aud: "tedbus-client"`), and live MongoDB account existence (`Customer.findById(payload.sub)`). | **PASS** |
| **Frontend Token Management** | `AuthInterceptor` (`frontend/src/app/service/auth.interceptor.ts`) reads `AuthToken` / `Loggedinuser` from `sessionStorage` and attaches `Authorization: Bearer <token>` to outgoing HTTP requests. Cleared on logout. | **PASS** |
| **Booking Ownership & Isolation** | `GET /booking`, `GET /booking/:id`, and `PUT /booking/:id/cancel` require `verifyCustomerAuth`. Customer identity is derived exclusively from the verified token (`req.authUser`). Cross-customer queries or forged body/header identities return `HTTP 403`. | **PASS** |
| **Cancellation Cutoff Policy** | Enforces the 2-hour pre-departure cutoff AND blocks cancellation of trips whose scheduled departure time has already passed (`hoursUntilDeparture < 2`, including `< 0`), returning `HTTP 400 CancellationWindowClosed`. | **PASS** |
| **Role-Based Access Control (RBAC)** | Separated `verifyModeratorOrAdmin` (community & review moderation) from `verifyAdminOnly` (`POST /routes/initialize`, `POST /notifications/retry-failed`, `POST /notifications/trigger`, `GET /notifications/delivery-history`). Both verify the Bearer JWT and fetch the user's current `role` and `isVerified` status from MongoDB. | **PASS** |
| **Secrets & Diagnostic Hygiene** | No hardcoded secrets, passwords, or Atlas shard hostnames in source code. MongoDB URIs are masked (`maskMongoUri`) in server logs. | **PASS** |

---

## 2. Remediated Vulnerabilities

1. **`SEC-01` — Personal Developer Identity in Sign-In Modal:** Removed hardcoded developer name/email and unauthenticated client-side login fallback from `NavbarComponent`.
2. **`SEC-02` — Unauthenticated / Cross-Customer Booking Access:** Protected `GET /booking` and `GET /booking/:id` with `verifyCustomerAuth` and strict token-derived customer scoping.
3. **`SEC-03` — Unauthorized Booking Cancellation & Post-Departure Bypass:** Enforced token-derived ownership and blocked cancellations within 2 hours of departure or after departure.
4. **`SEC-04` — Unauthenticated Moderation & Admin Endpoints:** Replaced header-based `X-Moderator-Id` checks with JWT-backed `verifyModeratorOrAdmin` and `verifyAdminOnly` middlewares.
5. **`SEC-05` — Hardcoded Atlas Hostnames in Diagnostic Scripts:** Refactored `server/test-dns.js` and `server/test-tls.js` to read `process.env.MONGODB_URI` dynamically and mask credentials.

---

## 3. Adversarial Security Test Matrix (`server/test-adversarial-security.js`)

All 16 live HTTP adversarial test cases executed and passed (`16 PASS / 0 FAIL`):

| Test ID | Attack Vector Tested | Expected HTTP Response | Actual HTTP Response | Result |
| :--- | :--- | :--- | :--- | :---: |
| `ADV-01` | Missing Bearer token on `GET /booking`, `GET /booking/:id`, `PUT /booking/:id/cancel` (with spoofed `X-Customer-Id`) | `401 Unauthorized` | `401 AuthenticationRequired` | **PASS** |
| `ADV-02` | JWT signed with wrong secret key | `401 Unauthorized` | `401 InvalidTokenSignature` | **PASS** |
| `ADV-03` | Tampered JWT payload (`sub` and `role` modified without re-signing) | `401 Unauthorized` | `401 InvalidTokenSignature` | **PASS** |
| `ADV-04` | Expired JWT token (`exp` in the past) | `401 Unauthorized` | `401 TokenExpired` | **PASS** |
| `ADV-05` | Validly signed token for a deleted MongoDB customer account | `401 Unauthorized` | `401 AccountNotFound` | **PASS** |
| `ADV-06` | Customer A accessing Customer B's bookings via query/path parameters | `403 Forbidden` | `403 CustomerIsolationViolation` | **PASS** |
| `ADV-07` | Customer A attempting to cancel Customer B's booking | `403 Forbidden` | `403 BookingOwnershipMismatch` | **PASS** |
| `ADV-08` | Passwordless `POST /customer` login attempt & forged `customerId`/`email` in booking body | `401` / `403` | `401 CredentialsRequired` / `403` | **PASS** |
| `ADV-09` | Forged `X-Moderator-Id` and `X-Admin-Id` headers on `/community/reports` | `401` / `403` | `401` (unauth) / `403` (user token) | **PASS** |
| `ADV-10` | Forged `X-Role: admin` header and `role: "admin"` in registration/moderation body | `403 Forbidden` | `403`; DB role persisted as `"user"` | **PASS** |
| `ADV-11` | Moderator attempting admin-only endpoints (`/routes/initialize`, `/notifications/*`) | `403 Forbidden` | `403 AdminPrivilegesRequired` (`200` on moderation) | **PASS** |
| `ADV-12` | Unverified moderator (`isVerified: false`) attempting moderation actions | `403 Forbidden` | `403 UnverifiedModerator` | **PASS** |
| `ADV-13` | Unauthorized route initialization (`POST /routes/initialize`) & admin repeat-call idempotency | `401` / `403` / `0` duplicates | `401` / `403` / `seededRoutes=0, seededBuses=0` | **PASS** |
| `ADV-14` | Unauthorized notification retry, trigger, and delivery history access | `401` / `403` | `401` (unauth) / `403` (normal user) | **PASS** |
| `ADV-15` | Cancelling an already-departed journey (departure 3 hours ago) | `400 Bad Request` | `400 CancellationWindowClosed` | **PASS** |
| `ADV-16` | Cancelling a journey within the 2-hour pre-departure window (departs in 1 hour) | `400 Bad Request` | `400 CancellationWindowClosed` | **PASS** |

