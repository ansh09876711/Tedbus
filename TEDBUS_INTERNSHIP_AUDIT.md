# TedBus — Comprehensive Internship Project Audit Report

**Date of Audit:** October 30, 2026  
**Auditor:** Senior Full-Stack Engineering Agent  
**Repository:** TedBus (Angular 17 + Node.js/Express + MongoDB)  
**Status:** Phase 1 Complete (Read-Only Codebase Audit)

---

## 1. Executive Summary

A comprehensive architectural and code-level audit was conducted across the entire TedBus repository:
- **Frontend:** Angular 17 SPA (`frontend/src/app`) with Angular Material, Tailwind CSS 3.4, and RxJS.
- **Backend:** Node.js Express API (`server/`) with Mongoose ODM and SRV-compatible DNS configuration.
- **Database:** MongoDB Atlas / Local MongoDB fallback with compound indexes, seat conflict resolution, and persistent transaction support.

### Overall Feature Implementation Matrix

| Feature | Audit Status | Current Coverage | Key Missing Elements |
| :--- | :--- | :---: | :--- |
| **Core Architecture & Booking Engine** | **COMPLETE** | 100% | Verified atomic booking persistence, duplicate seat conflict prevention (HTTP 409), build verification. |
| **Feature 1: Travel Community** | **PARTIALLY IMPLEMENTED** | 60% | Missing comment/reply endpoints & UI, author identity authorization middleware, moderator report dashboard. |
| **Feature 2: Advanced Notification System** | **PARTIALLY IMPLEMENTED** | 55% | Missing automatic booking event triggers, delivery dispatcher (email/push), retry engine with backoff. |
| **Feature 3: Interactive Route Planner** | **PARTIALLY IMPLEMENTED** | 65% | Missing interactive map canvas (Leaflet/Mapbox/Google Maps), live waypoint routing polyline, refresh trigger. |
| **Feature 4: Internationalization (i18n)** | **PARTIALLY IMPLEMENTED** | 75% | Missing backend user profile preference synchronization, missing translation coverage in sub-drawers. |
| **Feature 5: Dark Mode** | **PARTIALLY IMPLEMENTED** | 85% | Working system/light/dark switcher, missing DB profile sync for authenticated users, minor calendar contrast checks. |
| **Feature 6: Verified Journey Reviews** | **PARTIALLY IMPLEMENTED** | 60% | Missing server-side completed trip verification, 24-hr edit lock endpoint, review reporting & moderation routes. |

---

## 2. Detailed Audit by Requirement

---

### Feature 1 — Travel Community
**Status:** `PARTIALLY IMPLEMENTED`

#### What Is Already Implemented:
1. **Database Models (`server/models/community.js`):**
   - `CommunityPost` schema with `author`, `authorName`, `authorPicture`, `isAuthorVerified`, `title`, `content`, `category`, `imageUrl`, `likes`, `reportsCount`, `isHidden`.
   - `CommunityComment` schema (`postId`, `author`, `authorName`, `text`, `isHidden`).
   - `ContentReport` schema (`targetType`, `targetId`, `reportedBy`, `reason`, `description`, `status`).
   - `ModerationAction` schema (`actionType`, `targetType`, `targetId`, `moderator`, `reason`).
2. **Backend Controller & Routes (`server/controller/community.js`, `server/routes/community.js`):**
   - `GET /community/posts`: Category filtering, sort by recent or popular (`likes.length`), offline fallback support.
   - `POST /community/posts`: Post creation with title, content, image URL, category validation.
   - `POST /community/posts/:id/like`: Atomic like/unlike toggle.
   - `POST /community/posts/:id/report`: Reports inappropriate posts and increments `reportsCount`.
   - `POST /community/posts/:id/moderate`: Allows hiding/restoring/deleting posts.
3. **Frontend UI (`frontend/src/app/Component/community/`):**
   - Category filtering bar (Tips, Experiences, Safety, Routes, General).
   - Post list with verification badge, category tag, shareable link copy (`copyShareLink`), report modal (`reportPost`), like counter.
   - "Share Your Story" modal for creating new community posts.

#### What Is Missing / Required Improvements:
- **Comments & Replies API:** No routes exist for `GET /community/posts/:id/comments` or `POST /community/posts/:id/comments`. Frontend has a comment button but no comment listing or input form.
- **Strict Server-Side Identity Verification:** In `createPost`, unauthenticated clients can send arbitrary `authorId` or fall back to an unverified ObjectId. Server-side token/session validation is needed to enforce that only verified accounts can post.
- **User Profile Integration:** The user dashboard (`profile-page.component.html`) does not display the user's authored posts or interactions.
- **Moderator Dashboard:** No UI or API endpoint (`GET /community/reports`) allows admins/moderators to view pending reports and execute moderation actions.
- **Pagination / Infinite Scroll:** Posts currently load as a static list without page/cursor pagination.

---

### Feature 2 — Advanced Notification System
**Status:** `PARTIALLY IMPLEMENTED`

#### What Is Already Implemented:
1. **Database Models (`server/models/notification.js`):**
   - `Notification` schema with `customerId`, `type` (`booking_confirmed`, `booking_cancelled`, `departure_reminder`, `community_activity`, `promotional`, `system`), `title`, `message`, `link`, `read`, `idempotencyKey`.
   - `NotificationDeliveryAttempt` schema with `channel` (`in_app`, `email`, `push`), `status` (`pending`, `delivered`, `failed`), `attemptCount`, `errorMessage`.
2. **Backend Controller & Routes (`server/controller/notification.js`, `server/routes/notification.js`):**
   - `GET /notifications`: Retrieve notifications by `customerId` with unread ordering.
   - `PUT /notifications/:id/read`: Mark single notification as read.
   - `POST /notifications/mark-all-read`: Mark all notifications as read for a customer.
   - `GET /notifications/preferences/:customerId`: Retrieve notification channel settings.
   - `PUT /notifications/preferences/:customerId`: Update notification channel settings.
3. **Frontend UI (`frontend/src/app/Component/profile-page/`):**
   - Notifications tab with unread count badge on the tab header.
   - Toggle switches for In-App, Email, Push, and Promotional notifications.
   - List of recent alerts with icon categorization, relative timestamps, and "Mark All Read".

#### What Is Missing / Required Improvements:
- **Automatic Event Hooks:** `POST /booking` (booking confirmation) and `POST /booking/:id/cancel` do not automatically insert a `Notification` document into MongoDB.
- **Delivery Dispatcher & Retry Worker:** While the `NotificationDeliveryAttempt` model exists, there is no service to dispatch emails (Nodemailer), browser push (Web Push API), track status changes (`pending` -> `delivered`/`failed`), or retry failed attempts with exponential backoff and max retry limits.
- **Browser Push Notification Integration:** No Service Worker (`sw.js`) or PushManager subscription handler is wired in the frontend.
- **Departure Reminders & Schedule Change Triggers:** Background cron or event scheduler to notify users 2 hours prior to scheduled departure.
- **Message Localization:** Notifications currently store static English text; need bilingual English/Hindi notification templates.

---

### Feature 3 — Interactive Route Planner
**Status:** `PARTIALLY IMPLEMENTED`

#### What Is Already Implemented:
1. **Database Model (`server/models/savedRoute.js`):**
   - `SavedRoute` schema with `customerId`, `routeName`, `origin` (`name`, `lat`, `lng`), `destination` (`name`, `lat`, `lng`), `waypoints` array, `totalDistanceKm`, `estimatedDurationMin`, `notes`.
2. **Backend Controller & Routes (`server/controller/savedRoute.js`, `server/routes/savedRoute.js`):**
   - `GET /saved-routes`: Retrieve saved routes for a user.
   - `POST /saved-routes`: Persist new route with waypoints and estimated metrics.
   - `DELETE /saved-routes/:id`: Delete a saved route.
3. **Frontend UI (`frontend/src/app/Component/route-planner/`):**
   - Origin and Destination inputs with quick city selection chips.
   - Add/remove up to 4 intermediate stops (waypoints).
   - Route alternatives comparison cards (Expressway vs NH Direct vs Highway Scenic) displaying travel time, distance, toll plaza counts, road types, and traffic conditions.
   - Saved routes list with "Load into Planner" and "Delete" actions.
   - Direct CTA button: "Book Buses for this Route" navigating to bus search.

#### What Is Missing / Required Improvements:
- **Interactive Visual Map:** The component renders HTML cards and stop chips, but lacks an interactive map canvas (Leaflet/OpenStreetMap or Google Maps Platform) displaying the polyline highway corridor, animated waypoints, and markers.
- **Map Provider Configuration:** API key configuration and dynamic polyline coordinate rendering for actual road geometry.
- **Manual Route Refresh:** An explicit "Refresh Route & Traffic Info" button that triggers a re-calculation.

---

### Feature 4 — Internationalization (i18n)
**Status:** `PARTIALLY IMPLEMENTED`

#### What Is Already Implemented:
1. **Frontend Infrastructure:**
   - `TranslationService` (`frontend/src/app/service/translation.service.ts`) with reactive `currentLang$` observable.
   - `TranslatePipe` (`frontend/src/app/pipes/translate.pipe.ts`) supporting dynamic key translation and parameter interpolation (`{{param}}`).
   - Comprehensive translation dictionaries: `en.ts` (11.2 KB) and `hi.ts` (18.8 KB) covering navigation, search, booking, filters, route planner, reviews, and community.
   - Navbar language toggle (`🌐 English / हिन्दी`) with immediate, reload-free language switching.
   - LocalStorage persistence (`tedbus_lang`) and `document.documentElement.lang` attribute binding.
   - Profile preferences page language selector.

#### What Is Missing / Required Improvements:
- **Database User Profile Synchronization:** When an authenticated user selects a language, it is only stored in `localStorage`; it must also sync to `Customer.languagePreference` in MongoDB.
- **Translation Coverage in Child Components:** Small dialogs, datepicker tooltips, cancellation policy modals, and seat legend labels in `bus-box` and `view-seats` contain occasional hardcoded English strings.
- **Dynamic Notification Localization:** Backend notification event generator must create localized messages based on the customer's stored language preference.

---

### Feature 5 — Dark Mode
**Status:** `PARTIALLY IMPLEMENTED` (High Completion)

#### What Is Already Implemented:
1. **Frontend Infrastructure:**
   - `ThemeService` (`frontend/src/app/service/theme.service.ts`) supporting `light`, `dark`, and `system` modes with `matchMedia('(prefers-color-scheme: dark)')` listener.
   - Instant toggle without reload; applies/removes `.dark` class on `document.documentElement` and `document.body`.
   - Navbar theme toggle button with animated sun/moon icon.
   - Profile page theme selection grid (Light / Dark / System Default).
   - Tailwind CSS `dark:` variant extensively integrated across Navbar, Landing Page, Bus Cards, Bottom Tabs, Route Planner, Community, and Profile.

#### What Is Missing / Required Improvements:
- **Database User Profile Synchronization:** Theme preference is only stored in `localStorage` (`tedbus_theme`). For authenticated users, it must be persisted to `Customer.themePreference` in MongoDB.
- **Material Form & Overlay Theming:** Ensure Angular Material overlay panels (datepicker calendar, select dropdowns, menus) have explicit dark background styles so they do not render white popups in dark mode.

---

### Feature 6 — Verified Journey Reviews
**Status:** `PARTIALLY IMPLEMENTED`

#### What Is Already Implemented:
1. **Database Models (`server/models/review.js`):**
   - `JourneyReview` schema with `routeId`, `busId`, `bookingId` (strictly unique), `customerId`, `authorName`, `rating` (1-5), `reviewText` (min 20 chars), `helpfulVotes`, `isVerifiedJourney`, `isHidden`.
   - `ReviewReport` schema (`reviewId`, `reportedBy`, `reason`, `description`, `status`).
2. **Backend Controller & Routes (`server/controller/review.js`, `server/routes/review.js`):**
   - `GET /reviews`: Filter by `routeId` or `busId`, calculates `averageRating` and `totalReviews`, excludes hidden reviews.
   - `POST /reviews`: Validates 1-5 rating, enforces 20-character minimum, rejects duplicate booking reviews.
   - `POST /reviews/:id/helpful`: Increments helpful upvotes.
3. **Frontend UI (`frontend/src/app/Component/selectbus-page/right/bus-book/bottom-tab/`):**
   - Reviews tab inside expandable bus card displaying average rating badge and review list.
   - Star rating picker (1 to 5 stars) and character counter.
   - "Helpful" upvoting button with dynamic count update.

#### What Is Missing / Required Improvements:
- **Strict Server-Side Journey Verification:** In `createReview`, the backend checks for duplicate review on `bookingId`, but does NOT verify that the `bookingId` exists in `Bookings` with `status === 'completed'` (or travel date in the past). A user could pass an arbitrary ID.
- **24-Hour Edit Window & Lock:** The requirement specifies: "Allow editing within 24 hours of submission. Lock edits after 24 hours." Currently, no `PUT /reviews/:id` endpoint exists, and no edit UI is present.
- **Review Reporting & Moderation API:** While `ReviewReport` model exists, there are no endpoints (`POST /reviews/:id/report`, `POST /reviews/:id/moderate`) to report inappropriate reviews or allow moderators to hide them.
- **Trusted Reviewer Highlighting:** Need UI badges (e.g. "Trusted Reviewer") for users with >= 3 helpful votes.

---

### Existing Core TedBus Infrastructure Audit

| Component | Status | Notes |
| :--- | :---: | :--- |
| **Express Backend (`server/index.js`)** | **COMPLETE** | Starts cleanly on port 5000/5055, SRV DNS resolution configured, health endpoint active. |
| **MongoDB Connection Strategy** | **COMPLETE** | Atlas primary connection with automatic local MongoDB fallback (`mongodb://127.0.0.1:27017/tedbus`). |
| **Booking Persistence Engine** | **COMPLETE** | Enforces persistent database writes. Zero fake in-memory confirmed bookings. Standalone & replica set transaction support. |
| **Duplicate Seat Conflict Prevention** | **COMPLETE** | Atomic conflict check + partial unique index `{ busId: 1, departureDate: 1, seats: 1 }` returns HTTP 409. |
| **Angular Production Build** | **COMPLETE** | `ng build` produces valid production artifacts in `dist/frontend`. |
| **Regression Test Suite (`test-verification.js`)** | **COMPLETE** | 10/10 automated tests passing (Backend Startup, MongoDB ping, Read/Write, Booking Persistence, Conflict 409, 503 rejection, API config, CORS, Bus Search, Build). |

---

## 3. Recommended Implementation Roadmap (Phases 2 – 9)

```
Phase 1: Complete Project Audit (Current Phase - Completed)
    │
    ▼
Phase 2: Dark Mode
    ├── Add Customer.themePreference MongoDB update API
    ├── Sync frontend ThemeService with customer profile on login
    └── Verify contrast across modals, datepickers, and tables
    │
    ▼
Phase 3: Internationalization (i18n)
    ├── Add Customer.languagePreference MongoDB update API
    ├── Sync frontend TranslationService with customer profile on login
    └── Audit and replace remaining hardcoded strings in child drawers
    │
    ▼
Phase 4: Advanced Notification System
    ├── Hook booking creation & cancellation to auto-generate Notification records
    ├── Implement multi-channel delivery worker (In-App, Email, Push) with retry limits
    ├── Add localized notification templates (English & Hindi)
    └── Connect Web Push / Service Worker registration
    │
    ▼
Phase 5: Verified Journey Reviews
    ├── Enforce strict server-side completed booking verification
    ├── Implement 24-hour review editing endpoint and lock rule
    ├── Add review reporting and moderation endpoints
    └── Highlight "Trusted Reviewer" badges based on helpful vote threshold
    │
    ▼
Phase 6: Travel Community
    ├── Implement comment & reply endpoints and UI
    ├── Enforce verified-author server-side authorization middleware
    ├── Add user profile community tab (posts & interactions)
    └── Add moderation dashboard for reviewing flagged content
    │
    ▼
Phase 7: Interactive Route Planner
    ├── Integrate interactive map visualizer (Leaflet / OpenStreetMap or Google Maps)
    ├── Render dynamic route polyline, waypoints, and markers
    └── Add manual refresh and clear feedback on highway traffic
    │
    ▼
Phase 8: End-to-End Integration, Regression & Responsive Testing
    ├── Execute full verification suite across all 6 features
    ├── Validate mobile, tablet, and desktop responsive layouts
    └── Run Angular production build and regression tests
    │
    ▼
Phase 9: Production Deployment Preparation & Final Deliverables
    ├── Produce TEDBUS_API_DOCUMENTATION.md
    ├── Update README.md with setup, env vars, and deployment instructions
    └── Prepare feature demonstration walkthrough script
```

---

## 4. Next Steps & Approval Request

Phase 1 (Read-Only Codebase Audit) is complete with zero modifications to existing production code.  
Awaiting user approval before proceeding to **Phase 2: Dark Mode**.
