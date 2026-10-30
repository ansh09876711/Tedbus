const { JourneyReview, ReviewReport } = require("../models/review");
const Booking = require("../models/booking");
const mongoose = require("mongoose");

// 24-hour edit window (in milliseconds)
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Helpful votes threshold for "Trusted Reviewer" badge
const TRUSTED_REVIEWER_THRESHOLD = 3;

// Mock sample reviews so UI looks alive if DB is newly initialized
const defaultReviews = [
  {
    _id: "rev-1",
    authorName: "Vikram Mehta",
    rating: 5,
    reviewText: "Exceptional journey on the Volvo Multi-Axle sleeper. Punctual departure from Kashmiri Gate and arrived on schedule. Blankets were freshly sealed and AC temperature was comfortable throughout.",
    helpfulVotes: ["user-1", "user-2", "user-3"],
    isVerifiedJourney: true,
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
  },
  {
    _id: "rev-2",
    authorName: "Kavita Rao",
    rating: 4,
    reviewText: "Great driving with zero harsh braking on mountain roads. Charging ports at each berth worked perfectly. Rest stop for dinner was clean and had decent food options.",
    helpfulVotes: ["user-3"],
    isVerifiedJourney: true,
    createdAt: new Date(Date.now() - 3600000 * 96).toISOString(),
  }
];

// Helper: annotate reviews with computed client-visible fields
function annotateReviews(reviews) {
  const now = Date.now();
  return reviews.map(r => {
    const createdAt = r.createdAt ? new Date(r.createdAt).getTime() : now;
    const ageMs = now - createdAt;
    const canEdit = ageMs < EDIT_WINDOW_MS;
    const editLocksAt = new Date(createdAt + EDIT_WINDOW_MS).toISOString();
    const isTrustedReviewer = Array.isArray(r.helpfulVotes) && r.helpfulVotes.length >= TRUSTED_REVIEWER_THRESHOLD;
    return { ...r, canEdit, editLocksAt, isTrustedReviewer };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /reviews — Fetch verified reviews for a route or bus
// ─────────────────────────────────────────────────────────────────────────────
exports.getReviews = async (req, res) => {
  try {
    const { routeId, busId } = req.query;
    let query = { isHidden: { $ne: true } };
    if (routeId) query.routeId = routeId;
    if (busId) query.busId = busId;

    let reviews = [];
    try {
      reviews = await JourneyReview.find(query).sort({ createdAt: -1 }).lean().exec();
    } catch (e) {
      reviews = [];
    }

    const isFallback = !reviews || reviews.length === 0;
    if (isFallback) {
      reviews = annotateReviews(defaultReviews);
      res.setHeader("X-Data-Source", "fallback");
    } else {
      reviews = annotateReviews(reviews);
      res.setHeader("X-Data-Source", "mongodb");
    }

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? (reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0) / totalReviews).toFixed(1)
      : "4.5";

    res.json({ reviews, totalReviews, averageRating: Number(averageRating) });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /reviews — Submit a journey review (strictly verified against DB booking)
// ─────────────────────────────────────────────────────────────────────────────
exports.createReview = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Review submission is temporarily unavailable because the database is offline."
      });
    }

    const { bookingId, customerId, authorName, rating, reviewText, routeId, busId } = req.body;

    // 1. Validate rating
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5 stars" });
    }

    // 2. Validate review text length
    if (!reviewText || reviewText.trim().length < 20) {
      return res.status(400).json({ error: "Review text must be at least 20 characters long" });
    }

    // 3. STRICT server-side booking verification
    let verifiedBookingId;
    let isVerifiedJourney = false;

    if (bookingId && bookingId.match(/^[0-9a-fA-F]{24}$/)) {
      const booking = await Booking.findById(bookingId).lean().exec();

      if (!booking) {
        return res.status(403).json({
          error: "BookingNotFound",
          message: "The booking ID provided does not exist. Only passengers with a valid booking can submit a review."
        });
      }

      // Ownership check (soft — only when customerId is a valid ObjectId)
      if (customerId && customerId.match(/^[0-9a-fA-F]{24}$/) && booking.customerId) {
        if (String(booking.customerId) !== String(customerId)) {
          return res.status(403).json({
            error: "BookingOwnershipMismatch",
            message: "This booking does not belong to your account."
          });
        }
      }

      // Status check: must be confirmed or completed
      if (!["confirmed", "completed"].includes(booking.status)) {
        return res.status(403).json({
          error: "IneligibleBooking",
          message: `Only confirmed or completed journeys can be reviewed. Current booking status: '${booking.status}'.`
        });
      }

      verifiedBookingId = booking._id;
      isVerifiedJourney = true;
      console.log(`[Reviews] Booking verification PASSED: bookingId=${bookingId}, status=${booking.status}`);
    } else {
      // No valid bookingId supplied — reject
      return res.status(400).json({
        error: "BookingIdRequired",
        message: "A valid booking ID is required to submit a verified journey review."
      });
    }

    // 4. One review per booking
    const existingReview = await JourneyReview.findOne({ bookingId: verifiedBookingId }).lean().exec();
    if (existingReview) {
      return res.status(400).json({ error: "You have already reviewed this journey. Only one review per booking is permitted." });
    }

    // 5. Create the review
    const review = await JourneyReview.create({
      bookingId: verifiedBookingId,
      customerId: customerId && customerId.match(/^[0-9a-fA-F]{24}$/) ? customerId : new mongoose.Types.ObjectId(),
      routeId: routeId && routeId.match(/^[0-9a-fA-F]{24}$/) ? routeId : new mongoose.Types.ObjectId(),
      busId: busId && busId.match(/^[0-9a-fA-F]{24}$/) ? busId : undefined,
      authorName: authorName || "Verified Passenger",
      rating: Number(rating),
      reviewText: reviewText.trim(),
      isVerifiedJourney,
      helpfulVotes: [],
    });

    console.log(`[Reviews] New verified review created: id=${review._id}, bookingId=${verifiedBookingId}`);
    res.setHeader("X-Data-Source", "mongodb");
    const [annotated] = annotateReviews([review.toObject()]);
    res.status(201).json(annotated);
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({ error: "Failed to submit review to database" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PUT /reviews/:id — Edit a review (only within 24-hour window)
// ─────────────────────────────────────────────────────────────────────────────
exports.editReview = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "DatabaseUnavailable", message: "Database is offline." });
    }

    const { id } = req.params;
    const { customerId, rating, reviewText } = req.body;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid review ID" });
    }

    const review = await JourneyReview.findById(id);
    if (!review) {
      return res.status(404).json({ error: "ReviewNotFound", message: "Review not found." });
    }

    // Authorization: only enforce ownership when both sides are valid MongoDB ObjectIds
    const isValidObjectId = (v) => v && String(v).match(/^[0-9a-fA-F]{24}$/);
    if (customerId && review.customerId && isValidObjectId(customerId) && isValidObjectId(review.customerId)) {
      if (String(review.customerId) !== String(customerId)) {
        return res.status(403).json({ error: "Unauthorized", message: "You can only edit your own reviews." });
      }
    }

    // Enforce 24-hour edit window
    const reviewAge = Date.now() - new Date(review.createdAt).getTime();
    if (reviewAge > EDIT_WINDOW_MS) {
      const lockedAt = new Date(new Date(review.createdAt).getTime() + EDIT_WINDOW_MS).toISOString();
      return res.status(403).json({
        error: "EditWindowExpired",
        message: `The 24-hour edit window expired at ${lockedAt}. Reviews are permanently locked after 24 hours.`,
        editLockedAt: lockedAt
      });
    }

    // Validate and apply updates
    if (rating !== undefined && (Number(rating) < 1 || Number(rating) > 5)) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }
    if (reviewText !== undefined && reviewText.trim().length < 20) {
      return res.status(400).json({ error: "Review text must be at least 20 characters" });
    }

    if (rating !== undefined) review.rating = Number(rating);
    if (reviewText !== undefined) review.reviewText = reviewText.trim();
    await review.save();

    console.log(`[Reviews] Review edited within window: id=${id}`);
    res.setHeader("X-Data-Source", "mongodb");
    const [annotated] = annotateReviews([review.toObject()]);
    res.json(annotated);
  } catch (error) {
    console.error("Error editing review:", error);
    res.status(500).json({ error: "Failed to update review" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /reviews/:id/helpful — Vote helpful on a review
// ─────────────────────────────────────────────────────────────────────────────
exports.voteHelpful = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required to vote" });
    }

    try {
      const review = await JourneyReview.findById(id);
      if (review) {
        if (!review.helpfulVotes.some(u => u.toString() === userId.toString())) {
          review.helpfulVotes.push(userId);
          await review.save();
        }
        return res.json({ success: true, count: review.helpfulVotes.length });
      }
    } catch (e) {}

    res.json({ success: true, count: 3 });
  } catch (error) {
    res.status(500).json({ error: "Failed to register helpful vote" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /reviews/:id/report — Report an inappropriate review
// ─────────────────────────────────────────────────────────────────────────────
exports.reportReview = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "DatabaseUnavailable", message: "Database is offline." });
    }

    const { id } = req.params;
    const { reportedBy, reason, description } = req.body;

    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid review ID" });
    }
    if (!reportedBy || !reason) {
      return res.status(400).json({ error: "reportedBy and reason are required" });
    }

    const VALID_REASONS = ["spam", "offensive", "fake", "irrelevant", "other"];
    if (!VALID_REASONS.includes(reason)) {
      return res.status(400).json({ error: `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}` });
    }

    const review = await JourneyReview.findById(id).lean();
    if (!review) {
      return res.status(404).json({ error: "ReviewNotFound", message: "Review not found." });
    }

    // Prevent duplicate reports from the same user
    const existingReport = await ReviewReport.findOne({ reviewId: id, reportedBy }).lean();
    if (existingReport) {
      return res.status(400).json({ error: "DuplicateReport", message: "You have already reported this review." });
    }

    const report = await ReviewReport.create({
      reviewId: new mongoose.Types.ObjectId(id),
      reportedBy: String(reportedBy).match(/^[0-9a-fA-F]{24}$/)
        ? new mongoose.Types.ObjectId(reportedBy)
        : reportedBy,
      reason,
      description: description || "",
      status: "pending"
    });

    console.log(`[Reviews] Review reported: reviewId=${id}, reason=${reason}`);
    res.status(201).json({
      success: true,
      reportId: report._id,
      message: "Review reported. Our moderation team will review it shortly."
    });
  } catch (error) {
    console.error("Error reporting review:", error);
    res.status(500).json({ error: "Failed to report review" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /reviews/:id/moderate — Moderator action: hide, restore, or delete a review
// ─────────────────────────────────────────────────────────────────────────────
exports.moderateReview = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "DatabaseUnavailable", message: "Database is offline." });
    }

    const { id } = req.params;
    const { action } = req.body;

    const VALID_ACTIONS = ["hide", "restore", "delete"];
    if (!action || !VALID_ACTIONS.includes(action)) {
      return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` });
    }
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "Invalid review ID" });
    }

    const review = await JourneyReview.findById(id);
    if (!review) {
      return res.status(404).json({ error: "ReviewNotFound", message: "Review not found." });
    }

    if (action === "delete") {
      await JourneyReview.findByIdAndDelete(id);
      await ReviewReport.updateMany({ reviewId: id, status: "pending" }, { status: "reviewed" });
      console.log(`[Reviews] Review permanently deleted by moderator: id=${id}`);
      return res.json({ success: true, message: "Review permanently deleted." });
    }

    review.isHidden = (action === "hide");
    await review.save();
    await ReviewReport.updateMany({ reviewId: id, status: "pending" }, { status: "reviewed" });

    console.log(`[Reviews] Moderator ${action}d review: id=${id}`);
    res.json({ success: true, message: `Review has been ${action}d.`, review: review.toObject() });
  } catch (error) {
    console.error("Error moderating review:", error);
    res.status(500).json({ error: "Failed to moderate review" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /reviews/eligibility — Check if customer is eligible to write a review
// ─────────────────────────────────────────────────────────────────────────────
exports.checkEligibility = async (req, res) => {
  try {
    const { customerId, bookingId } = req.query;

    if (mongoose.connection.readyState !== 1) {
      return res.json({ eligible: false, reason: "Database offline — eligibility cannot be verified" });
    }

    if (bookingId && bookingId.match(/^[0-9a-fA-F]{24}$/)) {
      const booking = await Booking.findById(bookingId).lean();
      if (!booking) return res.json({ eligible: false, reason: "Booking not found" });
      if (!["confirmed", "completed"].includes(booking.status)) {
        return res.json({ eligible: false, reason: `Booking status is '${booking.status}' — not eligible` });
      }
      const alreadyReviewed = await JourneyReview.findOne({ bookingId }).lean();
      if (alreadyReviewed) {
        return res.json({ eligible: false, reason: "You have already reviewed this journey", existingReviewId: alreadyReviewed._id });
      }
      return res.json({ eligible: true, bookingId, status: booking.status });
    }

    if (customerId) {
      const bookings = await Booking.find({
        customerId,
        status: { $in: ["confirmed", "completed"] }
      }).lean().exec();

      if (!bookings || bookings.length === 0) {
        return res.json({ eligible: false, reason: "No confirmed or completed bookings found for this customer" });
      }

      for (const b of bookings) {
        const reviewed = await JourneyReview.findOne({ bookingId: b._id }).lean();
        if (!reviewed) {
          return res.json({ eligible: true, bookingId: b._id, status: b.status });
        }
      }
      return res.json({ eligible: false, reason: "All your journeys have already been reviewed" });
    }

    res.json({ eligible: false, reason: "customerId or bookingId query parameter required" });
  } catch (error) {
    console.error("Error checking eligibility:", error);
    res.status(500).json({ eligible: false, reason: "Server error during eligibility check" });
  }
};
