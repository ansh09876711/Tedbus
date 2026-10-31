# TedBus — Professional Code Quality & UI Cleanup Audit Report

**Audit Date:** October 30, 2026  
**Project Stack:** Angular 17 · Node.js · Express.js · MongoDB (Mongoose) · Tailwind CSS · Angular Material  
**Audit Scope:** Full-stack read-only inspection across Frontend UI, Angular Architecture, Node/Express Backend, Content & Datasets, Code Quality, and Build/Runtime Verification.  
**Audit Status:** Phase 1 & Phase 2 Complete (Read-Only — Zero source files modified).

---

## Executive Summary

| Classification | Count | Summary |
| :--- | :---: | :--- |
| **SECURITY ISSUE** | **5** | Hardcoded personal developer email/identity in sign-in modal; unauthenticated bulk booking exposure (`GET /booking`); unverified booking cancellation (`PUT /booking/:id/cancel`); unverified moderator & notification trigger endpoints; hardcoded MongoDB Atlas shard hostnames in diagnostic scripts. |
| **FUNCTIONAL BUG** | **10** | Non-functional `"Continue as Ansh Agarwal"` button; broken left-sidebar filters (Boarding, Dropping, Amenities never applied); `BusBookingFormComponent` hardcoding today's date instead of selected travel date; `MyTripComponent` fetching all users' bookings; `SmallSeatsComponent` not updating booked state on input change; non-functional promo `"Copy code"` buttons; non-functional `"Add Money to Wallet"` button; mismatched default netbanking selection (`'HDFC'` vs `'HDFC Bank'`); stale navbar avatar initial on reload; `GET /routes/:dep/:arr/:date` mutating database on read. |
| **SAFE TO REMOVE** | **8** | Stray root files (`console.log('HTTP'`, `{`, `fix_angular_json.py`, `powershell.cmd`); diagnostic scripts (`server/test-dns.js`, `server/test-tls.js`); dead methods (`MyTripComponent.addDefaultDemoTrip`, `BusService.addbusmongo`, `BusService.getbusmongo`, `DataserviceService.passobj`); unused dependencies (`mongodb` native driver in `server/package.json`, `body-parser` in `server/index.js`); fake App Download banner & dead footer links. |
| **NEEDS IMPROVEMENT** | **16** | Full-collection in-memory queries in `server/controller/route.js`; hardcoded `[3, 7, 18, 25]` occupied seats fallback; hardcoded `reDeal applied (Flat ₹100 Off)` badge & static amenities on all buses; fabricated review count formula in `BusBoxComponent`; fake unauthenticated fallback profiles/bookings on `/profile` and `/payment`; missing dark-mode classes in `my-trip`, `bus-booking-form`, `view-seats`, and `form-drawer`; unsubscribed RxJS observables; weak TypeScript typing (`any`) and naming typos (`seatprivce`, `routedetials`); permanently expanded FAQ items; fragile `app._router.stack` inspection. |
| **MUST KEEP** | **6** | `frontend/routedata.json` & `frontend/busdata.json` fallback datasets; atomic booking creation & 2-hour cancellation lock in `server/controller/booking.js`; verified review lifecycle & 24-hour edit window in `server/controller/review.js`; community hub & moderation system; `TranslationService` (`en`/`hi`) & `ThemeService` (`light`/`dark`/`system`); automated verification suite (`server/test-verification.js`). |

---

## Section 1 — SECURITY ISSUES

### SEC-01: Hardcoded Personal Developer Name & Email in Sign-In Modal
- **Classification:** `SECURITY ISSUE` (also `FUNCTIONAL BUG` & `SAFE TO REMOVE`)
- **File path:**
  - `frontend/src/app/Component/navbar/navbar.component.html` (lines 176–184)
  - `frontend/src/app/Component/navbar/navbar.component.ts` (lines 152–154)
- **Current problem:** Inside the Sign-In modal, when Google Sign-In is not initialized or fails to load, a fallback button renders with hardcoded personal developer information: `"Continue as Ansh Agarwal"` and `"anshagarwal590@gmail.com"`. Furthermore, clicking this button invokes `handleDemoLogin()`, which only calls `this.openAuthModal()` while the modal is already open — doing nothing.
- **Why it should be changed:** Exposes personal developer PII (`anshagarwal590@gmail.com`) in the production UI bundle and confuses users with a broken button bearing a specific person's name.
- **Recommended solution:** Remove the hardcoded `"Continue as Ansh Agarwal"` block from `navbar.component.html` and `handleDemoLogin()` from `navbar.component.ts`. The modal already has a clean Email + Name Sign-In form (`handleEmailSignIn()`) right below the divider.
- **Risk of modification:** **Low** — Removing the dead button and method has no impact on Google OAuth or the Email Sign-In form.

---

### SEC-02: Unauthenticated Exposure of All Customers' Bookings (`GET /booking`)
- **Classification:** `SECURITY ISSUE` (also `FUNCTIONAL BUG`)
- **File path:**
  - `server/controller/booking.js` (lines 254–268, `exports.getAllBookings`)
  - `frontend/src/app/Component/profile-page/my-trip/my-trip.component.ts` (lines 27–38)
- **Current problem:** `GET /booking` accepts an optional `?customerId=` query parameter. When `customerId` is omitted, `Booking.find({})` returns **every booking in the database across all customers**, including passenger names, ages, genders, emails, and phone numbers. Worse, `MyTripComponent.fetchBookingsFromMongo()` calls `this.http.get<any[]>(\`${url}booking\`)` without passing `customerId`, causing every user who visits `/profile` (or the My Trips component) to download and merge all other users' bookings into their trip list.
- **Why it should be changed:** Violates data privacy by leaking PII of all passengers to any client and causes users to see strangers' bookings in their own account.
- **Recommended solution:**
  1. In `server/controller/booking.js` (`getAllBookings`), require `customerId` (or `email`) as a mandatory filter, returning `400 Bad Request` if neither is provided.
  2. In `frontend/src/app/Component/profile-page/my-trip/my-trip.component.ts`, pass the logged-in user's `_id` (`GET /booking/${customerId}`) instead of calling `GET /booking` unfiltered, and skip the request when unauthenticated.
- **Risk of modification:** **Low** — `server/test-verification.js` and `ProfilePageComponent` already use `/booking/:customerId` or `/booking?customerId=...`.

---

### SEC-03: Unverified Booking Cancellation (`PUT /booking/:id/cancel`)
- **Classification:** `SECURITY ISSUE`
- **File path:**
  - `server/controller/booking.js` (lines 176–229, `exports.cancelBooking`)
  - `server/routes/booking.js` (line 8)
- **Current problem:** `PUT /booking/:id/cancel` looks up a booking solely by `:id` and cancels it without verifying that the caller (`customerId` or `email`) owns the booking.
- **Why it should be changed:** Any user who knows or guesses a booking ID can cancel another passenger's confirmed bus ticket.
- **Recommended solution:** Validate ownership in `cancelBooking` by checking that `req.body.customerId` or `req.body.email` matches `booking.customerId` or `booking.email` when `booking.customerId` is not `'guest'`. Pass `customerId`/`email` from `ProfilePageComponent.cancelBooking()`.
- **Risk of modification:** **Low** — Ensure backward compatibility when `req.body.customerId` is optional in automated tests (`server/test-verification.js`), or enforce matching only when `customerId` is supplied / present on the booking.

---

### SEC-04: Unverified Moderator & System Notification Endpoints
- **Classification:** `SECURITY ISSUE`
- **File path:**
  - `server/controller/review.js` (lines 285–326, `exports.moderateReview`)
  - `server/controller/community.js` (lines 275–345, `exports.moderatePost`, `exports.moderateComment`, `exports.getReportsQueue`)
  - `server/controller/notification.js` (lines 240–279, `exports.triggerNotification`, `exports.retryFailedNotifications`)
- **Current problem:** Moderation endpoints (`POST /reviews/:id/moderate`, `POST /community/posts/:id/moderate`, `POST /community/comments/:id/moderate`, `GET /community/reports`) and notification administrative endpoints (`POST /notifications/trigger`, `POST /notifications/retry-failed`) do not verify that `moderatorId` belongs to a user with `role === 'moderator'` or `'admin'` (or an admin header/token).
- **Why it should be changed:** Any regular user could hide/restore community posts or reviews or trigger arbitrary notifications for other customers.
- **Recommended solution:** Add a lightweight role/authorization helper that verifies `moderatorId` (when referencing a `Customer` document) or validates `role` in `Customer`, while keeping support for the automated verification test runner (`server/test-verification.js`).
- **Risk of modification:** **Medium** — `server/test-verification.js` tests moderation and notification triggers directly; any guard must remain compatible with the test harness.

---

### SEC-05: Hardcoded MongoDB Atlas Shard Hostnames in Diagnostic Scripts
- **Classification:** `SECURITY ISSUE` (also `SAFE TO REMOVE`)
- **File path:**
  - `server/test-dns.js` (lines 1–12)
  - `server/test-tls.js` (lines 1–20)
- **Current problem:** Contains hardcoded internal MongoDB Atlas cluster and shard hostnames (`tedbus.uigd8cz.mongodb.net` and `ac-p8eoj1e-shard-00-00.uigd8cz.mongodb.net`).
- **Why it should be changed:** Exposes cloud database cluster topology in version control and serves no runtime or automated test purpose.
- **Recommended solution:** Delete `server/test-dns.js` and `server/test-tls.js`.
- **Risk of modification:** **Low** — Neither file is imported or executed by the server or test suite.

---

## Section 2 — FUNCTIONAL BUGS

### BUG-01: Left Sidebar Filters (Boarding Point, Dropping Point, Amenities) Never Filter the Bus List
- **Classification:** `FUNCTIONAL BUG`
- **File path:**
  - `frontend/src/app/Component/selectbus-page/right/right.component.ts` (lines 89–198, `applyFiltersAndSorting()`)
  - `frontend/src/app/Component/selectbus-page/left/left.component.html` (lines 41–68, 128–160)
  - `frontend/src/app/Component/selectbus-page/right/sorting-bar/sorting-bar.component.html` (lines 48–60)
- **Current problem:** `LeftComponent` allows users to select a **Boarding Point** (`selectedBoarding`), **Dropping Point** (`selectedDropping`), and **Amenities** (`wifi`, `waterBottle`, `blankets`, `chargingPoint`, `movie`), and `SortingBarComponent` even renders active filter chips for them. However, `RightComponent.applyFiltersAndSorting()` only checks `liveTracking`, `reschedulable`, `selectedOperator`, `priceRange`, `busType`, `departureTime`, and `arrivalTime` — it completely ignores `state.selectedBoarding`, `state.selectedDropping`, and `state.amenities`.
- **Why it should be changed:** Selecting Boarding Point, Dropping Point, or Amenity checkboxes updates the active filter count and filter chips, but has zero effect on the displayed buses.
- **Recommended solution:** Update `RightComponent.applyFiltersAndSorting()` to filter buses by `selectedBoarding` (checking `routeDetails.departureLocation.subLocations` or bus boarding points), `selectedDropping` (checking `routeDetails.arrivalLocation.subLocations`), and `amenities` (matching bus amenities/type).
- **Risk of modification:** **Low** — Improves filter accuracy without breaking existing filter criteria.

---

### BUG-02: `BusBookingFormComponent` Hardcodes Today's Date Instead of Selected Travel Date
- **Classification:** `FUNCTIONAL BUG`
- **File path:**
  - `frontend/src/app/Component/selectbus-page/right/bus-booking-form/bus-booking-form.component.ts` (line 83)
- **Current problem:** When constructing `bookingPayload` in `onSubmit()`, line 83 sets `date: new Date().toISOString().split('T')[0]`. It ignores the travel `date` query parameter from the `/select-bus?departure=...&arrival=...&date=...` route!
- **Why it should be changed:** If a passenger searches for a bus on a future date (e.g., next Friday) and books seats through the booking drawer, the reservation is recorded in MongoDB for **today's date** instead of the selected journey date. Consequently, seat occupancy on the future date is not updated, and the user's ticket shows the wrong travel date.
- **Recommended solution:** Inject `ActivatedRoute` in `BusBookingFormComponent` (or pass `date` via `@Input()`) so `bookingPayload.date` uses the selected journey date (`this.route.snapshot.queryParamMap.get('date') || new Date().toISOString().split('T')[0]`).
- **Risk of modification:** **Low** — Directly fixes a critical booking date mismatch.

---

### BUG-03: `SmallSeatsComponent` Does Not Re-Evaluate Booked Seats When `@Input() alreadybookedseats` Changes
- **Classification:** `FUNCTIONAL BUG`
- **File path:**
  - `frontend/src/app/Component/selectbus-page/right/small-seats/small-seats.component.ts` (lines 8–21)
- **Current problem:** `SmallSeatsComponent` only sets `this.isBooked = true` inside `ngOnInit()` and never resets `this.isBooked = false` or implements `ngOnChanges()`. If the user changes the travel date or route in the header while on `/select-bus`, or if `filledseats` updates asynchronously, `isBooked` remains stale.
- **Why it should be changed:** Causes seats from a previous search/date to remain marked as booked (or newly booked seats to appear available).
- **Recommended solution:** Implement `OnChanges` in `SmallSeatsComponent` (or compute `isBooked` dynamically: `this.isBooked = Boolean(this.alreadybookedseats?.includes(this.seatno))`). Also remove the unused `isSelected: boolean = false` property on line 15.
- **Risk of modification:** **Low** — Pure UI state synchronization fix.

---

### BUG-04: Landing Page Offer Cards Have Non-Functional `"Copy code"` Buttons
- **Classification:** `FUNCTIONAL BUG`
- **File path:**
  - `frontend/src/app/Component/landing-page/landing-page.component.html` (lines 246–334)
  - `frontend/src/app/Component/landing-page/landing-page.component.ts`
- **Current problem:** All 5 promotional offer cards (`FIRST`, `SUPERHIT`, `BUS300`, `RBTRIP`, `WALLET`) render a dashed code badge with `"Copy code"` and `cursor-pointer`, but have no `(click)` event binding. Clicking them does nothing.
- **Why it should be changed:** Users expect clicking `"Copy code"` to copy the coupon code to their clipboard and show visual confirmation (e.g., `"Copied!"`).
- **Recommended solution:** Add a `copyPromoCode(code: string)` method in `LandingPageComponent` using `navigator.clipboard.writeText(code)` with a `copiedCode` state variable that temporarily changes the label to `"Copied!"`.
- **Risk of modification:** **Low** — Self-contained UX fix in `LandingPageComponent`.

---

### BUG-05: Profile Page Wallet Tab Shows Static `₹ 500.00` Balance & Non-Functional `"Add Money"` Button
- **Classification:** `FUNCTIONAL BUG` (also `NEEDS IMPROVEMENT`)
- **File path:**
  - `frontend/src/app/Component/profile-page/profile-page.component.html` (lines 274–286)
- **Current problem:** In `ProfilePageComponent`, when `activeTab === 'wallet'`, the template displays a hardcoded `₹ 500.00` balance and an `"Add Money to Wallet"` button with no `(click)` handler.
- **Why it should be changed:** Presents static placeholder text as live financial balance and includes a dead CTA button.
- **Recommended solution:** Either remove the `"My Wallet"` tab from the profile sidebar or replace it with a clean, honest travel spending summary computed from the user's actual `bookings` (e.g., Total Trips Booked, Total Amount Spent, Total Refunds/Cancellations).
- **Risk of modification:** **Low** — Eliminates a fake feature and dead button.

---

### BUG-06: Payment Page Default Netbanking Selection Mismatch (`'HDFC'` vs `'HDFC Bank'`)
- **Classification:** `FUNCTIONAL BUG`
- **File path:**
  - `frontend/src/app/Component/payment-page/payment-page.component.ts` (line 30)
  - `frontend/src/app/Component/payment-page/payment-page.component.html` (line 99)
- **Current problem:** `PaymentPageComponent` initializes `selectedBank: string = 'HDFC'`, whereas the radio inputs in `payment-page.component.html` bind to `['SBI', 'HDFC Bank', 'ICICI Bank', 'Axis Bank']`. As a result, when a user switches to the Netbanking tab, no bank radio button is selected despite `selectedBank` being truthy.
- **Why it should be changed:** Visual state does not match component state.
- **Recommended solution:** Initialize `selectedBank: string = 'HDFC Bank'` in `payment-page.component.ts`.
- **Risk of modification:** **Low** — Trivial 1-line fix.

---

### BUG-07: Navbar Avatar Initial Falls Back to `'U'` After Page Reload
- **Classification:** `FUNCTIONAL BUG`
- **File path:**
  - `frontend/src/app/Component/navbar/navbar.component.html` (line 108)
  - `frontend/src/app/Component/navbar/navbar.component.ts` (lines 55–68)
- **Current problem:** In `navbar.component.html` line 108, when a logged-in user does not have a Google profile picture (e.g., after signing in via the Email form) and reloads the page, the fallback badge displays `{{ (loginName || 'U')[0] | uppercase }}` instead of `{{ (loggedInUser?.name || loginName || 'U')[0] | uppercase }}`. Because `loginName` is cleared after sign-in and stays empty on reload, the user's initial always resets to `'U'`.
- **Why it should be changed:** Displays `'U'` instead of the logged-in user's actual first initial.
- **Recommended solution:** Bind to `(loggedInUser?.name || 'U')[0] | uppercase` and expose a typed `loggedInUser` property on `NavbarComponent` synchronized with `sessionStorage`.
- **Risk of modification:** **Low** — Improves navbar consistency.

---

### BUG-08: `GET /routes/:departure/:arrival/:date` Mutates MongoDB by Inserting Synthetic Routes & Buses on Read
- **Classification:** `FUNCTIONAL BUG` (also `NEEDS IMPROVEMENT`)
- **File path:**
  - `server/controller/route.js` (lines 114–237)
- **Current problem:** When a client calls `GET /routes/:departure/:arrival/:date` for any city pair not found in the `Routes` collection (including arbitrary strings or typos), the `GET` handler calls `Route.create(newRouteData)` and `Bus.insertMany(generatedBuses)`, permanently writing synthetic routes and 3 generated buses into MongoDB.
- **Why it should be changed:** Violates HTTP `GET` idempotency/safety semantics and permanently pollutes the `Routes` and `Buses` collections whenever someone searches an arbitrary city name.
- **Recommended solution:** Serve fallback route and bus objects in-memory (or only seed known canonical routes from `frontend/routedata.json`) without calling `Route.create()` / `Bus.insertMany()` on arbitrary `GET` requests.
- **Risk of modification:** **Medium** — `server/test-verification.js` checks `GET /routes/Mumbai/Pune/2026-04-15`; returning the synthesized route and buses in the response payload (without polluting MongoDB for arbitrary strings, or keeping in-memory fallback) will keep all 24 tests passing.

---

## Section 3 — SAFE TO REMOVE

### REM-01: Stray Zero-Byte & Temporary Root Files
- **Classification:** `SAFE TO REMOVE`
- **File path:**
  - `console.log('HTTP'` (0 bytes, root directory)
  - `{` (0 bytes, root directory)
  - `powershell.cmd` (73 bytes, root directory)
  - `fix_angular_json.py` (575 bytes, root directory)
- **Current problem:** Accidental shell artifacts (`console.log('HTTP'`, `{`, `powershell.cmd`) and a one-off Python migration script (`fix_angular_json.py`) are sitting in the repository root.
- **Why it should be changed:** Clutters the project root and looks unprofessional in version control.
- **Recommended solution:** Delete all four files from the workspace root.
- **Risk of modification:** **Low** — None of these files are referenced anywhere.

---

### REM-02: Unused `addDefaultDemoTrip()` Method in `MyTripComponent`
- **Classification:** `SAFE TO REMOVE`
- **File path:**
  - `frontend/src/app/Component/profile-page/my-trip/my-trip.component.ts` (lines 52–70)
- **Current problem:** `private addDefaultDemoTrip()` creates a hardcoded `'VRL Travels'` Bangalore-to-Chennai trip for `'Passenger 1'`, but the method is never called anywhere in `MyTripComponent`.
- **Why it should be changed:** Dead code containing fake placeholder booking data.
- **Recommended solution:** Remove `addDefaultDemoTrip()` from `my-trip.component.ts`.
- **Risk of modification:** **Low** — Private method with 0 callers.

---

### REM-03: Unused Methods in `BusService` and `DataserviceService`
- **Classification:** `SAFE TO REMOVE`
- **File path:**
  - `frontend/src/app/service/bus.service.ts` (lines 228–252, `addbusmongo` and `getbusmongo`)
  - `frontend/src/app/service/dataservice.service.ts` (lines 12–13, 21–23, `passdetails`, `passdata`, `passobj`)
- **Current problem:**
  - `BusService.addbusmongo()` and `BusService.getbusmongo()` are never called by any component (`PaymentPageComponent` and `ProfilePageComponent` use `HttpClient` directly).
  - `DataserviceService.passdetails`, `passdata`, and `passobj()` are never referenced anywhere in the frontend.
  - `DataserviceService` also defines duplicate `currentdata` / `currentData` observables and `sendobj()` / `setData()` methods.
- **Why it should be changed:** Dead service methods and duplicate aliases increase maintenance overhead and confuse developers about which API call path is active.
- **Recommended solution:** Remove `passdetails`, `passdata`, `passobj` from `DataserviceService`, and remove unused `addbusmongo`/`getbusmongo` from `BusService` (or consolidate booking HTTP calls through `BusService`).
- **Risk of modification:** **Low** — Verified zero references across `frontend/src`.

---

### REM-04: Unused `mongodb` Driver & Redundant `body-parser` Package in Backend
- **Classification:** `SAFE TO REMOVE`
- **File path:**
  - `server/package.json` (lines 13, 15)
  - `server/index.js` (lines 4, 13)
- **Current problem:** `server/package.json` depends on both `"mongodb": "^6.3.0"` and `"mongoose": "^8.1.1"`, even though the codebase exclusively uses `mongoose`. Additionally, `server/index.js` imports `body-parser` (`app.use(bodyparser.json())`), which has been built into Express (`express.json()`) since Express 4.16.
- **Why it should be changed:** Unnecessary dependencies increase `node_modules` size and attack surface.
- **Recommended solution:** Replace `bodyparser.json()` with `express.json()` in `server/index.js` and remove `"body-parser"` and `"mongodb"` from `server/package.json`.
- **Risk of modification:** **Low** — `express.json()` is identical to `bodyParser.json()`.

---

### REM-05: Fake Mobile App Download Banner & CSS Phone Mockup on Landing Page
- **Classification:** `SAFE TO REMOVE` (or `NEEDS IMPROVEMENT`)
- **File path:**
  - `frontend/src/app/Component/landing-page/landing-page.component.html` (lines 340–403)
- **Current problem:** Displays a large gradient banner advertising a non-existent TedBus mobile app (`"📱 Get the App"`, `"Get ₹150 OFF on your first app booking with code TEDAPP"`, `"25 Lakh+ Downloads"`, non-functional Google Play and App Store buttons, and a decorative CSS phone mockup).
- **Why it should be changed:** Classic generic marketing bloat with non-functional store buttons, an emoji badge, and a promo code (`TEDAPP`) that does not exist in the payment system.
- **Recommended solution:** Remove the fake App Download section from `landing-page.component.html`.
- **Risk of modification:** **Low** — Pure template cleanup; makes the landing page cleaner and more authentic.

---

### REM-06: Dead Footer Links (`javascript:void(0)`) & Non-Existent Services (`TedRail`, `Global Sites`)
- **Classification:** `SAFE TO REMOVE` (or `NEEDS IMPROVEMENT`)
- **File path:**
  - `frontend/src/app/Component/footer/footer.component.html` (lines 1–169)
- **Current problem:** The footer contains 8 columns with ~30 `<a href="javascript:void(0)">` links pointing nowhere, including non-existent services (`TedRail`, `Train Ticket Booking`, `PNR Status`, `Live Train Status`, `Singapore`, `Malaysia`, `Indonesia`, `Peru`, `Colombia`, `Investor Relations`), plus 4 dead social media links (`href="javascript:void(0)"`).
- **Why it should be changed:** Clicking any footer link does nothing, and advertising international operations in Peru/Colombia or train PNR status misrepresents the application.
- **Recommended solution:** Streamline the footer into a clean, functional 4-column layout with real `routerLink` navigation (`/`, `/route-planner`, `/community`, `/profile`), popular routes that actually trigger route searches, and concise company/support info.
- **Risk of modification:** **Low** — Improves usability and removes misleading links.

---

## Section 4 — NEEDS IMPROVEMENT

### IMP-01: Full-Collection Database Loads on Every Bus Search (`server/controller/route.js`)
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `server/controller/route.js` (lines 76, 164, 241)
- **Current problem:** Inside `exports.getoneroute`:
  - Line 76 runs `Route.find().lean().exec()` to load **every route** in MongoDB and filters them in JavaScript.
  - Line 164 runs `Bus.find().lean().exec()` to load **every bus** in MongoDB and filters them in JavaScript.
  - Line 241 runs `Booking.find().lean().exec()` to load **every booking across all dates and buses** into memory and filters them in a nested loop.
- **Why it should be changed:** Causes $O(N)$ memory and CPU growth on every search request as routes, buses, and bookings grow.
- **Recommended solution:** Query MongoDB using targeted filters:
  - `Route.findOne({ 'departureLocation.name': new RegExp(\`^\${departure}$\`, 'i'), 'arrivalLocation.name': new RegExp(\`^\${arrival}$\`, 'i') }).lean()`
  - `Bus.find({ routes: String(route._id) }).lean()`
  - `Booking.find({ busId: { $in: busIds }, departureDetails.date: date, status: { $ne: 'Cancelled' } }).lean()`
- **Risk of modification:** **Low** — Preserves the exact response structure while drastically reducing database load.

---

### IMP-02: Hardcoded `[3, 7, 18, 25]` Occupied Seats Fallback on Empty Buses
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `server/controller/route.js` (lines 268–270)
  - `frontend/src/app/service/bus.service.ts` (lines 215–219)
- **Current problem:** In `server/controller/route.js`, when a bus has 0 actual bookings for the requested date (`currentbusseats.length === 0`), line 270 injects `currentbusseats = [3, 7, 18, 25]`.
- **Why it should be changed:** Presents static fake seat occupancy as live database state. Even worse, because seats 3, 7, 18, and 25 are not actually in the `Bookings` collection, the backend booking controller (`POST /booking`) thinks they are free while the UI shows them as booked.
- **Recommended solution:** Return the true `currentbusseats` array (`[]` when no seats are booked) from `server/controller/route.js`.
- **Risk of modification:** **Low** — Makes seat availability 100% truthful and consistent with the `Bookings` collection.

---

### IMP-03: Misleading `reDeal applied (Flat ₹100 Off)` Badge & Static Amenities on Every Bus Card
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `frontend/src/app/Component/selectbus-page/right/bus-box/bus-box.component.html` (lines 96–120)
  - `frontend/src/app/Component/selectbus-page/right/bus-book/bottom-tab/bottom-tab.component.html` (lines 46–63)
- **Current problem:**
  1. Every bus card displays a rose badge `"reDeal applied (Flat ₹100 Off)"` (line 118), even though no ₹100 discount is applied to `seatprivce` or checkout.
  2. Every bus card displays the exact same static list of 8 amenities (`High-Speed WiFi`, `Blankets & Pillows`, `Central Climate Control`, etc.) even when the bus is a `Non A/C Seater` or `Standard Seater`.
- **Why it should be changed:** Misleads users about pricing discounts and bus amenities.
- **Recommended solution:** Remove the fake `"reDeal applied (Flat ₹100 Off)"` badge and derive displayed amenities dynamically based on `bustype` / `livetracking`.
- **Risk of modification:** **Low** — Template and component logic refinement.

---

### IMP-04: Fabricated Review Count Formula & Property Typos in `BusBoxComponent`
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `frontend/src/app/Component/selectbus-page/right/bus-box/bus-box.component.ts` (lines 21–22, 38–50)
  - `frontend/src/app/Component/selectbus-page/right/bus-box/bus-box.component.html` (lines 77, 125)
  - `frontend/src/app/Component/selectbus-page/right/bus-book/bottom-tab/bottom-tab.component.ts` (line 16)
- **Current problem:**
  1. `BusBoxComponent.calculateDetails()` fabricates `totalreview` using `count += (index + 1) * 12` (so a `rating` array of 3 numbers always claims `72 reviews`), which contradicts the actual verified review count shown inside `BottomTabComponent` (`({{ totalReviews }} verified reviews)`).
  2. Property typos: `seatprivce` in `BusBoxComponent` and `@Input() routedetials` in `BottomTabComponent`.
- **Why it should be changed:** Displays contradictory review counts on the same card and uses misspelled variable names.
- **Recommended solution:** Rename `seatprivce` to `seatprice` (keeping a getter alias if needed), fix `routedetials` -> `routedetails`, and use `this.rating.length` (or actual rating count) instead of multiplying indices by 12.
- **Risk of modification:** **Low** — Clean internal refactoring.

---

### IMP-05: Unauthenticated Fake Fallback Data on `/profile` and `/payment`
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `frontend/src/app/Component/profile-page/profile-page.component.ts` (lines 84–94)
  - `frontend/src/app/Component/payment-page/payment-page.component.ts` (lines 55–77)
- **Current problem:**
  1. Visiting `/profile` while logged out populates a fake profile (`name: 'Demo Passenger'`, `email: 'passenger@tedbus.com'`, `gender: 'Male'`, paired with an Unsplash photo of a woman `photo-1494790108377-be9c29b29330`).
  2. Visiting `/payment` directly without selecting a bus populates a hardcoded fake booking for `'Alex Johnson'` and `'Sam Johnson'` (`Delhi -> Jaipur`, `₹950`) and allows submitting it to the backend.
- **Why it should be changed:** Presents fake placeholder personas and allows creating bogus bookings when navigating directly to `/payment`.
- **Recommended solution:**
  1. On `/profile`, if no user is signed in, display a clean "Sign in to view your profile and trips" prompt (with a button that opens the Sign-In modal) instead of loading `'Demo Passenger'`.
  2. On `/payment`, if no `bookingData` or `pendingBooking` exists in `DataService`/`localStorage`, redirect the user to `/` with a clear notice instead of fabricating `'Alex Johnson'`.
- **Risk of modification:** **Low** — Prevents invalid bookings and eliminates fake profile data.

---

### IMP-06: Missing Dark Mode Styling in `MyTripComponent`, `BusBookingFormComponent`, `FormDrawerComponent`, and `ViewSeatsComponent`
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `frontend/src/app/Component/profile-page/my-trip/my-trip.component.html` (lines 8–79)
  - `frontend/src/app/Component/selectbus-page/right/bus-booking-form/bus-booking-form.component.html` (lines 1–79)
  - `frontend/src/app/Component/selectbus-page/right/form-drawer/form-drawer.component.html` (lines 7–25)
  - `frontend/src/app/Component/selectbus-page/right/view-seats/view-seats.component.css` & `.html`
- **Current problem:** While the navbar, landing page, bus cards, community page, and route planner support dark mode (`dark:bg-slate-900`, `dark:text-white`), the seat selection view, booking slide-out drawer, passenger form, and `MyTripComponent` use hardcoded light-only classes (`bg-white`, `bg-gray-50`, `text-gray-800`).
- **Why it should be changed:** Causes jarring bright white backgrounds and unreadable light-on-light text when Dark Mode is enabled.
- **Recommended solution:** Add consistent `dark:bg-slate-900`, `dark:bg-slate-800`, `dark:border-slate-700`, and `dark:text-gray-100` classes to these four components.
- **Risk of modification:** **Low** — CSS class additions only.

---

### IMP-07: Decorative Emojis, Exaggerated Marketing Claims, and Non-Collapsible FAQs on Landing Page
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `frontend/src/app/Component/landing-page/landing-page.component.ts` (lines 17–49)
  - `frontend/src/app/Component/landing-page/landing-page.component.html` (lines 152–194, 405–444)
- **Current problem:**
  1. `popularRoutes` (lines 31–38) uses emojis (`🏰`, `🏖️`, `🏯`, `🏔️`, `⛵`, `🕌`) inside route cards while the rest of the UI uses Angular Material icons (`<mat-icon>`).
  2. `stats` (lines 17–22) claims exaggerated metrics (`3,000+ Bus Operators`, `1,00,000+ Routes Covered`, `25 Lakh+ Happy Travellers`).
  3. The FAQ section (lines 413–443) renders a `fa-chevron-down` icon and `cursor-pointer` on each question header, but clicking a question does nothing — all answers are permanently visible.
- **Why it should be changed:** Emojis clash with Material icons; non-interactive accordions feel broken; exaggerated stats reduce credibility.
- **Recommended solution:**
  1. Replace route emojis with `<mat-icon>` (`directions_bus`, `location_city`, `landscape`, `beach_access`).
  2. Add an `openFaqIndex: number | null = 0` toggle in `LandingPageComponent` so FAQ items expand/collapse smoothly on click.
  3. Replace exaggerated marketing numbers with realistic platform highlights (e.g., `6+ Major Corridors`, `Instant Seat Confirmation`, `24/7 Live Tracking`, `100% Verified Reviews`).
- **Risk of modification:** **Low** — Enhances UI polish and interactivity.

---

### IMP-08: Always-On Pulsing Red Notification Dot in Navbar
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `frontend/src/app/Component/navbar/navbar.component.html` (line 101)
- **Current problem:** The notification bell link in the navbar always renders `<span class="absolute top-1.5 right-1.5 w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>` even when the user has 0 unread notifications.
- **Why it should be changed:** Creates a false sense of unread alerts on every page load.
- **Recommended solution:** Either show the badge conditionally when `unreadNotificationCount > 0` or remove the hardcoded `animate-pulse` dot.
- **Risk of modification:** **Low** — Minor template update.

---

### IMP-09: Unsubscribed RxJS Observables & Missing Lifecycle Interfaces
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `frontend/src/app/Component/selectbus-page/header/header.component.ts` (line 25)
  - `frontend/src/app/Component/payment-page/payment-page.component.ts` (line 39)
  - `frontend/src/app/Component/selectbus-page/right/bus-booking-form/bus-booking-form.component.ts` (line 37)
- **Current problem:**
  - `HeaderComponent` subscribes to `this.route.queryParams` without unsubscribing on destroy.
  - `PaymentPageComponent` subscribes to `this.dataService.currentData` without unsubscribing on destroy.
  - `BusBookingFormComponent` defines `ngOnChanges()` without importing/implementing `OnChanges`.
- **Why it should be changed:** Can cause memory leaks and duplicate callbacks during SPA navigation.
- **Recommended solution:** Implement `OnDestroy` with a `Subscription` container in `HeaderComponent` and `PaymentPageComponent`, and add `OnChanges` to `BusBookingFormComponent`.
- **Risk of modification:** **Low** — Standard Angular lifecycle hygiene.

---

### IMP-10: Fragile `app._router.stack` Inspection in `server/index.js`
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `server/index.js` (lines 87–107)
  - `server/routes/bus.js` (lines 1–28)
- **Current problem:** Instead of mounting `server/routes/bus.js`, `server/index.js` inspects Express's private `app._router.stack` array to check if `/buses` is registered and defines an inline route handler.Meanwhile, `server/routes/bus.js` exists in the repo but is never imported!
- **Why it should be changed:** Relying on undocumented internal `app._router.stack` properties is brittle and leaves `server/routes/bus.js` as an orphaned file.
- **Recommended solution:** Import and mount `const busRoutes = require('./routes/bus'); app.use(busRoutes);` cleanly in `server/index.js` (ensuring `server/routes/bus.js` includes the JSON fallback logic).
- **Risk of modification:** **Low** — Consolidates duplicate `/buses` endpoint logic into `server/routes/bus.js`.

---

### IMP-11: Missing Input Validation on Payment Submission (`PaymentPageComponent`)
- **Classification:** `NEEDS IMPROVEMENT`
- **File path:**
  - `frontend/src/app/Component/payment-page/payment-page.component.ts` (lines 136–215, `processPayment()`)
- **Current problem:** Clicking `"Pay Now"` submits the booking immediately without checking if the user entered a valid Card Number/Expiry/CVV (when `selectedMethod === 'card'`) or a valid UPI ID (when `selectedMethod === 'upi'`).
- **Why it should be changed:** Allows submitting completely blank payment forms.
- **Recommended solution:** Add basic client-side validation in `processPayment()` based on `selectedMethod` (e.g., non-empty card details or UPI ID containing `@`) with clear user feedback before calling `POST /booking`.
- **Risk of modification:** **Low** — Client-side validation only.

---

## Section 5 — MUST KEEP

### KEEP-01: Local JSON Fallback Datasets (`frontend/routedata.json` & `frontend/busdata.json`)
- **Classification:** `MUST KEEP`
- **File path:**
  - `frontend/routedata.json`
  - `frontend/busdata.json`
  - `server/controller/route.js` (lines 11–26)
- **Why it must be kept:** These JSON datasets provide the canonical seed routes (Delhi–Jaipur, Mumbai–Goa, Bangalore–Mysore, Kolkata–Darjeeling, Chennai–Pondicherry) and 40-seat bus definitions when MongoDB is empty or running in offline fallback mode. They are also directly tested by `server/test-verification.js`.

---

### KEEP-02: Atomic Booking Creation, Seat Conflict Prevention & 2-Hour Cancellation Cutoff
- **Classification:** `MUST KEEP`
- **File path:**
  - `server/controller/booking.js`
  - `server/models/booking.js`
- **Why it must be kept:** Implements genuine seat-level conflict detection (`409 Conflict` on double-booking), automatic post-booking notification dispatch, and the 2-hour pre-departure cancellation lock.

---

### KEEP-03: Verified Journey Review System & 24-Hour Edit Window
- **Classification:** `MUST KEEP`
- **File path:**
  - `server/controller/review.js`
  - `server/models/review.js`
  - `frontend/src/app/Component/selectbus-page/right/bus-book/bottom-tab/bottom-tab.component.ts`
- **Why it must be kept:** Enforces that only passengers with a real booking can review a bus, enforces a 20-character minimum, provides a 24-hour edit lock (`editLocksAt`), and awards the `Trusted Reviewer` badge at 3+ helpful votes.

---

### KEEP-04: Community Hub, Commenting, Reporting & Moderation Workflow
- **Classification:** `MUST KEEP`
- **File path:**
  - `server/controller/community.js`
  - `server/models/community.js`
  - `frontend/src/app/Component/community/community.component.ts` & `.html`
- **Why it must be kept:** Provides a complete, database-backed traveler community forum with category filtering, tag filtering, author-attributed comments, duplicate-report prevention, and auto-flagging at 3 reports.

---

### KEEP-05: Bilingual Internationalization (`en`/`hi`) & Theme Persistence (`light`/`dark`/`system`)
- **Classification:** `MUST KEEP`
- **File path:**
  - `frontend/src/app/service/translation.service.ts`
  - `frontend/src/app/service/theme.service.ts`
  - `frontend/src/app/pipes/translate.pipe.ts`
  - `frontend/src/app/i18n/en.ts` & `hi.ts`
- **Why it must be kept:** Cleanly architected reactive `BehaviorSubject` services that sync user preferences with both `localStorage` and MongoDB (`PUT /customer/:id/preferences`) without requiring a page reload.

---

### KEEP-06: End-to-End Backend Verification Suite (`server/test-verification.js`)
- **Classification:** `MUST KEEP`
- **File path:**
  - `server/test-verification.js`
- **Why it must be kept:** Automated 24-test verification suite that validates all REST API endpoints (Preferences, Routes, Bookings, Seat Conflicts, Cancellations, Notifications, Reviews, Community Hub, and Saved Routes) against a live Express server and MongoDB instance.

---

## Section 6 — Project Verification Summary

| Verification Check | Status | Details |
| :--- | :---: | :--- |
| **Angular Production Build** (`npm --prefix frontend run build`) | **PASS** | Compiles cleanly with zero TypeScript or template errors (`exit code 0`, output in `frontend/dist/frontend`). |
| **Backend Server Startup** (`server/index.js`) | **PASS** | Starts cleanly on port `5000` (or `PORT` env var) and connects to MongoDB with graceful fallback. |
| **Automated API Verification Suite** (`node server/test-verification.js`) | **PASS (24/24)** | All 24 end-to-end integration checks pass with `0` failures. |
| **Responsive Layout & Dark Mode** | **PARTIAL** | Main pages (`navbar`, `landing-page`, `selectbus-page`, `community`, `route-planner`) are responsive and dark-mode ready; `my-trip`, `view-seats`, `form-drawer`, and `bus-booking-form` need dark-mode class coverage (`IMP-06`). |

---

*End of Phase 1 & Phase 2 Audit Report. No project source files were modified during this phase. Awaiting your approval before making any changes.*

