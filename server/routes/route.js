const express = require("express");
const router = express.Router();
const routecontroller = require("../controller/route");
const Route = require("../models/route");

router.get("/routes", async (req, res) => {
  try {
    const routes = await Route.find().lean().exec();
    if (routes && routes.length > 0) {
      res.setHeader("X-Data-Source", "mongodb");
      return res.json(routes);
    }
    res.setHeader("X-Data-Source", "fallback");
    return res.json(routecontroller.getFallbackRoutes ? routecontroller.getFallbackRoutes() : []);
  } catch (err) {
    try {
      const fs = require("fs");
      const path = require("path");
      const routeFilePath = path.join(__dirname, "../../frontend/routedata.json");
      if (fs.existsSync(routeFilePath)) {
        res.setHeader("X-Data-Source", "fallback");
        return res.json(JSON.parse(fs.readFileSync(routeFilePath, "utf8")));
      }
    } catch (e) {}
    res.status(500).json({ error: "Failed to fetch routes" });
  }
});

router.get("/routes/:departure/:arrival/:date", routecontroller.getoneroute);

module.exports = router;
