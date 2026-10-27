const express = require("express");
const router = express.Router();
const reviewController = require("../controller/review");

router.get("/reviews", reviewController.getReviews);
router.post("/reviews", reviewController.createReview);
router.post("/reviews/:id/helpful", reviewController.voteHelpful);

module.exports = router;
