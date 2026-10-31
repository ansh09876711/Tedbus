# TEDBUS — COMPREHENSIVE TESTING REPORT

**Date:** October 31, 2026  
**Project:** TedBus (Angular 17 + Node.js/Express + MongoDB/Mongoose)

---

## 1. Test Execution Summary

| Test Suite / Build Check | Command Executed | Total Checks | Passed | Failed | Verdict |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Angular 17 Production Build** | `npm --prefix frontend run build` | 1 | **1** | 0 | **PASS** |
| **Adversarial Security Verification Suite** | `node server/test-adversarial-security.js` | 16 | **16** | 0 | **PASS** |
| **End-to-End Functional & Integration Suite** | `node server/test-verification.js` | 37 | **37** | 0 | **PASS** |

---

## 2. Adversarial Security Test Results (`server/test-adversarial-security.js` — 16/16 PASS)

| ID | Test Case | Result | Verified Behavior |
| :--- | :--- | :---: | :--- |
| `ADV-01` | Missing Bearer token across booking endpoints | **PASS** | `GET /booking`, `GET /booking/:id`, `PUT /booking/:id/cancel` return `401` even when `X-Customer-Id` is sent. |
| `ADV-02` | Invalid JWT signature | **PASS** | Token signed with wrong secret returns `401 InvalidTokenSignature`. |
| `ADV-03` | Tampered JWT payload | **PASS** | Modifying `sub` or `role` without re-signing returns `401 InvalidTokenSignature`. |
| `ADV-04` | Expired JWT token | **PASS** | Token with past `exp` returns `401 TokenExpired`. |
| `ADV-05` | Deleted customer account | **PASS** | Token for deleted MongoDB customer returns `401 AccountNotFound`. |
| `ADV-06` | Cross-customer booking access | **PASS** | Customer A blocked (`403`) from querying Customer B's ID, email, or booking ID; own `GET /booking` returns only Customer A's bookings. |
| `ADV-07` | Cross-customer booking cancellation | **PASS** | Customer A blocked (`403`) from cancelling Customer B's booking; DB status remains `confirmed`. |
| `ADV-08` | Forged `customerId`/`email` in body & passwordless login | **PASS** | Passwordless/wrong-password `POST /customer` returns `401`; forged body identity on booking endpoints returns `403`. |
| `ADV-09` | Forged `X-Moderator-Id` and `X-Admin-Id` headers | **PASS** | Unauthenticated returns `401`; normal user token with forged headers returns `403`. |
| `ADV-10` | Forged `X-Role: admin` header & body `role: "admin"` | **PASS** | Moderation returns `403`; newly registered user is persisted with `role: "user"`. |
| `ADV-11` | Moderator attempting admin-only endpoints | **PASS** | Verified moderator gets `200` on `/community/reports` and `403 AdminPrivilegesRequired` on `/routes/initialize`, `/notifications/retry-failed`, `/notifications/trigger`, and `/notifications/delivery-history`. |
| `ADV-12` | Unverified moderator access | **PASS** | `isVerified: false` moderator rejected with `403 UnverifiedModerator` on community and review moderation. |
| `ADV-13` | Unauthorized route initialization & idempotency | **PASS** | Unauth returns `401`, normal user returns `403`, admin repeat call seeds `0` duplicate routes/buses. |
| `ADV-14` | Unauthorized notification retry, trigger & history | **PASS** | Unauth returns `401`; normal user returns `403 AdminPrivilegesRequired`. |
| `ADV-15` | Cancellation of already-departed journey | **PASS** | Booking that departed 3 hours ago returns `400 CancellationWindowClosed`; DB status stays `confirmed`. |
| `ADV-16` | Cancellation within 2-hour pre-departure cutoff | **PASS** | Booking departing in 1 hour returns `400 CancellationWindowClosed`; DB status stays `confirmed`. |

---

## 3. End-to-End Functional & Integration Test Results (`server/test-verification.js` — 37/37 PASS)

| Test # | Feature / Requirement Verified | Status |
| :---: | :--- | :---: |
| 1 | Angular Production Build (`frontend/dist/frontend/browser/index.html`) | **PASS** |
| 2 | Backend Express Startup & Health Check | **PASS** |
| 3 | MongoDB Connectivity & Index Synchronization | **PASS** |
| 4 | Database Read / Write / Delete Integrity | **PASS** |
| 5 | Booking Persistence via `POST /booking` (`X-Data-Source: mongodb`) | **PASS** |
| 6 | Offline Database Write Rejection (`HTTP 503 DatabaseUnavailable`) | **PASS** |
| 7 | Duplicate Seat Conflict Prevention (`HTTP 409 SeatConflict`) | **PASS** |
| 8 | Development & Production Environment File Replacements | **PASS** |
| 9 | CORS Origin & Exposed Header Verification | **PASS** |
| 10 | Bus Search & Seat Occupancy Endpoint (`GET /routes/:dep/:arr/:date`) | **PASS** |
| 11 | Customer Theme Preference (`light` / `dark` / `system`) Persistence | **PASS** |
| 12 | Customer Language Preference (`en` / `hi`) Persistence | **PASS** |
| 13 | Automatic Booking Notification Dispatch & Idempotency | **PASS** |
| 14 | Failed Notification Delivery Retry Engine (`POST /notifications/retry-failed`) | **PASS** |
| 15 | Review Eligibility Verification API (`GET /reviews/eligibility`) | **PASS** |
| 16 | Fake `bookingId` Review Rejection (`HTTP 403 BookingNotFound`) | **PASS** |
| 17 | Verified Journey Review Creation (`isVerifiedJourney: true`, `canEdit: true`) | **PASS** |
| 18 | Review Reporting & 24-Hour Edit Window Enforcement | **PASS** |
| 19 | Community Unverified Author Rejection (`HTTP 403 UnverifiedAuthor`) | **PASS** |
| 20 | Verified Community Post Creation (`POST /community/posts`) | **PASS** |
| 21 | Community Comments & Threaded Replies (`POST /community/posts/:id/comments`) | **PASS** |
| 22 | Community Content Reporting, Moderator Queue & User Profile Activity | **PASS** |
| 23 | Interactive Route Planner Polyline & Multi-Stop Calculation (`POST /saved-routes/calculate`) | **PASS** |
| 24 | Saved Route Coordinate Enrichment, Persistence & Deletion (`/saved-routes`) | **PASS** |
| 25 | `SEC-02`: Unauthenticated Booking Access Rejected (`HTTP 401`) | **PASS** |
| 26 | `SEC-02`: Authenticated Customer Booking Isolation (`HTTP 200` own / `HTTP 403` cross-customer) | **PASS** |
| 27 | `SEC-03`: Booking Ownership Enforcement During Cancellation (`HTTP 403` vs `HTTP 200`) | **PASS** |
| 28 | `SEC-04`: Role Escalation Prevention on Moderation Endpoints (`HTTP 403`) | **PASS** |
| 29 | `SEC-04`: Admin-Only Notification Retry Authorization (`HTTP 403`) | **PASS** |
| 30 | `BUG-08`: Route `GET` Request Idempotency (Zero Database Writes) | **PASS** |
| 31 | `BUG-02`: Selected Journey Date Persistence from Route Query Parameters | **PASS** |
| 32 | `BUG-01`: Boarding Point, Dropping Point & Amenities Bus Filtering | **PASS** |
| 33 | `BUG-03`: Dynamic Seat Availability Recalculation (`ngOnChanges`) | **PASS** |
| 34 | `BUG-04`: Promotional Coupon Copy Validation & Clipboard Feedback | **PASS** |
| 35 | `BUG-05`: Honest Wallet Empty State (No Fabricated ₹500 Balance) | **PASS** |
| 36 | `BUG-06`: Payment Netbanking Selection Value Consistency (`'HDFC Bank'`) | **PASS** |
| 37 | `SEC-01` & `BUG-07`: Navbar Identity Persistence & Removal of Developer PII | **PASS** |

---

## 4. Manual Testing Checklist

1. **Authentication Flow:**
   - Open Sign-In modal -> register with Name, Email, and Password (6+ chars) -> verify avatar initial appears in navbar and `AuthToken` is stored in `sessionStorage`.
   - Sign out -> attempt to sign in with wrong password -> verify `HTTP 401` error message is displayed in the modal.
2. **Bus Search, Filters & Seat Booking:**
   - Search `Delhi` -> `Jaipur` for a future date -> toggle Boarding Point, Dropping Point, and Amenity filters on the left sidebar -> verify bus cards filter immediately.
   - Click **View Seats**, select available seats, fill passenger details, and complete payment -> verify booking appears under **My Profile -> My Trips** with the exact selected travel date.
3. **Dark Mode & Bilingual (`en`/`hi`) Switching:**
   - Click the theme toggle in the navbar -> verify dark theme applies consistently across Navbar, Landing Page, Bus Search, Seat Selection, Booking Drawer, Payment Page, Community, Route Planner, and My Trips.
   - Click the language toggle (`English` / `हिन्दी`) -> verify UI labels switch immediately without page reload.

