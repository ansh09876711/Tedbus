const Route = require("../models/route");
const Bus = require("../models/bus");
const Booking = require("../models/booking");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const { verifyAdminOnly } = require("../middleware/auth");

function getFallbackRoutes() {
  try {
    const routeFilePath = path.join(__dirname, "../../frontend/routedata.json");
    if (fs.existsSync(routeFilePath)) {
      const rawRoutes = JSON.parse(fs.readFileSync(routeFilePath, "utf8"));
      return rawRoutes.map(r => ({
        ...r,
        _id: r._id && r._id.$oid ? r._id.$oid : (r._id ? r._id.toString() : new mongoose.Types.ObjectId().toString())
      }));
    }
  } catch (e) {
    console.warn("Could not load local routedata.json fallback:", e.message);
  }
  return [];
}

function getFallbackBuses() {
  try {
    const busFilePath = path.join(__dirname, "../../frontend/busdata.json");
    if (fs.existsSync(busFilePath)) {
      const rawBuses = JSON.parse(fs.readFileSync(busFilePath, "utf8"));
      return rawBuses.map(b => ({
        ...b,
        _id: b._id && b._id.$oid ? b._id.$oid : (b._id ? b._id.toString() : new mongoose.Types.ObjectId().toString()),
        routes: b.routes && b.routes.$oid ? b.routes.$oid : (b.routes ? b.routes.toString() : "")
      }));
    }
  } catch (e) {
    console.warn("Could not load local busdata.json fallback:", e.message);
  }
  return [];
}

function getSublocations(cityName) {
  const map = {
    Delhi: ["Connaught Place", "ISBT Kashmiri Gate", "Dhaula Kuan", "Chandni Chowk", "Lajpat Nagar"],
    Jaipur: ["Sindhi Camp", "Hawa Mahal", "Amer Fort", "Narayan Singh Circle"],
    Mumbai: ["Borivali", "Dadar", "Bandra", "Andheri", "Vashi"],
    Goa: ["Panaji", "Madgaon", "Calangute", "Mapusa"],
    Bangalore: ["Majestic", "Electronic City", "Silk Board", "Indiranagar", "Hebbal"],
    Mysore: ["Suburban Bus Stand", "Mysore Palace", "Columbia Asia", "Infosys Gate"],
    Kolkata: ["Esplanade", "Howrah", "Salt Lake", "Ultadanga", "Airport"],
    Darjeeling: ["Mall Road", "Tiger Hill", "Ghum", "Batasia Loop", "Chauk Bazaar"],
    Chennai: ["Koyambedu CMBT", "Guindy", "Tambaram", "Velachery", "T Nagar"],
    Pondicherry: ["Bus Stand", "White Town", "Auroville", "Heritage Town"],
    Hyderabad: ["MGBS", "Ameerpet", "Kukatpally", "Gachibowli"],
    Pune: ["Swargate", "Wakad", "Shivajinagar", "Viman Nagar"]
  };
  return map[cityName] || [
    `${cityName} Central Bus Stand`,
    `${cityName} Highway Toll Plaza`,
    `${cityName} Railway Station Circle`,
    `${cityName} Bypass Junction`
  ];
}

exports.getoneroute = async (req, res) => {
  try {
    let departure = (req.params.departure || "").trim();
    let arrival = (req.params.arrival || "").trim();
    let date = req.params.date;

    const fallbackRoutes = getFallbackRoutes();
    const fallbackBuses = getFallbackBuses();

    let routes = [];
    let dbRouteIds = new Set();
    try {
      routes = await Route.find().lean().exec();
      if (routes && routes.length > 0) {
        routes.forEach(r => dbRouteIds.add(String(r._id)));
      }
    } catch (dbErr) {
      console.warn("Database route query failed, using local data:", dbErr.message);
    }

    if (!routes || routes.length === 0) {
      routes = fallbackRoutes;
    } else {
      // Merge fallback routes into db routes if missing
      fallbackRoutes.forEach(fr => {
        const exists = routes.some(r => 
          r.departureLocation?.name?.toLowerCase() === fr.departureLocation?.name?.toLowerCase() &&
          r.arrivalLocation?.name?.toLowerCase() === fr.arrivalLocation?.name?.toLowerCase()
        );
        if (!exists) routes.push(fr);
      });
    }

    let isFromDb = false;
    let route = routes.find((r) => {
      const match = (
        r.departureLocation &&
        r.departureLocation.name &&
        r.departureLocation.name.toLowerCase() === departure.toLowerCase() &&
        r.arrivalLocation &&
        r.arrivalLocation.name &&
        r.arrivalLocation.name.toLowerCase() === arrival.toLowerCase()
      );
      if (match && dbRouteIds.has(String(r._id))) {
        isFromDb = true;
      }
      return match;
    });

    // If route doesn't exist yet, dynamically synthesize it so ANY route search works!
    if (!route) {
      const depName = departure.charAt(0).toUpperCase() + departure.slice(1);
      const arrName = arrival.charAt(0).toUpperCase() + arrival.slice(1);

      const durationMap = {
        "bangalore-darjeeling": 24,
        "delhi-darjeeling": 22,
        "mumbai-darjeeling": 26,
        "bangalore-goa": 12,
        "delhi-goa": 28,
        "kolkata-bangalore": 24,
        "bangalore-mumbai": 16,
        "mumbai-bangalore": 16,
        "delhi-mumbai": 18,
        "mumbai-delhi": 18
      };
      const key = `${depName.toLowerCase()}-${arrName.toLowerCase()}`;
      const duration = durationMap[key] || 12;

      const syntheticId = `route-${key.replace(/[^a-z0-9-]/g, "")}`;
      route = {
        _id: syntheticId,
        departureLocation: {
          name: depName,
          subLocations: getSublocations(depName)
        },
        arrivalLocation: {
          name: arrName,
          subLocations: getSublocations(arrName)
        },
        duration: duration
      };
    }

    let buses = [];
    try {
      buses = await Bus.find().lean().exec();
    } catch (dbErr) {
      console.warn("Database bus query failed, using local data:", dbErr.message);
    }

    if (!buses || buses.length === 0) {
      buses = fallbackBuses;
    } else {
      fallbackBuses.forEach(fb => {
        const exists = buses.some(b => b._id.toString() === fb._id.toString());
        if (!exists) buses.push(fb);
      });
    }

    const routeIdStr = route._id ? route._id.toString() : "";
    let matchedbuses = buses.filter((bus) => {
      const busRouteStr = bus.routes ? bus.routes.toString() : "";
      return busRouteStr === routeIdStr;
    });

    // If no buses currently attached to this route, serve read-only fallback buses in memory without writing to DB
    if (!matchedbuses || matchedbuses.length === 0) {
      matchedbuses = [
        {
          _id: `${routeIdStr}-bus-1`,
          operatorName: "TedBus GreenLine Volvo Multi-Axle",
          busType: "Sleeper",
          departureTime: "18",
          rating: [4.8, 4.7, 4.9],
          totalSeats: 40,
          routes: routeIdStr,
          images: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600",
          liveTracking: 1,
          reschedulable: 1
        },
        {
          _id: `${routeIdStr}-bus-2`,
          operatorName: "Himalayan & InterCity Express",
          busType: "A/C Seater",
          departureTime: "08",
          rating: [4.5, 4.3, 4.6],
          totalSeats: 40,
          routes: routeIdStr,
          images: "https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=600",
          liveTracking: 1,
          reschedulable: 0
        },
        {
          _id: `${routeIdStr}-bus-3`,
          operatorName: "Royal Star Luxury Sleeper",
          busType: "Sleeper",
          departureTime: "21",
          rating: [4.7, 4.6, 4.8],
          totalSeats: 40,
          routes: routeIdStr,
          images: "https://images.unsplash.com/photo-1494515843206-f3117d3f51b7?w=600",
          liveTracking: 1,
          reschedulable: 1
        }
      ];
    }

    const matchedBusIds = matchedbuses.map(b => String(b._id || ""));
    let bookings = [];
    try {
      if (mongoose.connection.readyState === 1 && matchedBusIds.length > 0) {
        bookings = await Booking.find({
          busId: { $in: matchedBusIds },
          "departureDetails.date": date,
          status: { $ne: "cancelled" }
        }).lean().exec();
      }
    } catch (dbErr) {
      bookings = [];
    }

    const busidwithseatobj = {};

    for (let i = 0; i < matchedbuses.length; i++) {
      let currentbusseats = [];
      const busIdStr = (matchedbuses[i]._id || "").toString();

      const busbooking = bookings.filter((b) => {
        return (
          b.departureDetails &&
          b.departureDetails.date === date &&
          b.busId &&
          b.busId.toString() === busIdStr &&
          b.status !== "cancelled"
        );
      });

      busbooking.forEach((b) => {
        if (b.seats && Array.isArray(b.seats)) {
          currentbusseats = [...currentbusseats, ...b.seats];
        }
      });

      busidwithseatobj[busIdStr] = currentbusseats;
    }

    const dataSource = (mongoose.connection.readyState === 1 && isFromDb) ? "mongodb" : "fallback";
    res.setHeader("X-Data-Source", dataSource);
    res.send({
      dataSource: dataSource,
      isFallback: dataSource === "fallback",
      route: route,
      matchedBuses: matchedbuses,
      busidwithseatobj,
    });
  } catch (error) {
    console.error("Error in getoneroute:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Separate controlled initialization process to seed canonical routes and buses into MongoDB.
 * Protected by strict administrator-only authorization; never triggered during GET requests.
 */
exports.initializeRoutesAndBuses = async (req, res) => {
  try {
    const auth = await verifyAdminOnly(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "DatabaseUnavailable", message: "Database is offline." });
    }

    const fallbackRoutes = getFallbackRoutes();
    const fallbackBuses = getFallbackBuses();
    let seededRoutes = 0;
    let seededBuses = 0;

    for (const r of fallbackRoutes) {
      if (r._id && mongoose.Types.ObjectId.isValid(r._id)) {
        const exists = await Route.findById(r._id).lean().exec();
        if (!exists) {
          await Route.create({
            _id: new mongoose.Types.ObjectId(r._id),
            departureLocation: r.departureLocation,
            arrivalLocation: r.arrivalLocation,
            duration: r.duration
          });
          seededRoutes++;
        }
      }
    }

    for (const b of fallbackBuses) {
      if (b._id && mongoose.Types.ObjectId.isValid(b._id) && b.routes && mongoose.Types.ObjectId.isValid(b.routes)) {
        const exists = await Bus.findById(b._id).lean().exec();
        if (!exists) {
          await Bus.create({
            ...b,
            _id: new mongoose.Types.ObjectId(b._id),
            routes: new mongoose.Types.ObjectId(b.routes)
          });
          seededBuses++;
        }
      }
    }

    res.json({ success: true, seededRoutes, seededBuses });
  } catch (error) {
    console.error("Error in initializeRoutesAndBuses:", error);
    res.status(500).json({ error: "Failed to initialize routes and buses" });
  }
};

exports.getFallbackRoutes = getFallbackRoutes;
exports.getFallbackBuses = getFallbackBuses;

