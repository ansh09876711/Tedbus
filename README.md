# 🚌 TedBus — MEAN Stack Online Bus Booking Platform
> Fully cloned and customized from [BitHeadmr/REDBUS-CLONE-MEAN](https://github.com/BitHeadmr/REDBUS-CLONE-MEAN.git).

---

## 🌟 Architecture Overview

- **Frontend**: Angular 17+ with Angular Material, Tailwind CSS, FontAwesome, and Google Sign-In support.
- **Backend**: Node.js & Express REST API with Mongoose ORM.
- **Database**: MongoDB with integrated fallback datasets (`routedata.json`, `busdata.json`).
- **Features**:
  - Interactive Search for buses with dynamic date picker and route autocomplete.
  - Route validation dialog for routes currently active.
  - Bus selection results with departure, duration, arrival, ratings, and price calculation.
  - Advanced left sidebar filters: Live Tracking, Reschedulable, Departure time slots, Bus types (Seater, Sleeper, AC, Non-AC), Arrival time slots, and Amenities.
  - Interactive seat layout matrix with 40-seat deck, aisle divider, driver cabin, and real-time seat availability status.
  - Slide-out Passenger Details Drawer (`app-form-drawer`) with multi-passenger input validation.
  - Comprehensive Payment Gateway supporting Credit/Debit cards, UPI / QR Code scan, and Net Banking.
  - User Profile & "My Trips" dashboard with booking history, ticket summary, cancel booking, and print e-ticket capabilities.
  - Google Authentication & Demo One-Click Sign In for instant testing.

---

## 🚀 How to Run Locally

### 1. Backend Server

```bash
cd server
npm install
npm start
```
*The server will start on `http://localhost:5000/`. If MongoDB is not running locally, it gracefully utilizes built-in seed datasets for all routes and buses.*

### 2. Angular Frontend

```bash
cd frontend
npm install
npm start
```
*The Angular development server will launch at `http://localhost:4200/`.*

---

## 🗺️ Supported Sample Routes

- **Delhi** &rarr; **Jaipur** (5 hrs, MetroBus, TravelXpress)
- **Mumbai** &rarr; **Goa** (10 hrs, FastTransit, CityLink)
- **Bangalore** &rarr; **Mysore** (3 hrs, TransitHub, EliteTravels)
- **Kolkata** &rarr; **Darjeeling** (8 hrs, SwiftTrans, ExpressLine)
- **Chennai** &rarr; **Pondicherry** (6 hrs, TravelMax, SunriseTransit, RapidTransport)

---

## 📁 Repository Structure

```
TedBus/
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── Component/
│   │   │   │   ├── navbar/               # Global navigation & authentication
│   │   │   │   ├── footer/               # Footer links, social, and app store badges
│   │   │   │   ├── landing-page/         # Hero banner, search bar & offers
│   │   │   │   │   └── dialog/           # Available routes pop-up dialog
│   │   │   │   ├── selectbus-page/       # Main bus selection container
│   │   │   │   │   ├── header/           # Route & query summary header
│   │   │   │   │   ├── left/             # Multi-faceted search filters
│   │   │   │   │   └── right/            # Bus listings & sorting bar
│   │   │   │   │       ├── sorting-bar/  # Sort by departure, fare, rating
│   │   │   │   │       ├── bus-box/      # Individual bus cards & pricing
│   │   │   │   │       ├── bus-book/     # Bottom tabs (Amenities, Policies, View Seats)
│   │   │   │   │       ├── view-seats/   # 40-seat deck layout & legend
│   │   │   │   │       ├── small-seats/  # Individual interactive seat toggle
│   │   │   │   │       ├── form-drawer/  # Slide-out booking panel
│   │   │   │   │       └── bus-booking-form/ # Passenger details & checkout
│   │   │   │   ├── payment-page/         # Card, UPI, and Netbanking portal
│   │   │   │   └── profile-page/         # Profile info & wallet
│   │   │   │       └── my-trip/          # E-Ticket display & cancellation
│   │   │   ├── model/                    # TypeScript interfaces
│   │   │   ├── service/                  # HTTP & state management services
│   │   │   ├── app-routing.module.ts
│   │   │   └── app.module.ts
│   │   ├── assets/
│   │   ├── index.html
│   │   ├── styles.css
│   │   └── custom-theme.scss
│   ├── angular.json
│   ├── package.json
│   ├── tailwind.config.js
│   ├── busdata.json
│   └── routedata.json
├── server/
│   ├── controller/
│   │   ├── booking.js
│   │   ├── customer.js
│   │   └── route.js
│   ├── models/
│   │   ├── booking.js
│   │   ├── bus.js
│   │   ├── customer.js
│   │   └── route.js
│   ├── routes/
│   │   ├── booking.js
│   │   ├── bus.js
│   │   ├── customer.js
│   │   └── route.js
│   ├── index.js
│   └── package.json
└── README.md
```
