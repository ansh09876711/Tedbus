# TedBus — Phase 2.1 Independent Security Verification Report

**Audit Date:** October 31, 2026  
**Verification Mode:** Read-Only Source Inspection + Live Adversarial HTTP Attack Suite (`adversarial-security-tests.js`)  
**Files Modified in Workspace:** None (0 project source files modified; only this report created).

---

## Executive Summary

An independent adversarial security review of the Phase 2 remediation was conducted. Rather than relying on happy-path status codes from `server/test-verification.js`, a dedicated 15-test adversarial attack suite was executed against the live Express + MongoDB backend to test parameter spoofing, identity impersonation, privilege escalation, and cutoff boundary conditions.

| Security Area | Status | Summary of Findings |
| :--- | :---: | :--- |
| **1. Authentication & Booking Access Verification** | **FAIL** | Backend endpoints (`GET /booking`, `GET /booking/:id`, `PUT /booking/:id/cancel`) treat client-supplied `customerId` and `email` (in query params, headers, or body) as proof of identity without verifying a signed JWT or server session. |
| **2. Cancellation Security & Cutoff Enforcement** | **FAIL** | (a) An attacker who knows a victim's `email` or `customerId` can cancel the victim's booking by sending `{ email: victimEmail }` in the request body (`ADV-07`).<br>(b) The 2-hour cutoff check (`hoursUntilDeparture >= 0 && hoursUntilDeparture < 2`) allows cancelling bookings whose departure time has **already passed** (`hoursUntilDeparture < 0`, `ADV-08`). |
| **3. Moderator & Admin Role Security** | **FAIL** | (a) While `verifyModeratorOrAdmin` checks `customer.role` in MongoDB and ignores client-supplied `role` fields (`ADV-09`, `ADV-10`, `ADV-11` PASS), it accepts an unsigned `moderatorId` (`X-Moderator-Id`), allowing anyone who obtains a moderator/admin ObjectId to impersonate them (`ADV-12` FAIL).<br>(b) `verifyModeratorOrAdmin` does not distinguish `admin` from `moderator`, allowing moderators to execute admin-only actions (`ADV-13` FAIL). |
| **4. Route Initialization Security (`POST /routes/initialize`)** | **FAIL** | Idempotency check (`ADV-14`) and normal-user rejection (`ADV-09`) PASS, but the endpoint uses `verifyModeratorOrAdmin` instead of an admin-only check (`ADV-13` FAIL) and relies on an unsigned `moderatorId` (`ADV-12` FAIL). |
| **5. Notification Administrative Security** | **FAIL** | Normal users supplying their own ID are rejected (`ADV-15` PASS), but `POST /notifications/retry-failed`, `POST /notifications/trigger`, and `GET /notifications/delivery-history` accept an unsigned `moderatorId` and allow `moderator` role instead of `admin`-only. |
| **6. Automated Adversarial Test Suite** | **8 PASS / 7 FAIL** | 15 live adversarial tests executed against the Express server (`ADV-01` – `ADV-15`). |

---

## Detailed Security Review by Category

### 1. Authentication Verification (`server/middleware/auth.js`, `server/controller/booking.js`, `MyTripComponent`)

| Check | Classification | Technical Evidence |
| :--- | :---: | :--- |
| **Is the user authenticated through a trusted session or verified JWT?** | **FAIL** | Neither `server/middleware/auth.js` nor `server/controller/booking.js` issues or verifies a cryptographically signed token (HMAC/JWT) or server-side session. `MyTripComponent` reads `sessionStorage.getItem('Loggedinuser')` and sends raw `X-Customer-Id` and `X-Customer-Email` headers (`my-trip.component.ts` lines 53–60). |
| **Can someone access another customer's bookings by changing `customerId` or `email` in request parameters?** | **FAIL** | In `server/controller/booking.js` (lines 315–335), `getAllBookings` only rejects when *both* `req.query.customerId` and `req.headers['x-customer-id']` are present and unequal. An attacker who sends `GET /booking?customerId=<victimId>` (with no header, or with matching `X-Customer-Id: <victimId>`) or `GET /booking?email=<victimEmail>` or `GET /booking/<victimId>` receives HTTP 200 with all of the victim's bookings (`ADV-02`, `ADV-03`, `ADV-04`). |
| **Can an unauthenticated person impersonate another customer?** | **FAIL** | Yes. Because `customerId` and `email` are accepted directly from the client without a signed token, any unauthenticated requester can impersonate any customer. Furthermore, `POST /customer` (`server/controller/customer.js` lines 14–20) returns the existing `Customer` document (including `_id` and `role`) for any email address without authentication. |
| **Is booking ownership derived from the authenticated identity?** | **FAIL** | No. Ownership in `getAllBookings`, `getBooking`, and `cancelBooking` is compared against untrusted `req.body.customerId`, `req.query.customerId`, `req.headers['x-customer-id']`, or `req.body.email`. |

---

### 2. Cancellation Security (`PUT /booking/:id/cancel`)

| Check | Classification | Technical Evidence |
| :--- | :---: | :--- |
| **Unauthenticated user (no `customerId`/`email` supplied) cannot cancel a booking** | **PASS** | `server/controller/booking.js` lines 191–196 reject empty credentials with `HTTP 401 AuthenticationRequired` (`ADV-05`). |
| **Customer B cannot cancel Customer A's booking using Customer B's own ID/email** | **PASS** | `server/controller/booking.js` lines 214–224 reject mismatched `customerId`/`email` with `HTTP 403 BookingOwnershipMismatch` (`ADV-06`). |
| **Customer B cannot cancel Customer A's booking by spoofing Customer A's `customerId` or `email`** | **FAIL** | Because `cancelBooking` trusts `req.body.email` and `req.body.customerId` directly, Customer B can send `PUT /booking/<AliceBookingId>/cancel` with `{ "email": "alice@tedbus.com" }` and cancel Alice's booking (`ADV-07` returned `HTTP 200` and cancelled Alice's booking). |
| **Cancellation cutoff rule is strictly enforced (including past departures)** | **FAIL** | `server/controller/booking.js` line 234 checks `if (hoursUntilDeparture >= 0 && hoursUntilDeparture < 2)`. When a bus has **already departed** (`hoursUntilDeparture < 0`), the condition evaluates to `false`, allowing passengers to cancel completed/past journeys (`ADV-08` returned `HTTP 200` for a `2020-01-01` booking). The condition must be `if (hoursUntilDeparture < 2)`. |

---

### 3. Moderator & Admin Role Security (`server/middleware/auth.js`)

| Check | Classification | Technical Evidence |
| :--- | :---: | :--- |
| **Normal customer (`role: 'user'`) cannot access moderation endpoints** | **PASS** | `verifyModeratorOrAdmin` queries `Customer.findById(moderatorId)` and rejects `role === 'user'` with `HTTP 403 InsufficientPrivileges` (`ADV-09`). |
| **Unverified customer (`isVerified: false`) cannot access restricted moderation endpoints** | **PASS** | `verifyModeratorOrAdmin` (line 56) rejects `customer.isVerified === false` with `HTTP 403 UnverifiedModerator` (`ADV-10`). |
| **Verified moderator (`role: 'moderator'`) can access permitted moderation actions** | **PASS** | Verified in `Test 22` and `ADV-14`. |
| **Client-supplied `role` values (`req.body.role = 'admin'`, `X-Role: admin`) cannot grant privileges** | **PASS** | `verifyModeratorOrAdmin` ignores client-supplied role fields and reads `customer.role` from MongoDB (`ADV-11`). |
| **Moderator/Admin identity cannot be spoofed via raw `moderatorId`** | **FAIL** | `verifyModeratorOrAdmin` accepts a raw 24-hex `moderatorId` from `X-Moderator-Id`, `req.body.moderatorId`, or `req.query.moderatorId` without verifying a signed token (`ADV-12` returned `HTTP 200` when an unauthenticated attacker passed `X-Moderator-Id: <adminId>`). |
| **Admin-only actions require `role === 'admin'` (distinct from `moderator`)** | **FAIL** | `verifyModeratorOrAdmin` allows both `['moderator', 'admin']` on all protected endpoints. There is no `verifyAdminOnly` guard, so a `moderator` can execute admin-only operations (`ADV-13`). |

---

### 4. Route Initialization Security (`POST /routes/initialize`)

| Check | Classification | Technical Evidence |
| :--- | :---: | :--- |
| **Unrestricted public access is blocked** | **PASS** | Requests without a valid moderator/admin ID are rejected with `HTTP 401` / `HTTP 403`. |
| **Repeated requests cannot create duplicate route or bus records** | **PASS** | `initializeRoutesAndBuses` (`server/controller/route.js` lines 287–314) checks `Route.findById(r._id)` and `Bus.findById(b._id)` before inserting. A second call seeded `0` routes and `0` buses (`ADV-14`). |
| **Only an authorized administrator (`role === 'admin'`) can execute database seeding** | **FAIL** | Uses `verifyModeratorOrAdmin` instead of requiring `customer.role === 'admin'`, and relies on an unsigned `moderatorId` header/body field (`ADV-12`, `ADV-13`). |

---

### 5. Notification Security (`server/controller/notification.js`)

| Check | Classification | Technical Evidence |
| :--- | :---: | :--- |
| **Normal customers supplying their own ID cannot trigger or retry notifications** | **PASS** | Rejected with `HTTP 403 InsufficientPrivileges` (`ADV-15`). |
| **Protected against admin ID spoofing & enforces admin-only role** | **FAIL** | `retryFailedDeliveries`, `getDeliveryHistory`, and `triggerNotification` use `verifyModeratorOrAdmin` with an unsigned `moderatorId`, allowing `moderator` accounts or attackers spoofing an admin's ObjectId to abuse them (`ADV-12`). Additionally, user notification routes (`GET /notifications`, `POST /notifications/mark-all-read`, `PUT /notifications/preferences/:customerId`) trust raw `customerId` params without token verification. |

---

## 6. Automated Adversarial Test Results (`ADV-01` – `ADV-15`)

Executed against live Express server + MongoDB (`127.0.0.1:27017/tedbus`):

| Test ID | Adversarial Scenario | HTTP Response | Classification |
| :---: | :--- | :--- | :---: |
| **ADV-01** | Unauthenticated `GET /booking` with no parameters | `HTTP 401 AuthenticationRequired` | **PASS** |
| **ADV-02** | Unauthenticated attacker calls `GET /booking?customerId=<Alice._id>` | `HTTP 200` (Leaked Alice's booking) | **FAIL** |
| **ADV-03** | Unauthenticated attacker calls `GET /booking?email=<Alice.email>` | `HTTP 200` (Leaked Alice's booking) | **FAIL** |
| **ADV-04** | Unauthenticated attacker calls `GET /booking/<Alice._id>` | `HTTP 200` (Leaked Alice's booking) | **FAIL** |
| **ADV-05** | Unauthenticated `PUT /booking/<AliceBooking>/cancel` with empty body | `HTTP 401 AuthenticationRequired` | **PASS** |
| **ADV-06** | Bob tries to cancel Alice's booking using Bob's own `customerId` & `email` | `HTTP 403 BookingOwnershipMismatch` | **PASS** |
| **ADV-07** | Bob cancels Alice's booking by sending `{ email: Alice.email }` in request body | `HTTP 200` (Cancelled Alice's booking) | **FAIL** |
| **ADV-08** | Cancel a booking whose departure date (`2020-01-01`) has already passed (`hoursUntilDeparture < 0`) | `HTTP 200` (Cutoff bypassed for past date) | **FAIL** |
| **ADV-09** | Normal customer (`role: 'user'`) calls `GET /community/reports` | `HTTP 403 InsufficientPrivileges` | **PASS** |
| **ADV-10** | Unverified moderator (`isVerified: false`) calls `GET /community/reports` | `HTTP 403 UnverifiedModerator` | **PASS** |
| **ADV-11** | Normal user attempts privilege escalation via `body.role = 'admin'` and `X-Role: admin` | `HTTP 403 InsufficientPrivileges` | **PASS** |
| **ADV-12** | Unauthenticated attacker spoofs `X-Moderator-Id: <Admin._id>` without a signed token | `HTTP 200` (Granted access to reports) | **FAIL** |
| **ADV-13** | Moderator (`role: 'moderator'`, non-admin) calls admin-only `POST /routes/initialize` | `HTTP 200` (Moderator allowed to seed DB) | **FAIL** |
| **ADV-14** | Repeated `POST /routes/initialize` calls (idempotency check) | `HTTP 200` (`seededRoutes: 0, seededBuses: 0`) | **PASS** |
| **ADV-15** | Normal user (`role: 'user'`) calls `POST /notifications/retry-failed` | `HTTP 403 InsufficientPrivileges` | **PASS** |

---

## 7. Exact Required Fixes (Awaiting Your Approval Before Modifying Any Files)

To remediate all 7 `FAIL` findings and establish genuine cryptographic authentication and authorization without adding external dependencies:

1. **Issue & Verify Server-Signed Authentication Tokens (`server/middleware/auth.js` & `server/controller/customer.js`)**:
   - Use Node's built-in `crypto` module (`HMAC-SHA256` with `process.env.AUTH_SECRET` or a per-process secret key) to issue a signed token (`signAuthToken({ sub: customer._id, email: customer.email, role: customer.role })`) whenever a customer signs in via `POST /customer`.
   - Attach `authToken` to the customer response in `POST /customer`, store it in `sessionStorage` (`Loggedinuser.authToken`), and send it via `Authorization: Bearer <authToken>` from Angular (`MyTripComponent`, `ProfilePageComponent`, `CommunityComponent`, `PaymentPageComponent`).

2. **Derive Customer Identity & Booking Ownership Strictly from the Verified Token (`server/controller/booking.js`)**:
   - In `GET /booking`, `GET /booking/:id`, and `PUT /booking/:id/cancel`, authenticate the caller using `verifyCustomerAuth(req)` (which verifies the `Authorization: Bearer <token>` signature).
   - Reject any request without a valid signed token with `HTTP 401 AuthenticationRequired`.
   - Reject any request where `req.params.id`, `req.query.customerId`, `req.query.email`, or `booking.customerId`/`booking.email` does not match the token's verified `sub` (`customerId`) and `email` with `HTTP 403 Forbidden`.
   - Never trust raw `customerId` or `email` query/body/header parameters as proof of identity.

3. **Enforce Signed Token + Separate `verifyAdminOnly` vs `verifyModeratorOrAdmin` (`server/middleware/auth.js`)**:
   - Require a valid signed token in `verifyModeratorOrAdmin(req)` AND re-verify the user's current `role` and `isVerified` status in MongoDB (`Customer.findById(tokenPayload.sub)`), eliminating `X-Moderator-Id` spoofing (`ADV-12`).
   - Add `verifyAdminOnly(req)` requiring `customer.role === 'admin'` in MongoDB, and apply it to `POST /routes/initialize`, `POST /notifications/retry-failed`, `POST /notifications/trigger`, and `GET /notifications/delivery-history` (`ADV-13`).

4. **Fix Cancellation Cutoff for Past Departures (`server/controller/booking.js` line 234)**:
   - Change `if (hoursUntilDeparture >= 0 && hoursUntilDeparture < 2)` to `if (hoursUntilDeparture < 2)` so journeys that have already departed (`hoursUntilDeparture < 0`) or depart in under 2 hours cannot be cancelled (`ADV-08`).

---

*Stopping here per Phase 2.1 instructions. No project files have been modified. Please review and approve the above fixes to proceed.*

