const express = require("express");
const router = express.Router();
const Bus = require("../models/bus");

const mongoose = require("mongoose");
const { getFallbackBuses } = require("../controller/route");

// Route to get all buses or filter buses
router.get("/buses", async (req, res) => {
  try {
    if (mongoose.connection.readyState === 1) {
      const buses = await Bus.find().populate("routes").lean().exec();
      if (buses && buses.length > 0) {
        res.setHeader("X-Data-Source", "mongodb");
        return res.json(buses);
      }
    }
    // Fallback data when database is offline or empty
    const fallbackBuses = getFallbackBuses();
    res.setHeader("X-Data-Source", "fallback");
    return res.json(fallbackBuses);
  } catch (err) {
    const fallbackBuses = getFallbackBuses();
    res.setHeader("X-Data-Source", "fallback");
    return res.json(fallbackBuses);
  }
});

module.exports = router;
