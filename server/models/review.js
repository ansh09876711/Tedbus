const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Verified Journey Review Schema
const journeyReviewSchema = new Schema({
  routeId: {
    type: Schema.Types.ObjectId,
    ref: "Routes",
    required: true,
    index: true,
  },
  busId: {
    type: Schema.Types.ObjectId,
    ref: "Buses",
    required: false,
  },
  bookingId: {
    type: Schema.Types.ObjectId,
    ref: "Bookings",
    required: true,
    unique: true, // Strictly enforces one review per eligible completed journey!
  },
  customerId: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
  },
  authorName: {
    type: String,
    required: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  reviewText: {
    type: String,
    required: true,
    minlength: 20, // Spec requirement: minimum 20 characters
    trim: true,
  },
  helpfulVotes: [{
    type: Schema.Types.ObjectId,
    ref: "Customers",
  }],
  isVerifiedJourney: {
    type: Boolean,
    default: true,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Review Report Schema
const reviewReportSchema = new Schema({
  reviewId: {
    type: Schema.Types.ObjectId,
    ref: "JourneyReviews",
    required: true,
  },
  reportedBy: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["pending", "reviewed", "dismissed"],
    default: "pending",
  },
}, { timestamps: true });

const JourneyReview = mongoose.model("JourneyReviews", journeyReviewSchema);
const ReviewReport = mongoose.model("ReviewReports", reviewReportSchema);

module.exports = {
  JourneyReview,
  ReviewReport,
};
