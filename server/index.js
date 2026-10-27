require('dotenv').config();
const dns = require('dns');
const express = require('express');
const bodyparser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');

// Configure public DNS resolvers (Google & Cloudflare) for reliable MongoDB Atlas SRV resolution
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (dnsErr) {
  console.warn("Notice: could not set custom DNS servers:", dnsErr.message);
}

// Prefer IPv4 addresses when resolving hostnames.
dns.setDefaultResultOrder('ipv4first');

const app = express();

// Configuration & Environment Variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
const LOCAL_MONGODB_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/tedbus';

// Validate required production environment variables
if (NODE_ENV === 'production') {
  if (!MONGODB_URI || MONGODB_URI.includes('<username>') || MONGODB_URI.includes('<password>')) {
    console.error("FATAL: MONGODB_URI is required and must contain valid credentials in production.");
    process.exit(1);
  }
}

// Configure CORS for authorized frontend origins
const configuredOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:4200', 'http://127.0.0.1:4200'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow non-browser requests or matched origins
    if (!origin || configuredOrigins.indexOf(origin) !== -1 || (NODE_ENV !== 'production' && origin.includes('localhost'))) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  exposedHeaders: ['X-Data-Source', 'X-Environment']
}));

app.use(bodyparser.json());

// Track active database source: 'atlas' | 'local' | 'none'
let activeDbSource = 'none';

// Helper to mask MongoDB URI credentials for safe logging
function maskMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@.+)/i, '$1*****$3');
}

// Global Response Header Middleware
app.use((req, res, next) => {
  res.setHeader('X-Environment', NODE_ENV);
  next();
});

// Load routes
const customerroutes = require("./routes/customer");
const routesroute = require("./routes/route");
const bookingroute = require("./routes/booking");
const communityroutes = require("./routes/community");
const reviewroutes = require("./routes/review");
const notificationroutes = require("./routes/notification");
const savedRouteroutes = require("./routes/savedRoute");

app.use(bookingroute);
app.use(routesroute);
app.use(customerroutes);
app.use(communityroutes);
app.use(reviewroutes);
app.use(notificationroutes);
app.use(savedRouteroutes);

// Bus routes mount check
let isBusRouteRegistered = false;
if (app._router && app._router.stack) {
  isBusRouteRegistered = app._router.stack.some((layer) => {
    if (layer.route && layer.route.path === "/buses") return true;
    if (layer.name === "router" && layer.handle && layer.handle.stack) {
      return layer.handle.stack.some(
        (subLayer) => subLayer.route && subLayer.route.path === "/buses"
      );
    }
    return false;
  });
}

if (!isBusRouteRegistered) {
  try {
    const busroutes = require("./routes/bus");
    app.use(busroutes);
  } catch (err) {
    console.warn("Notice: bus routes module could not be loaded:", err.message);
  }
}

// Health Check & System Status Endpoint
app.get('/health', (req, res) => {
  const readyState = mongoose.connection.readyState;
  const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const isConnected = readyState === 1;

  res.status(isConnected ? 200 : 503).json({
    status: isConnected ? 'healthy' : 'degraded',
    environment: NODE_ENV,
    database: {
      connected: isConnected,
      readyState: readyState,
      state: stateNames[readyState] || 'unknown',
      source: activeDbSource,
      host: isConnected ? mongoose.connection.host : null,
      name: isConnected ? mongoose.connection.name : null
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.send('Hello, TedBus API server is working');
});

// Connect to MongoDB Atlas (with local development fallback)
async function startServer() {
  const maskedUri = maskMongoUri(MONGODB_URI);
  console.log(`[Database] Attempting connection to MongoDB Atlas at: ${maskedUri}`);

  mongoose.connection.on('disconnected', () => console.warn('[Database] Connection disconnected.'));
  mongoose.connection.on('reconnected', () => console.log('[Database] Connection re-established.'));
  mongoose.connection.on('error', (e) => console.error('[Database] Runtime error:', maskMongoUri(e.message)));

  let connected = false;

  // 1. Try Primary MongoDB Atlas URI
  if (MONGODB_URI && MONGODB_URI.trim()) {
    try {
      await mongoose.connect(MONGODB_URI, {
        family: 4,
        serverSelectionTimeoutMS: 6000,
      });
      await mongoose.connection.db.admin().ping();
      activeDbSource = 'atlas';
      connected = true;
      const { host, name } = mongoose.connection;
      console.log(`[Database] Connected & verified with MongoDB Atlas cluster. Host: ${host} | Database: ${name}`);
    } catch (err) {
      const safeErrorMsg = err && err.message ? maskMongoUri(err.message) : "Unknown connection error";
      console.warn("==================================================================");
      console.warn("[Database] MongoDB Atlas connection failed:", safeErrorMsg);
      console.warn("Diagnostic Information:");
      console.warn(" - Check that your current public IP address is whitelisted in MongoDB Atlas Network Access.");
      console.warn("   (Atlas Dashboard -> Security -> Network Access -> Add IP Address / 0.0.0.0/0)");
      console.warn(" - Ensure Atlas cluster is active and not paused.");
      console.warn("==================================================================");
    }
  }

  // 2. In development, if Atlas is unreachable, try local MongoDB fallback
  if (!connected && NODE_ENV !== 'production' && LOCAL_MONGODB_URI) {
    try {
      console.log(`[Database Development Mode] Attempting connection to local MongoDB: ${LOCAL_MONGODB_URI}`);
      await mongoose.connect(LOCAL_MONGODB_URI, {
        serverSelectionTimeoutMS: 3000,
      });
      await mongoose.connection.db.admin().ping();
      activeDbSource = 'local';
      connected = true;
      const { host, name } = mongoose.connection;
      console.log(`[Database Development Mode] Connected & verified with local MongoDB. Host: ${host} | Database: ${name}`);
    } catch (localErr) {
      console.warn(`[Database Development Mode] Local MongoDB also unavailable: ${localErr.message}`);
      console.warn("[Database Development Mode] Server will start in read-only fallback mode. Database writes will return HTTP 503.");
      activeDbSource = 'none';
    }
  }

  // 3. In production, require persistent database
  if (!connected && NODE_ENV === 'production') {
    console.error("FATAL: Could not establish a persistent database connection in production mode.");
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[Server] TedBus API server is running on port ${PORT} [env=${NODE_ENV}, db=${activeDbSource}]`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
