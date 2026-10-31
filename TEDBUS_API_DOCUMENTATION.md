# 📘 TedBus — Complete REST API & System Documentation

**Version:** 2.0 (Production Release)  
**Stack:** Angular 17 + Node.js / Express + MongoDB (Mongoose ODM)

---

## 1. Base Configuration & Headers

| Environment | Frontend Origin | Backend Base URL |
| :--- | :--- | :--- |
| **Development** | `http://localhost:4200` | `http://localhost:5000/` |
| **Verification Suite** | `http://localhost:4200` | `http://127.0.0.1:5055/` |
| **Production** | Configured via `CORS_ORIGINS` | Configured via `environment.prod.ts` |

### Standard Response Headers
- `X-Data-Source`: Indicates whether data was served from `mongodb` (live database) or `fallback` (graceful read-only seed dataset). Note: **All write operations (`POST`, `PUT`, `DELETE` for bookings, reviews, community posts, and saved routes) strictly require an active MongoDB connection and return `HTTP 503 DatabaseUnavailable` when offline.**
- `X-Total-Count` & `X-Has-More`: Returned on paginated endpoints such as `GET /community/posts`.

---

## 2. Health & Core Booking Engine

### `GET /health`
Returns server uptime and MongoDB connection state.
- **Response `200 OK`:**
  ```json
  {
    "status": "ok",
    "database": "connected",
    "readyState": 1
  }
  ```

### `GET /routes/:departure/:arrival/:date`
Searches routes, matched buses, and booked seat arrays for a given origin, destination, and travel date (`YYYY-MM-DD`).
- **Response `200 OK`:**
  ```json
  {
    "route": { "departureLocation": { "name": "Delhi" }, "arrivalLocation": { "name": "Jaipur" }, "duration": 5 },
    "matchedBuses": [ ... ],
    "busidwithseatobj": { "<busId>": [5, 6] }
  }
  ```

### `POST /booking`
Creates an atomic, persistent bus ticket booking in MongoDB, prevents duplicate seat reservation conflicts, and automatically triggers a localized `booking_confirmed` multi-channel notification.
- **Request Body:**
  ```json
  {
    "customerId": "6721...",
    "busId": "6720...",
    "seats": [12, 14],
    "fare": 1200,
    "operatorName": "TedBus Gold Express",
    "date": "2026-11-25",
    "email": "passenger@tedbus.com",
    "phoneNumber": "9876543210",
    "departureCity": "Delhi",
    "arrivalCity": "Jaipur"
  }
  ```
- **Responses:**
  - `201 Created`: Persistent MongoDB booking document (`X-Data-Source: mongodb`).
  - `409 Conflict` (`SeatConflict`): One or more requested seats are already booked for that bus and date.
  - `503 Service Unavailable` (`DatabaseUnavailable`): Database is offline; fake in-memory bookings are strictly prohibited.

### `POST /booking/:id/cancel`
Cancels an existing booking, releases reserved seats, and dispatches a `booking_cancelled` notification.

---

## 3. Customer Profile, Dark Mode & Internationalization (i18n)

### `POST /customer`
Registers or retrieves an authenticated customer profile.

### `GET /customer/:id`
Fetches customer profile by MongoDB `_id`, `email`, or `googleId`, including `themePreference` (`light` | `dark` | `system`), `languagePreference` (`en` | `hi`), and `notificationPreferences`.

### `PUT /customer/:id/preferences`
Persists user UI preferences (`themePreference` and/or `languagePreference`) to MongoDB.
- **Request Body:**
  ```json
  {
    "themePreference": "dark",
    "languagePreference": "hi"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "themePreference": "dark",
    "languagePreference": "hi"
  }
  ```

---

## 4. Advanced Multi-Channel Notification System

### `GET /notifications?customerId=:customerId`
Returns notifications ordered by unread status and creation timestamp.

### `PUT /notifications/:id/read`
Marks a single notification as read.

### `POST /notifications/mark-all-read`
Marks all notifications as read for `{ customerId }`.

### `GET /notifications/preferences/:customerId` & `PUT /notifications/preferences/:customerId`
Gets or updates channel delivery toggles (`inApp`, `email`, `push`, `promotional`).

### `POST /notifications/trigger`
Triggers a multi-channel notification with `idempotencyKey` deduplication and localized templates (`en` / `hi`).

### `POST /notifications/retry-failed`
Retries failed `NotificationDeliveryAttempt` records with exponential backoff (up to 3 attempts) and transitions succeeded attempts to `delivered`.

### `GET /notifications/delivery-history/:customerId`
Returns channel delivery attempt audit logs (`in_app`, `email`, `push`).

---

## 5. Verified Journey Reviews

### `GET /reviews?routeId=:routeId&busId=:busId`
Returns visible verified reviews annotated with `canEdit` (24-hour window), `editLocksAt`, `isTrustedReviewer` (`>= 3` helpful votes), `totalReviews`, and `averageRating`.

### `GET /reviews/eligibility?customerId=:customerId&bookingId=:bookingId`
Verifies whether a customer has an unreviewed `confirmed` or `completed` booking in MongoDB.

### `POST /reviews`
Submits a verified journey review. Enforces:
1. Rating between `1` and `5`.
2. Review text minimum length of `20` characters.
3. Strict server-side verification that `bookingId` exists in `Bookings` with status `confirmed` or `completed`.
4. One review per booking uniqueness constraint.
- **Responses:** `201 Created`, `400 Bad Request`, `403 Forbidden` (`BookingNotFound` / `IneligibleBooking`).

### `PUT /reviews/:id`
Updates `rating` and `reviewText` if and only if the review is within **24 hours** of creation. Returns `403 EditWindowExpired` after 24 hours.

### `POST /reviews/:id/helpful`
Toggles/adds a helpful upvote from `{ userId }`.

### `POST /reviews/:id/report` & `POST /reviews/:id/moderate`
Flags a review (`spam`, `offensive`, `fake`, `irrelevant`, `other`) or executes a moderator action (`hide`, `restore`, `delete`).

---

## 6. Travel Community

### `GET /community/posts?category=:cat&sort=:sort&page=:page&limit=:limit`
Fetches community stories with live `commentsCount`, category filtering (`tips`, `experiences`, `safety`, `routes`, `general`), sorting (`recent`, `popular`), and pagination headers (`X-Total-Count`, `X-Has-More`).

### `POST /community/posts`
Publishes a new travel story. Enforces **strict server-side author verification** (`verifyAuthorIdentity`): `authorId` must reference a registered `Customer` in MongoDB with `isVerified: true`. Returns `403 Forbidden` (`UnverifiedAuthor` / `AuthorNotFound`) otherwise.

### `GET /community/posts/:id/comments` & `POST /community/posts/:id/comments`
Fetches or posts top-level comments and nested replies (`parentCommentId`). Automatically increments `commentsCount` on the post and dispatches a `community_activity` notification to the post author.

### `POST /community/posts/:id/like`
Toggles a like on a community post for `{ userId }`.

### `POST /community/posts/:id/report` & `POST /community/comments/:id/report`
Submits a `ContentReport` to the moderation queue and increments `reportsCount`.

### `GET /community/reports`
Moderator endpoint returning pending/reviewed `ContentReport` items enriched with `targetSummary` and the recent `ModerationAction` audit log.

### `POST /community/posts/:id/moderate` & `POST /community/comments/:id/moderate`
Executes `hide`, `restore`, or `delete` on a post or comment, resolves pending reports, and records an entry in `ModerationActions`.

### `GET /community/user/:customerId`
Returns `{ authoredPosts, likedPosts, comments, stats }` for the User Profile "My Community" dashboard tab.

---

## 7. Interactive Route Planner

### `POST /saved-routes/calculate`
Calculates multi-stop route geometry for `{ origin, destination, waypoints }`, returning resolved `lat`/`lng` coordinates, cumulative `polyline` stops, highway corridor alternatives, and `refreshedAt` telemetry timestamp.

### `GET /saved-routes?customerId=:customerId`
Retrieves saved routes for a user.

### `POST /saved-routes`
Persists a favorite route to MongoDB with automatic `lat`/`lng` coordinate enrichment for origin, waypoints, and destination.

### `DELETE /saved-routes/:id`
Deletes a saved route by ID.

