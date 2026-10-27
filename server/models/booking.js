const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const bookingSchema = new Schema({
  customerId: {
    type: String,
    required: true,
  },
  passengerDetails: [
    {
      name: { type: String, required: true },
      gender: { type: String, required: true },
      age: { type: Number, required: true },
    },
  ],
  email: {
    type: String,
    required: true,
  },
  phoneNumber: {
    type: String,
    required: true,
  },
  fare: {
    type: Number,
    required: true,
  },
  status: {
    type: String,
    enum: ["confirmed", "cancelled", "completed"],
    default: "confirmed",
  },
  operatorName: {
    type: String,
    required: false,
  },
  bookingDate: {
    type: String,
    required: true,
  },
  busId: {
    type: String,
    required: true,
  },
  seats: {
    type: [Number],
    required: true,
  },
  departureDetails: {
    city: { type: String, required: true },
    time: { type: Schema.Types.Mixed, required: true },
    date: { type: String, required: false },
  },
  arrivalDetails: {
    city: { type: String, required: true },
    time: { type: Schema.Types.Mixed, required: true },
    date: { type: String, required: false },
  },
  duration: {
    type: Schema.Types.Mixed,
    required: false,
  },
  isBusinessTravel: {
    type: Boolean,
    required: false,
  },
  businessDetails: {
    gst: { type: String, required: false },
    name: { type: String, required: false },
    address: { type: String, required: false },
    email: { type: String, required: false },
  },
  isInsurance: {
    type: Boolean,
    required: false,
  },
  isCovidDonated: {
    type: Boolean,
    required: false,
  },
}, { timestamps: true });

// Compound indexes for rapid conflict detection and customer booking history
bookingSchema.index({ customerId: 1, createdAt: -1 });

// Atomic database-level guarantee against duplicate seat reservations on the same bus & date
bookingSchema.index(
  { busId: 1, "departureDetails.date": 1, seats: 1 },
  { unique: true, partialFilterExpression: { status: "confirmed" } }
);

module.exports = mongoose.model("Bookings", bookingSchema);
