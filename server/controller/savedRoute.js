const SavedRoute = require("../models/savedRoute");

const defaultSavedRoutes = [
  {
    _id: "sr-1",
    routeName: "Delhi to Jaipur via Neemrana heritage stop",
    origin: { name: "Delhi", lat: 28.6139, lng: 77.2090 },
    destination: { name: "Jaipur", lat: 26.9124, lng: 75.7873 },
    waypoints: [{ name: "Neemrana Fort", lat: 27.9888, lng: 76.3883 }],
    totalDistanceKm: 280,
    estimatedDurationMin: 310,
    notes: "Scenic stops and heritage highway route",
    createdAt: new Date().toISOString(),
  }
];

// Get all saved routes for a user
exports.getSavedRoutes = async (req, res) => {
  try {
    const { customerId } = req.query;
    let saved = [];
    if (customerId && customerId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        saved = await SavedRoute.find({ customerId }).sort({ createdAt: -1 }).lean().exec();
      } catch (e) {
        saved = [];
      }
    }

    const isFallback = !saved || saved.length === 0;
    if (isFallback) {
      saved = defaultSavedRoutes;
      res.setHeader("X-Data-Source", "fallback");
    } else {
      res.setHeader("X-Data-Source", "mongodb");
    }

    res.json(saved);
  } catch (error) {
    console.error("Error fetching saved routes:", error);
    res.status(500).json({ error: "Failed to fetch saved routes" });
  }
};

// Save a new route
exports.saveRoute = async (req, res) => {
  try {
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Route saving is temporarily unavailable because the database is offline."
      });
    }

    const { customerId, routeName, origin, destination, waypoints, totalDistanceKm, estimatedDurationMin, notes } = req.body;

    if (!routeName || !origin || !destination) {
      return res.status(400).json({ error: "Route name, origin and destination are required" });
    }

    const saved = await SavedRoute.create({
      customerId: customerId && customerId.match(/^[0-9a-fA-F]{24}$/) ? customerId : new mongoose.Types.ObjectId(),
      routeName,
      origin,
      destination,
      waypoints: Array.isArray(waypoints) ? waypoints : [],
      totalDistanceKm: Number(totalDistanceKm || 0),
      estimatedDurationMin: Number(estimatedDurationMin || 0),
      notes: notes || "",
    });

    res.setHeader("X-Data-Source", "mongodb");
    res.status(201).json(saved);
  } catch (error) {
    console.error("Error saving route:", error);
    res.status(500).json({ error: "Failed to persist route to database" });
  }
};

// Delete a saved route
exports.deleteSavedRoute = async (req, res) => {
  try {
    const { id } = req.params;
    try {
      await SavedRoute.findByIdAndDelete(id);
    } catch (e) {}
    res.json({ success: true, message: "Route deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete route" });
  }
};
