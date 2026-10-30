const Booking = require("../models/booking");
const mongoose = require("mongoose");
const { createAndDispatchNotification } = require("./notification");


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

    const travelDate = raw.departureDetails?.date || raw.date || raw.bookingDate || new Date().toISOString().split("T")[0];

    const normalizedBooking = {
      customerId: raw.customerId || raw.userId || "guest-" + Date.now(),
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
      email: raw.email || "passenger@tedbus.com",
      phoneNumber: String(raw.phoneNumber || raw.phone || "9876543210"),
      departureDetails: {
        city: raw.departureDetails?.city || raw.departureCity || raw.route?.departureLocation?.name || "Origin",
        time: raw.departureDetails?.time || raw.departureTime || 6,
        date: travelDate
      },
      arrivalDetails: {
        city: raw.arrivalDetails?.city || raw.arrivalCity || raw.route?.arrivalLocation?.name || "Destination",
        time: raw.arrivalDetails?.time || raw.arrivalTime || 12,
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

        // Double check within transaction
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
      // Direct atomic write on standalone deployment
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
 */
exports.cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ error: "BookingIdRequired", message: "Booking ID is required." });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Database service is offline. Cannot cancel booking at this time."
      });
    }

    const updated = await Booking.findByIdAndUpdate(
      id,
      { status: "cancelled" },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        error: "BookingNotFound",
        message: `Booking with ID ${id} was not found.`
      });
    }

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
 * Retrieves bookings for a customer.
 */
exports.getBooking = async (req, res) => {
  try {
    const { id } = req.params;
    if (mongoose.connection.readyState !== 1) {
      res.setHeader("X-Data-Source", "fallback");
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Database is offline.",
        bookings: []
      });
    }

    const bookings = await Booking.find({ customerId: id }).sort({ _id: -1 }).lean().exec();
    res.setHeader("X-Data-Source", "mongodb");
    res.json(bookings || []);
  } catch (error) {
    console.error("[Booking] Error fetching bookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
};

/**
 * Retrieves all bookings (or filtered by customerId).
 */
exports.getAllBookings = async (req, res) => {
  try {
    const { customerId } = req.query;
    if (mongoose.connection.readyState !== 1) {
      res.setHeader("X-Data-Source", "fallback");
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Database is offline.",
        bookings: []
      });
    }

    const filter = customerId ? { customerId } : {};
    const bookings = await Booking.find(filter).sort({ _id: -1 }).lean().exec();
    res.setHeader("X-Data-Source", "mongodb");
    res.json(bookings || []);
  } catch (error) {
    console.error("[Booking] Error fetching all bookings:", error);
    res.status(500).json({ error: "Failed to fetch bookings" });
  }
};
