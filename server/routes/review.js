const express = require("express");
const router = express.Router();
const reviewController = require("../controller/review");

// Core review CRUD
router.get("/reviews", reviewController.getReviews);
router.post("/reviews", reviewController.createReview);
router.put("/reviews/:id", reviewController.editReview);

// Eligibility check (must be before /:id routes to avoid conflict)
router.get("/reviews/eligibility", reviewController.checkEligibility);

// Review interactions
router.post("/reviews/:id/helpful", reviewController.voteHelpful);
router.post("/reviews/:id/report", reviewController.reportReview);
router.post("/reviews/:id/moderate", reviewController.moderateReview);

module.exports = router;

