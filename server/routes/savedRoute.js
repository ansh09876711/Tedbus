const express = require("express");
const router = express.Router();
const savedRouteController = require("../controller/savedRoute");

router.get("/saved-routes", savedRouteController.getSavedRoutes);
router.post("/saved-routes", savedRouteController.saveRoute);
router.post("/saved-routes/calculate", savedRouteController.calculateRouteMetrics);
router.delete("/saved-routes/:id", savedRouteController.deleteSavedRoute);

module.exports = router;
