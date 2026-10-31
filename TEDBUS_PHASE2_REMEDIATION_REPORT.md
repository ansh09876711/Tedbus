# TedBus — Phase 2: Security & Functional Bug Remediation Report

**Date:** October 30, 2026  
**Project Stack:** Angular 17 · Node.js · Express.js · MongoDB · Mongoose  
**Backup Checkpoint:** Saved prior to modifications at `scratch/pre_phase2_backup/` (`working_tree.patch`, `server/`, `frontend_src/`).  
**Verification Status:** **37 / 37 Automated Tests PASS** · **Angular 17 Production Build PASS (`exit code 0`)**

---

## 1. Summary of Remediated Issues

### Phase A — Critical Security Fixes (`SEC-01` – `SEC-05`)

| ID | Issue | Remediation Implemented | Status |
| :--- | :--- | :--- | :---: |
| **SEC-01** | Hardcoded developer name & email (`Ansh Agarwal` / `anshagarwal590@gmail.com`) in default demo login | Removed the `"Continue as Ansh Agarwal"` button, hardcoded personal email, and `handleDemoLogin()` from `NavbarComponent`. Added strict name/email validation to `handleDirectSignIn()`. | **FIXED & VERIFIED** |
| **SEC-02** | Unauthenticated `GET /booking` returning all customers' bookings & PII | Protected `GET /booking` and `GET /booking/:id` in `server/controller/booking.js` to require `customerId` or `email`, enforce header-to-query isolation (`403 CustomerIsolationViolation`), and return only the authenticated customer's bookings. Updated `MyTripComponent` to pass the authenticated user's `customerId`/`email` and `X-Customer-Id` header. | **FIXED & VERIFIED** |
| **SEC-03** | Unverified booking cancellation (`PUT /booking/:id/cancel`) | Enforced ownership verification in `cancelBooking` (`server/controller/booking.js`) so only the customer matching `booking.customerId` or `booking.email` can cancel. Preserved the 2-hour pre-departure cancellation cutoff rule (`400 CancellationWindowClosed`). | **FIXED & VERIFIED** |
| **SEC-04** | Unprotected moderation & administrative notification endpoints | Created `server/middleware/auth.js` (`verifyModeratorOrAdmin`) that queries MongoDB `Customer` by ID and verifies `isVerified !== false` and `role ∈ ['moderator', 'admin']` (never trusting client-supplied `role` fields). Enforced on `POST /reviews/:id/moderate`, `GET /community/reports`, `POST /community/posts/:id/moderate`, `POST /community/comments/:id/moderate`, `POST /notifications/retry-failed`, `GET /notifications/delivery-history`, and `POST /notifications/trigger`. | **FIXED & VERIFIED** |
| **SEC-05** | Hardcoded MongoDB Atlas shard hostnames in diagnostic scripts | Removed all hardcoded cluster/shard domains (`tedbus.uigd8cz.mongodb.net`, `ac-p8eoj1e-shard-00-*.uigd8cz.mongodb.net`) from `server/test-dns.js` and `server/test-tls.js`. Configured both scripts to read hostnames dynamically from environment variables (`MONGODB_URI`, `ATLAS_CLUSTER_HOST`, `ATLAS_TLS_HOSTS`) without printing credentials or connection strings. | **FIXED & VERIFIED** |

---

### Phase B — Functional Bug Fixes (`BUG-01` – `BUG-08`)

| ID | Issue | Remediation Implemented | Status |
| :--- | :--- | :--- | :---: |
| **BUG-01** | Left sidebar filters (Boarding Point, Dropping Point, Amenities) ignored by bus list | Implemented `selectedBoarding`, `selectedDropping`, and `amenities` filtering in `RightComponent.applyFiltersAndSorting()` (`getBusBoardingPoints`, `getBusDroppingPoints`, `getBusAmenities`) and extended `Bus` model interface in `bus.model.ts`. | **FIXED & VERIFIED** |
| **BUG-02** | `BusBookingFormComponent` hardcoded today's date instead of selected journey date | Injected `ActivatedRoute` in `BusBookingFormComponent` to read `date` from `queryParams` (`selectedJourneyDate`) and persist it in `bookingPayload.date`, `bookingPayload.bookingDate`, and `PaymentPageComponent.saveToLocalTrips()`. | **FIXED & VERIFIED** |
| **BUG-03** | `SmallSeatsComponent` did not update `isBooked` when `@Input() alreadybookedseats` changed | Implemented `OnChanges` in `SmallSeatsComponent` and `ViewSeatsComponent` so `isBooked` recalculates whenever `alreadybookedseats` changes and any newly booked seats are deselected. | **FIXED & VERIFIED** |
| **BUG-04** | Non-functional `"Copy code"` buttons on landing page offer cards | Implemented `copyCouponCode(code, event)` in `LandingPageComponent` with validation against `validPromoCodes` (`FIRST`, `SUPERHIT`, `BUS300`, `RBTRIP`, `WALLET`), clipboard copy, button state change (`✓ Copied!`), and an interactive feedback banner. | **FIXED & VERIFIED** |
| **BUG-05** | Fabricated `₹ 500.00` wallet balance and non-functional `"Add Money"` button | Removed hardcoded `₹ 500.00` balance and fake `"Add Money to Wallet"` button in `ProfilePageComponent`. Added real `walletBalance` binding with an honest `₹ 0.00` empty state when no wallet balance exists. | **FIXED & VERIFIED** |
| **BUG-06** | `HDFC` vs `HDFC Bank` value mismatch in `PaymentPageComponent` | Updated `selectedBank` initialization in `PaymentPageComponent` from `'HDFC'` to `'HDFC Bank'` to match the template radio button value. | **FIXED & VERIFIED** |
| **BUG-07** | Navbar user initial reset to `'U'` after page reload | Added `loggedInUser`, `userInitial`, `userDisplayName`, and `syncLoggedInUserFromStorage()` in `NavbarComponent` so the authenticated user's actual initial and name persist across page reloads. | **FIXED & VERIFIED** |
| **BUG-08** | `GET /routes/:departure/:arrival/:date` performed database writes (`Route.save`, `Bus.insertMany`) | Removed all database write operations from `GET /routes/:departure/:arrival/:date` in `server/controller/route.js`. Moved route/bus seeding into a separate admin-protected `POST /routes/initialize` endpoint (`initializeRoutesAndBuses`). | **FIXED & VERIFIED** |

---

## 2. Complete List of Modified & Created Files

### Backend (`server/`)
1. `server/middleware/auth.js` *(Created)* — Server-side `verifyModeratorOrAdmin` & `requireModeratorOrAdmin` authorization helper querying MongoDB `Customer` role.
2. `server/controller/booking.js` *(Modified)* — Added customer authentication & isolation to `getAllBookings` and `getBooking` (`SEC-02`), and ownership verification + 2-hour cutoff enforcement to `cancelBooking` (`SEC-03`).
3. `server/controller/review.js` *(Modified)* — Enforced `verifyModeratorOrAdmin` on `moderateReview` (`SEC-04`).
4. `server/controller/community.js` *(Modified)* — Enforced `verifyModeratorOrAdmin` on `getReports`, `moderatePost`, and `moderateComment` (`SEC-04`).
5. `server/controller/notification.js` *(Modified)* — Enforced `verifyModeratorOrAdmin` on `retryFailedDeliveries`, `getDeliveryHistory`, and `triggerNotification` (`SEC-04`).
6. `server/controller/route.js` *(Modified)* — Removed all database writes from `getoneroute`, scoped booking lookup by bus & date, and moved seeding to `initializeRoutesAndBuses` (`BUG-08`).
7. `server/routes/route.js` *(Modified)* — Registered `POST /routes/initialize` for controlled route/bus initialization (`BUG-08`).
8. `server/test-dns.js` *(Modified)* — Removed hardcoded Atlas domain and read host from environment variables without printing credentials (`SEC-05`).
9. `server/test-tls.js` *(Modified)* — Removed hardcoded Atlas shard hostnames and read hosts from environment variables (`SEC-05`).
10. `server/test-verification.js` *(Modified)* — Added Tests 25–37 verifying all Phase 2 security and functional fixes.

### Frontend (`frontend/`)
11. `frontend/src/app/Component/navbar/navbar.component.ts` *(Modified)* — Removed `handleDemoLogin()`, added `syncLoggedInUserFromStorage()`, `userInitial`, `userDisplayName`, and input validation (`SEC-01`, `BUG-07`).
12. `frontend/src/app/Component/navbar/navbar.component.html` *(Modified)* — Removed `"Continue as Ansh Agarwal"` / `"anshagarwal590@gmail.com"` block and bound `{{ userInitial }}` and `{{ userDisplayName }}` (`SEC-01`, `BUG-07`).
13. `frontend/src/app/Component/profile-page/my-trip/my-trip.component.ts` *(Modified)* — Scoped `loadTrips()` and `cancelTrip()` to the authenticated customer (`SEC-02`, `SEC-03`).
14. `frontend/src/app/Component/profile-page/profile-page.component.ts` *(Modified)* — Added `walletBalance` and `walletTransactions` state (`BUG-05`).
15. `frontend/src/app/Component/profile-page/profile-page.component.html` *(Modified)* — Replaced fabricated `₹ 500.00` wallet balance and fake `"Add Money"` button with real balance / empty state (`BUG-05`).
16. `frontend/src/app/Component/community/community.component.ts` *(Modified)* — Passed authenticated `moderatorId` (`X-Moderator-Id`) on moderation requests and handled `401`/`403` responses (`SEC-04`).
17. `frontend/src/app/model/bus.model.ts` *(Modified)* — Added optional `boardingPoints`, `droppingPoints`, and `amenities` fields to `Bus` interface (`BUG-01`).
18. `frontend/src/app/Component/selectbus-page/right/right.component.ts` *(Modified)* — Implemented Boarding Point, Dropping Point, and Amenities filter predicates in `applyFiltersAndSorting()` (`BUG-01`).
19. `frontend/src/app/Component/selectbus-page/right/bus-booking-form/bus-booking-form.component.ts` *(Modified)* — Read journey `date` from `ActivatedRoute.queryParams` instead of hardcoding today's date (`BUG-02`).
20. `frontend/src/app/Component/selectbus-page/right/small-seats/small-seats.component.ts` *(Modified)* — Implemented `OnChanges` to update `isBooked` dynamically when `alreadybookedseats` changes (`BUG-03`).
21. `frontend/src/app/Component/selectbus-page/right/view-seats/view-seats.component.ts` *(Modified)* — Implemented `OnChanges` to prune newly booked seats from `selectedseats` (`BUG-03`).
22. `frontend/src/app/Component/landing-page/landing-page.component.ts` *(Modified)* — Added `copyCouponCode()` with `validPromoCodes` validation and timed user feedback (`BUG-04`).
23. `frontend/src/app/Component/landing-page/landing-page.component.html` *(Modified)* — Bound `(click)="copyCouponCode(...)"` and added feedback banner on offer cards (`BUG-04`).
24. `frontend/src/app/Component/payment-page/payment-page.component.ts` *(Modified)* — Fixed `selectedBank = 'HDFC Bank'` default value (`BUG-06`) and preserved selected travel date in `saveToLocalTrips()` (`BUG-02`).

---

## 3. Build & Automated Test Verification Results

### Angular 17 Production Build
- **Command:** `npm --prefix frontend run build`
- **Result:** **PASS (`exit code 0`)**
- **Output Bundle:** `frontend/dist/frontend` (`main-TB7UE5GH.js`, `styles-KWHPZXRR.css`, `polyfills-FFHMD2TL.js`)

### Full-Stack Automated Verification Suite (`node server/test-verification.js`)
- **Result:** **37 / 37 Tests PASS (`0` failures)**

| Test # | Test Name | Status |
| :---: | :--- | :---: |
| 1 | Angular Production Build | **PASS** |
| 2 | Backend Startup | **PASS** |
| 3 | MongoDB Connection Test | **PASS** |
| 4 | Actual Database Read/Write | **PASS** |
| 5 | Booking Persistence Test | **PASS** |
| 6 | Failed Database Write Test (HTTP 503) | **PASS** |
| 7 | Duplicate Seat Booking Test (HTTP 409) | **PASS** |
| 8 | API Configuration Test | **PASS** |
| 9 | CORS Verification | **PASS** |
| 10 | Bus Search Regression Test | **PASS** |
| 11 | Customer Theme Preference API Test | **PASS** |
| 12 | Customer Language Preference API Test | **PASS** |
| 13 | Notification Event Hook & Idempotency | **PASS** |
| 14 | Notification Retry Mechanism Test | **PASS** |
| 15 | Review Eligibility Check API | **PASS** |
| 16 | Strict Booking Verification (Fake BookingId Rejected) | **PASS** |
| 17 | Verified Review Submission (Real Booking) | **PASS** |
| 18 | Review Report API & 24-Hour Edit Window | **PASS** |
| 19 | Community Strict Author Verification | **PASS** |
| 20 | Verified Community Post Creation | **PASS** |
| 21 | Community Comments & Threaded Replies API | **PASS** |
| 22 | Community Reporting, Moderation & Profile Activity | **PASS** |
| 23 | Route Planner Polyline & Coordinate API | **PASS** |
| 24 | Saved Route Coordinate Persistence & Delete API | **PASS** |
| 25 | **SEC-02:** Unauthorized Booking Access Rejected (HTTP 401) | **PASS** |
| 26 | **SEC-02:** Customer Booking Isolation (HTTP 200 / HTTP 403) | **PASS** |
| 27 | **SEC-03:** Booking Ownership During Cancellation (HTTP 403 / HTTP 200) | **PASS** |
| 28 | **SEC-04:** Admin-Only Moderation Enforcement (HTTP 403) | **PASS** |
| 29 | **SEC-04:** Notification Retry Authorization (HTTP 403) | **PASS** |
| 30 | **BUG-08:** Route GET Without Database Writes (0 DB writes) | **PASS** |
| 31 | **BUG-02:** Selected Journey Date Persistence | **PASS** |
| 32 | **BUG-01:** Boarding, Dropping & Amenities Filters | **PASS** |
| 33 | **BUG-03:** Dynamic Seat Availability (`ngOnChanges`) | **PASS** |
| 34 | **BUG-04:** Coupon Copy Functionality & Feedback | **PASS** |
| 35 | **BUG-05:** Honest Wallet Empty State | **PASS** |
| 36 | **BUG-06:** Payment Bank Selection Consistency (`'HDFC Bank'`) | **PASS** |
| 37 | **SEC-01 & BUG-07:** Navbar Identity & Demo Login Removal | **PASS** |

---

## 4. Remaining Non-Critical Items (Deferred Per Instructions)

Per Phase 2 instructions (*"STOP after Phase 2. Do not begin visual cleanup or delete files without my approval"*), the following non-critical cleanup and visual items from `TEDBUS_CODE_QUALITY_REPORT.md` remain untouched awaiting your approval:
- **REM-01**: Stray root files (`console.log('HTTP'`, `{`, `powershell.cmd`, `fix_angular_json.py`).
- **REM-03 / REM-04**: Unused service methods (`BusService.addbusmongo`/`getbusmongo`, `DataserviceService.passobj`) and unused `mongodb` package in `server/package.json`.
- **REM-05 / REM-06**: Landing page App Download mockup section and dead `javascript:void(0)` links in `footer.component.html`.
- **IMP-03 / IMP-04 / IMP-06 / IMP-07**: Visual & dark-mode refinements in `bus-box`, `my-trip`, `bus-booking-form`, `view-seats`, and `landing-page` FAQ accordion toggle.

