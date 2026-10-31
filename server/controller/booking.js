const Booking = require("../models/booking");
const mongoose = require("mongoose");
const { createAndDispatchNotification } = require("./notification");
const { verifyCustomerAuth } = require("../middleware/auth");

/**
 * Helper to compute scheduled departure timestamp in milliseconds from booking.departureDetails.
 */
function parseDepartureTimeMs(booking) {
  const depDateStr = booking?.departureDetails?.date || booking?.bookingDate;
  if (!depDateStr || typeof depDateStr !== "string") return null;

  const rawTime = booking?.departureDetails?.time;
  let hours = 0;
  let minutes = 0;

  if (typeof rawTime === "string" && rawTime.includes(":")) {
    const parts = rawTime.trim().split(":");
    hours = Number(parts[0]);
    minutes = Number(parts[1] || 0);
  } else if (rawTime !== undefined && rawTime !== null && !isNaN(Number(rawTime))) {
    const num = Number(rawTime);
    hours = Math.floor(num);
    minutes = Math.round((num - hours) * 60);
  } else {
    return null;
  }

  if (isNaN(hours) || hours < 0 || hours > 23 || isNaN(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const depIso = `${depDateStr.trim()}T${hh}:${mm}:00`;
  const ms = new Date(depIso).getTime();
  return isNaN(ms) ? null : ms;
}

/**
 * Creates a new bus reservation with strict atomic integrity.
 * - Prevents duplicate seat bookings for the same bus on the same date.
 * - Enforces database persistence; never returns fake in-memory "confirmed" bookings.
 * - Uses session transactions where supported by the replica set.
 */
exports.addbooking = async (req, res) => {
  try {
    const raw = req.body;

    // 1. Validate required fields
    if (!raw.busId || !raw.seats || !Array.isArray(raw.seats) || raw.seats.length === 0) {
      return res.status(400).json({
        error: "InvalidBookingData",
        message: "busId and a non-empty array of seats are required."
      });
    }

    // 2. Verify database connectivity
    if (mongoose.connection.readyState !== 1) {
      console.error("[Booking] Database write rejected: MongoDB is not connected.");
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Booking system is temporarily unavailable because the database is offline. No payment was charged."
      });
    }

    // If a Bearer token is attached, verify it and prevent forged cross-customer identity in request body
    let verifiedCustomerId = null;
    let verifiedEmail = null;
    if (req.headers?.authorization || req.headers?.Authorization) {
      const auth = await verifyCustomerAuth(req);
      if (!auth.authorized) {
        return res.status(auth.status).json({ error: auth.error, message: auth.message });
      }
      verifiedCustomerId = String(auth.customer._id).trim();
      verifiedEmail = String(auth.customer.email || "").trim().toLowerCase();

      if (
        raw.customerId &&
        !String(raw.customerId).startsWith("guest-") &&
        String(raw.customerId).trim() !== verifiedCustomerId
      ) {
        return res.status(403).json({
          error: "CustomerIsolationViolation",
          message: "Forged customerId in request body does not match authenticated token identity."
        });
      }
      if (
        raw.email &&
        raw.email !== "passenger@tedbus.com" &&
        String(raw.email).trim().toLowerCase() !== verifiedEmail
      ) {
        return res.status(403).json({
          error: "CustomerIsolationViolation",
          message: "Forged email in request body does not match authenticated token identity."
        });
      }
    }

    const travelDate = raw.departureDetails?.date || raw.date || raw.bookingDate || new Date().toISOString().split("T")[0];

    const normalizedBooking = {
      customerId: verifiedCustomerId || raw.customerId || raw.userId || "guest-" + Date.now(),
      busId: String(raw.busId),
      operatorName: raw.operatorName || "TedBus Premier",
      seats: raw.seats.map(s => Number(s)),
      fare: Number(raw.fare || raw.totalAmount || 0),
      status: "confirmed",
      bookingDate: travelDate,
      passengerDetails: Array.isArray(raw.passengerDetails) ? raw.passengerDetails : (
        Array.isArray(raw.passengers) ? raw.passengers.map(p => ({
          name: p.name || "Passenger",
          gender: p.gender || "Male",
          age: Number(p.age || 25)
        })) : raw.seats.map((s, idx) => ({ name: `Passenger ${idx + 1}`, gender: "Male", age: 25 }))
      ),
      email: verifiedEmail || raw.email || "passenger@tedbus.com",
      phoneNumber: String(raw.phoneNumber || raw.phone || "9876543210"),
      departureDetails: {
        city: raw.departureDetails?.city || raw.departureCity || raw.route?.departureLocation?.name || "Origin",
        time: raw.departureDetails?.time !== undefined ? raw.departureDetails.time : (raw.departureTime !== undefined ? raw.departureTime : 6),
        date: travelDate
      },
      arrivalDetails: {
        city: raw.arrivalDetails?.city || raw.arrivalCity || raw.route?.arrivalLocation?.name || "Destination",
        time: raw.arrivalDetails?.time !== undefined ? raw.arrivalDetails.time : (raw.arrivalTime !== undefined ? raw.arrivalTime : 12),
        date: travelDate
      },
      duration: raw.duration || (raw.route?.duration ? `${raw.route.duration} hrs` : "6 hrs"),
      isBusinessTravel: Boolean(raw.isBusinessTravel),
      isInsurance: Boolean(raw.isInsurance),
      isCovidDonated: Boolean(raw.isCovidDonated)
    };

    // 3. Atomically check for conflicting seat reservations
    const existingConflict = await Booking.findOne({
      busId: normalizedBooking.busId,
      "departureDetails.date": travelDate,
      status: { $in: ["confirmed", "pending"] },
      seats: { $in: normalizedBooking.seats }
    }).lean().exec();

    if (existingConflict) {
      const overlappingSeats = normalizedBooking.seats.filter(s => existingConflict.seats.includes(s));
      return res.status(409).json({
        error: "SeatConflict",
        message: `Seat(s) ${overlappingSeats.join(", ")} have already been booked on this bus for ${travelDate}.`,
        conflictingSeats: overlappingSeats
      });
    }

    // 4. Persist booking to MongoDB with transaction if supported
    const topologyType = mongoose.connection.client?.topology?.description?.type;
    const supportsTransactions = topologyType === "ReplicaSetWithPrimary" || topologyType === "Sharded";

    let savedBooking;
    let session = null;

    if (supportsTransactions) {
      try {
        session = await mongoose.startSession();
      } catch (sessionErr) {
        session = null;
      }
    }

    if (session) {
      try {
        session.startTransaction();

        const conflictInTx = await Booking.findOne({
          busId: normalizedBooking.busId,
          "departureDetails.date": travelDate,
          status: { $in: ["confirmed", "pending"] },
          seats: { $in: normalizedBooking.seats }
        }).session(session);

        if (conflictInTx) {
          await session.abortTransaction();
          session.endSession();
          const overlappingSeats = normalizedBooking.seats.filter(s => conflictInTx.seats.includes(s));
          return res.status(409).json({
            error: "SeatConflict",
            message: `Seat(s) ${overlappingSeats.join(", ")} were just booked by another traveler.`,
            conflictingSeats: overlappingSeats
          });
        }

        const createdArr = await Booking.create([normalizedBooking], { session });
        savedBooking = createdArr[0];
        await session.commitTransaction();
      } catch (txErr) {
        await session.abortTransaction().catch(() => {});
        throw txErr;
      } finally {
        session.endSession();
      }
    } else {
      savedBooking = await Booking.create(normalizedBooking);
    }

    console.log(`[Booking] Confirmed & persisted to database: ID=${savedBooking._id}`);

    // Automatically trigger multi-channel notification for booking confirmation
    try {
      await createAndDispatchNotification({
        customerId: savedBooking.customerId,
        type: "booking_confirmed",
        title: `Booking Confirmed #${savedBooking._id}`,
        message: `Your journey from ${savedBooking.departureDetails?.city || 'Origin'} to ${savedBooking.arrivalDetails?.city || 'Destination'} is confirmed. Seat(s): ${savedBooking.seats.join(', ')}. Safe travels!`,
        link: "/profile",
        idempotencyKey: `booking_confirmed_${savedBooking._id}`,
        meta: { email: savedBooking.email }
      });
    } catch (notifErr) {
      console.warn("[Booking] Notice: Notification dispatch deferred:", notifErr.message);
    }

    res.setHeader("X-Data-Source", "mongodb");
    return res.status(201).json(savedBooking);

  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: "SeatConflict",
        message: "One or more of the selected seats were just reserved by another traveler. Please choose different seats."
      });
    }
    console.error("[Booking] Critical persistence error:", error);
    return res.status(500).json({
      error: "BookingPersistenceFailed",
      message: "An unexpected error occurred while saving the booking. The booking was NOT confirmed and no charges apply.",
      details: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
};

/**
 * Cancels an existing booking in the database.
 * - Requires a valid signed Bearer JWT token.
 * - Derives customer identity exclusively from the verified token.
 * - Enforces booking ownership (rejects cross-customer or forged-body requests with HTTP 403).
 * - Prevents cancellation when departure is less than 2 hours away OR has already passed.
 */
exports.cancelBooking = async (req, res) => {
  try {
    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({
        error: auth.error,
        message: auth.message
      });
    }

    const { id } = req.params;
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "BookingIdRequired", message: "A valid Booking ID is required." });
    }

    const authCustomerId = String(auth.customer._id).trim();
    const authEmail = String(auth.customer.email || "").trim().toLowerCase();

    // Reject forged customerId or email in request body, query, or headers if they conflict with token identity
    const bodyCustomerId = String(req.body?.customerId || req.headers?.["x-customer-id"] || req.query?.customerId || "").trim();
    const bodyEmail = String(req.body?.email || req.headers?.["x-customer-email"] || req.query?.email || "").trim().toLowerCase();

    if (bodyCustomerId && bodyCustomerId !== authCustomerId) {
      return res.status(403).json({
        error: "BookingOwnershipMismatch",
        message: "Access denied. Client-supplied customerId does not match the authenticated token identity."
      });
    }
    if (bodyEmail && bodyEmail !== authEmail) {
      return res.status(403).json({
        error: "BookingOwnershipMismatch",
        message: "Access denied. Client-supplied email does not match the authenticated token identity."
      });
    }

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({
        error: "BookingNotFound",
        message: `Booking with ID ${id} was not found.`
      });
    }

    // Verify ownership strictly against authenticated token identity
    const matchesCustomerId =
      Boolean(authCustomerId && booking.customerId && String(booking.customerId).trim() === authCustomerId);
    const matchesEmail =
      Boolean(authEmail && booking.email && String(booking.email).trim().toLowerCase() === authEmail);

    if (!matchesCustomerId && !matchesEmail) {
      return res.status(403).json({
        error: "BookingOwnershipMismatch",
        message: "Access denied. You can only cancel bookings that belong to your account."
      });
    }

    // Enforce 2-hour pre-departure cancellation cutoff AND block already-departed journeys
    const depTimeMs = parseDepartureTimeMs(booking);
    if (depTimeMs !== null) {
      const hoursUntilDeparture = (depTimeMs - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilDeparture < 0) {
        return res.status(400).json({
          error: "CancellationWindowClosed",
          message: "Bookings cannot be cancelled after the scheduled departure time has passed."
        });
      }
      if (hoursUntilDeparture < 2) {
        return res.status(400).json({
          error: "CancellationWindowClosed",
          message: "Bookings cannot be cancelled within 2 hours of scheduled departure."
        });
      }
    }

    booking.status = "cancelled";
    const updated = await booking.save();

    // Automatically trigger notification for booking cancellation
    try {
      await createAndDispatchNotification({
        customerId: updated.customerId,
        type: "booking_cancelled",
        title: `Booking Cancelled #${updated._id}`,
        message: `Your booking #${updated._id} from ${updated.departureDetails?.city || 'Origin'} to ${updated.arrivalDetails?.city || 'Destination'} has been cancelled. Automated refund processing initiated.`,
        link: "/profile",
        idempotencyKey: `booking_cancelled_${updated._id}`,
        meta: { email: updated.email }
      });
    } catch (notifErr) {
      console.warn("[Booking] Notice: Notification dispatch deferred:", notifErr.message);
    }

    res.setHeader("X-Data-Source", "mongodb");
    res.json(updated);

  } catch (error) {
    console.error("[Booking] Error cancelling booking:", error);
    res.status(500).json({ error: "Failed to cancel booking" });
  }
};

/**
 * Retrieves bookings or a single booking strictly scoped to the verified JWT customer.
 * Rejects unauthenticated requests with HTTP 401 and cross-customer access with HTTP 403.
 */
exports.getBooking = async (req, res) => {
  try {
    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({
        error: auth.error,
        message: auth.message
      });
    }

    const requestedId = String(req.params.id || "").trim();
    const authCustomerId = String(auth.customer._id).trim();
    const authEmail = String(auth.customer.email || "").trim().toLowerCase();

    const headerCustomerId = String(req.headers?.["x-customer-id"] || "").trim();
    if (headerCustomerId && headerCustomerId !== authCustomerId) {
      return res.status(403).json({
        error: "CustomerIsolationViolation",
        message: "Access denied. Header customerId does not match authenticated token identity."
      });
    }

    // If the path parameter matches the authenticated customer's ID or email, return their bookings
    if (requestedId === authCustomerId || requestedId.toLowerCase() === authEmail) {
      const filter = authEmail
        ? { $or: [{ customerId: authCustomerId }, { email: authEmail }] }
        : { customerId: authCustomerId };
      const bookings = await Booking.find(filter).sort({ _id: -1 }).lean().exec();
      res.setHeader("X-Data-Source", "mongodb");
      return res.json(bookings || []);
    }

    // Otherwise, check if requestedId is a specific Booking ObjectId owned by the authenticated customer
    if (mongoose.Types.ObjectId.isValid(requestedId)) {
      const singleBooking = await Booking.findById(requestedId).lean().exec();
      if (singleBooking) {
        const ownsById = singleBooking.customerId && String(singleBooking.customerId).trim() === authCustomerId;
        const ownsByEmail = authEmail && singleBooking.email && String(singleBooking.email).trim().toLowerCase() === authEmail;
        if (!ownsById && !ownsByEmail) {
          return res.status(403).json({
            error: "CustomerIsolationViolation",
            message: "Access denied. You cannot view another customer's booking."
          });
        }
        res.setHeader("X-Data-Source", "mongodb");
        return res.json(singleBooking);
      }
    }

    // Any other ID is an unauthorized attempt to access another customer's bookings
    return res.status(403).json({
      error: "CustomerIsolationViolation",
      message: "Access denied. You cannot view another customer's bookings."
    });
  } catch (error) {
    console.error("[Booking] Error fetching bookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
};

/**
 * Retrieves bookings strictly scoped to the authenticated customer derived from the verified JWT.
 * Never returns all customers' bookings and never trusts client-supplied customerId/email for identity.
 */
exports.getAllBookings = async (req, res) => {
  try {
    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({
        error: auth.error,
        message: auth.message
      });
    }

    const authCustomerId = String(auth.customer._id).trim();
    const authEmail = String(auth.customer.email || "").trim().toLowerCase();

    const queryCustomerId = String(req.query?.customerId || "").trim();
    const headerCustomerId = String(req.headers?.["x-customer-id"] || "").trim();
    const queryEmail = String(req.query?.email || "").trim().toLowerCase();
    const headerEmail = String(req.headers?.["x-customer-email"] || "").trim().toLowerCase();
    const bodyCustomerId = String(req.body?.customerId || "").trim();
    const bodyEmail = String(req.body?.email || "").trim().toLowerCase();

    // Reject any cross-customer query, header, or body parameter mismatch with HTTP 403
    if (
      (queryCustomerId && queryCustomerId !== authCustomerId) ||
      (headerCustomerId && headerCustomerId !== authCustomerId) ||
      (bodyCustomerId && bodyCustomerId !== authCustomerId)
    ) {
      return res.status(403).json({
        error: "CustomerIsolationViolation",
        message: "Access denied. Requested customerId does not match authenticated customer token."
      });
    }

    if (
      (queryEmail && queryEmail !== authEmail) ||
      (headerEmail && headerEmail !== authEmail) ||
      (bodyEmail && bodyEmail !== authEmail)
    ) {
      return res.status(403).json({
        error: "CustomerIsolationViolation",
        message: "Access denied. Requested email does not match authenticated customer token."
      });
    }

    const filter = authEmail
      ? { $or: [{ customerId: authCustomerId }, { email: authEmail }] }
      : { customerId: authCustomerId };

    const bookings = await Booking.find(filter).sort({ _id: -1 }).lean().exec();
    res.setHeader("X-Data-Source", "mongodb");
    res.json(bookings || []);
  } catch (error) {
    console.error("[Booking] Error fetching customer bookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
};
