const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Saved Route Schema for Interactive Route Planner
const savedRouteSchema = new Schema({
  customerId: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
    index: true,
  },
  routeName: {
    type: String,
    required: true,
    trim: true,
  },
  origin: {
    name: { type: String, required: true },
    lat: { type: Number, required: false },
    lng: { type: Number, required: false },
  },
  destination: {
    name: { type: String, required: true },
    lat: { type: Number, required: false },
    lng: { type: Number, required: false },
  },
  waypoints: [{
    name: { type: String, required: true },
    lat: { type: Number, required: false },
    lng: { type: Number, required: false },
  }],
  totalDistanceKm: {
    type: Number,
    required: false,
  },
  estimatedDurationMin: {
    type: Number,
    required: false,
  },
  notes: {
    type: String,
    default: "",
  },
}, { timestamps: true });

module.exports = mongoose.model("SavedRoutes", savedRouteSchema);
