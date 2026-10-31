require('dotenv').config();
const dns = require('dns');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Configuration & Environment Variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 5000;
const IS_VERCEL = Boolean(process.env.VERCEL);
const MONGODB_URI = process.env.MONGODB_URI;
const LOCAL_MONGODB_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://127.0.0.1:27017/tedbus';

// Apply custom public DNS resolvers ONLY in local development when not running on Vercel.
// Never override Vercel's native DNS resolver in serverless/production environments.
if (!IS_VERCEL && NODE_ENV !== 'production') {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
    dns.setDefaultResultOrder('ipv4first');
  } catch (dnsErr) {
    console.warn("Notice: could not set custom DNS servers:", dnsErr.message);
  }
}

const app = express();

// Configure CORS for authorized frontend origins
const configuredOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Customer-Id', 'X-Customer-Email', 'X-Moderator-Id', 'X-Admin-Id', 'X-Author-Id'],
  exposedHeaders: ['X-Data-Source', 'X-Environment']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Reusable global connection cache across Vercel serverless invocations
const mongoCache = global.__tedbusMongoCache || (global.__tedbusMongoCache = {
  conn: null,
  promise: null,
  source: 'none',
  lastError: null,
  hadConnectedOnce: false,
  listenersAttached: false
});

// Track active database source: 'atlas' | 'local' | 'none'
let activeDbSource = mongoCache.source || 'none';

// Helper to mask MongoDB URI credentials for safe logging
function maskMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return '';
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@.+)/i, '$1*****$3');
}

function hasValidAtlasUri(uri) {
  return Boolean(
    uri &&
    typeof uri === 'string' &&
    uri.trim() &&
    !uri.includes('<username>') &&
    !uri.includes('<password>')
  );
}

function attachConnectionListenersOnce() {
  if (mongoCache.listenersAttached) return;
  mongoCache.listenersAttached = true;

  mongoose.connection.on('connected', () => {
    mongoCache.hadConnectedOnce = true;
    const host = mongoose.connection.host || '';
    if (host === '127.0.0.1' || host === 'localhost') {
      activeDbSource = 'local';
      mongoCache.source = 'local';
    } else if (host) {
      activeDbSource = 'atlas';
      mongoCache.source = 'atlas';
    }
  });

  mongoose.connection.on('disconnected', () => {
    mongoCache.conn = null;
    mongoCache.promise = null;
    console.warn('[Database] Connection disconnected.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[Database] Connection re-established.');
  });

  mongoose.connection.on('error', (e) => {
    console.error('[Database] Runtime error:', maskMongoUri(e.message));
  });
}

attachConnectionListenersOnce();

/**
 * Establishes or reuses a cached MongoDB connection across serverless invocations.
 * Prevents duplicate concurrent connection attempts when multiple requests arrive during a cold start.
 */
async function ensureDatabaseConnection() {
  if (mongoose.connection.readyState === 1) {
    mongoCache.conn = mongoose.connection;
    return mongoose.connection;
  }

  if (mongoCache.promise) {
    return mongoCache.promise;
  }

  // Validate required production configuration without calling process.exit() at build time
  if ((NODE_ENV === 'production' || IS_VERCEL) && !hasValidAtlasUri(MONGODB_URI)) {
    const configErr = 'MONGODB_URI is required and must contain valid credentials in production.';
    mongoCache.lastError = configErr;
    console.error(`[Database] Configuration error: ${configErr}`);
    return null;
  }

  mongoCache.promise = (async () => {
    let connected = false;

    // 1. Try Primary MongoDB Atlas URI
    if (hasValidAtlasUri(MONGODB_URI)) {
      const maskedUri = maskMongoUri(MONGODB_URI);
      console.log(`[Database] Attempting connection to MongoDB Atlas at: ${maskedUri}`);
      try {
        await mongoose.connect(MONGODB_URI, {
          family: 4,
          serverSelectionTimeoutMS: 6000,
          maxPoolSize: 10,
        });
        await mongoose.connection.db.admin().ping();
        activeDbSource = 'atlas';
        mongoCache.source = 'atlas';
        mongoCache.conn = mongoose.connection;
        mongoCache.lastError = null;
        mongoCache.hadConnectedOnce = true;
        connected = true;
        const { host, name } = mongoose.connection;
        console.log(`[Database] Connected & verified with MongoDB Atlas cluster. Host: ${host} | Database: ${name}`);
      } catch (err) {
        const safeErrorMsg = err && err.message ? maskMongoUri(err.message) : 'Unknown connection error';
        mongoCache.lastError = safeErrorMsg;
        console.warn("==================================================================");
        console.warn("[Database] MongoDB Atlas connection failed:", safeErrorMsg);
        console.warn("Diagnostic Information:");
        console.warn(" - Check that your deployment/current IP address is whitelisted in MongoDB Atlas Network Access.");
        console.warn("   (Atlas Dashboard -> Security -> Network Access -> Add IP Address / 0.0.0.0/0)");
        console.warn(" - Ensure Atlas cluster is active and not paused.");
        console.warn("==================================================================");
      }
    }

    // 2. In local non-serverless development, if Atlas is unreachable, try local MongoDB fallback
    if (!connected && !IS_VERCEL && NODE_ENV !== 'production' && LOCAL_MONGODB_URI) {
      try {
        console.log(`[Database Development Mode] Attempting connection to local MongoDB: ${LOCAL_MONGODB_URI}`);
        await mongoose.connect(LOCAL_MONGODB_URI, {
          serverSelectionTimeoutMS: 3000,
        });
        await mongoose.connection.db.admin().ping();
        activeDbSource = 'local';
        mongoCache.source = 'local';
        mongoCache.conn = mongoose.connection;
        mongoCache.lastError = null;
        mongoCache.hadConnectedOnce = true;
        connected = true;
        const { host, name } = mongoose.connection;
        console.log(`[Database Development Mode] Connected & verified with local MongoDB. Host: ${host} | Database: ${name}`);
      } catch (localErr) {
        mongoCache.lastError = localErr.message;
        console.warn(`[Database Development Mode] Local MongoDB also unavailable: ${localErr.message}`);
        console.warn("[Database Development Mode] Server will start in read-only fallback mode. Database writes will return HTTP 503.");
        activeDbSource = 'none';
        mongoCache.source = 'none';
      }
    }

    if (!connected) {
      mongoCache.conn = null;
      mongoCache.promise = null;
      return null;
    }

    return mongoose.connection;
  })().catch((err) => {
    mongoCache.conn = null;
    mongoCache.promise = null;
    mongoCache.lastError = maskMongoUri(err.message || 'Database connection error');
    return null;
  });

  return mongoCache.promise;
}

// Global Response Header Middleware
app.use((req, res, next) => {
  res.setHeader('X-Environment', NODE_ENV);
  next();
});

// Root Liveness Endpoint
app.get('/', (req, res) => {
  res.send('Hello, TedBus API server is working');
});

// Health Check & System Status Endpoint (distinguishes application liveness from database readiness)
app.get('/health', async (req, res) => {
  if (mongoose.connection.readyState === 0 && (IS_VERCEL || !mongoCache.hadConnectedOnce)) {
    await ensureDatabaseConnection();
  }

  const readyState = mongoose.connection.readyState;
  const stateNames = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const isConnected = readyState === 1;

  res.status(isConnected ? 200 : 503).json({
    status: isConnected ? 'healthy' : 'degraded',
    liveness: 'alive',
    readiness: isConnected ? 'ready' : 'not_ready',
    environment: NODE_ENV,
    serverless: IS_VERCEL,
    database: {
      connected: isConnected,
      ready: isConnected,
      readyState: readyState,
      state: stateNames[readyState] || 'unknown',
      source: isConnected ? activeDbSource : 'none',
      host: isConnected ? mongoose.connection.host : null,
      name: isConnected ? mongoose.connection.name : null
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Serverless & Production Database Connection Middleware
// Ensures database-dependent API requests await a cached MongoDB connection before executing route controllers
app.use(async (req, res, next) => {
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  // If a local integration test intentionally disconnected an already-established connection
  // to test offline HTTP 503 controller handling, do not auto-reconnect over the test disconnect.
  if (!IS_VERCEL && NODE_ENV !== 'production' && mongoCache.hadConnectedOnce && mongoose.connection.readyState === 0) {
    return next();
  }

  await ensureDatabaseConnection();

  if (mongoose.connection.readyState !== 1 && (IS_VERCEL || NODE_ENV === 'production')) {
    return res.status(503).json({
      error: 'DatabaseUnavailable',
      message: 'Service temporarily unavailable because the database connection could not be established.'
    });
  }

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
const busroutes = require("./routes/bus");

app.use(bookingroute);
app.use(routesroute);
app.use(customerroutes);
app.use(communityroutes);
app.use(reviewroutes);
app.use(notificationroutes);
app.use(savedRouteroutes);
app.use(busroutes);

// Local Direct Execution Startup
async function startServer() {
  const conn = await ensureDatabaseConnection();

  if (!conn && NODE_ENV === 'production') {
    console.error("FATAL: Could not establish a persistent database connection in production mode.");
    process.exitCode = 1;
    return;
  }

  app.listen(PORT, () => {
    console.log(`[Server] TedBus API server is running on port ${PORT} [env=${NODE_ENV}, db=${activeDbSource}]`);
  });
}

if (require.main === module) {
  startServer();
}

app.ensureDatabaseConnection = ensureDatabaseConnection;
module.exports = app;
