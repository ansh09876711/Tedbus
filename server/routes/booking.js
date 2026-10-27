const express = require("express");
const router = express.Router();
const bookingController = require("../controller/booking");

router.post("/booking", bookingController.addbooking);
router.get("/booking", bookingController.getAllBookings);
router.get("/booking/:id", bookingController.getBooking);
router.put("/booking/:id/cancel", bookingController.cancelBooking);
router.patch("/booking/:id/cancel", bookingController.cancelBooking);

module.exports = router;
