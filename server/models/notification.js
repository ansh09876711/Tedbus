const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// User Notification Schema
const notificationSchema = new Schema({
  customerId: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: [
      "booking_confirmed",
      "booking_cancelled",
      "departure_reminder",
      "community_activity",
      "promotional",
      "system"
    ],
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  link: {
    type: String,
    default: "",
  },
  read: {
    type: Boolean,
    default: false,
  },
  idempotencyKey: {
    type: String,
    unique: true,
    sparse: true,
  },
}, { timestamps: true });

// Notification Delivery Attempt Schema
const notificationDeliveryAttemptSchema = new Schema({
  notificationId: {
    type: Schema.Types.ObjectId,
    ref: "Notifications",
    required: true,
  },
  channel: {
    type: String,
    enum: ["in_app", "email", "push"],
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "delivered", "failed"],
    default: "pending",
  },
  attemptCount: {
    type: Number,
    default: 1,
  },
  errorMessage: {
    type: String,
    default: "",
  },
}, { timestamps: true });

const Notification = mongoose.model("Notifications", notificationSchema);
const NotificationDeliveryAttempt = mongoose.model("NotificationDeliveryAttempts", notificationDeliveryAttemptSchema);

module.exports = {
  Notification,
  NotificationDeliveryAttempt,
};
