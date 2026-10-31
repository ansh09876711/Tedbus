const crypto = require("crypto");
const mongoose = require("mongoose");
const Customer = require("../models/customer");

const DEFAULT_ISSUER = "tedbus-api";
const DEFAULT_AUDIENCE = "tedbus-client";
const DEFAULT_EXPIRES_IN_SECONDS = 86400; // 24 hours

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== "string" || secret.trim().length < 16) {
    throw new Error("JWT_SECRET environment variable is missing or too short.");
  }
  return secret.trim();
}

function getJwtIssuer() {
  return (process.env.JWT_ISSUER || DEFAULT_ISSUER).trim();
}

function getJwtAudience() {
  return (process.env.JWT_AUDIENCE || DEFAULT_AUDIENCE).trim();
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecodeToBuffer(str) {
  let base64 = String(str).replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

/**
 * Signs an RFC 7519 HS256 JWT with sub, email, role, iat, exp, iss, and aud claims.
 */
function signJwtToken(customer, options = {}) {
  const secret = getJwtSecret();
  const nowSec = Math.floor(Date.now() / 1000);
  const expiresIn =
    options.expiresInSeconds !== undefined
      ? Number(options.expiresInSeconds)
      : Number(process.env.JWT_EXPIRES_IN_SECONDS || DEFAULT_EXPIRES_IN_SECONDS);

  const header = {
    alg: "HS256",
    typ: "JWT"
  };

  const payload = {
    sub: String(customer._id || customer.id),
    email: String(customer.email || "").trim().toLowerCase(),
    role: customer.role || "user",
    iat: options.iat !== undefined ? Number(options.iat) : nowSec,
    exp: options.exp !== undefined ? Number(options.exp) : nowSec + expiresIn,
    iss: options.iss !== undefined ? options.iss : getJwtIssuer(),
    aud: options.aud !== undefined ? options.aud : getJwtAudience()
  };

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest();
  const signatureB64 = base64UrlEncode(signature);

  return `${signingInput}.${signatureB64}`;
}

/**
 * Verifies an RFC 7519 HS256 JWT including signature, expiration (exp), issuer (iss), and audience (aud).
 */
function verifyJwtToken(token) {
  if (!token || typeof token !== "string") {
    return {
      valid: false,
      status: 401,
      error: "AuthenticationRequired",
      message: "A valid Bearer authentication token is required."
    };
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (err) {
    return {
      valid: false,
      status: 500,
      error: "ServerAuthConfigError",
      message: "Authentication service is misconfigured."
    };
  }

  const parts = token.trim().split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    return {
      valid: false,
      status: 401,
      error: "MalformedToken",
      message: "Malformed JWT token structure."
    };
  }

  const [headerB64, payloadB64, sigB64] = parts;

  let header;
  try {
    header = JSON.parse(base64UrlDecodeToBuffer(headerB64).toString("utf8"));
  } catch (e) {
    return {
      valid: false,
      status: 401,
      error: "MalformedTokenHeader",
      message: "Invalid JWT header encoding."
    };
  }

  if (!header || header.alg !== "HS256" || header.typ !== "JWT") {
    return {
      valid: false,
      status: 401,
      error: "UnsupportedTokenAlgorithm",
      message: "Only HS256 signed JWT tokens are accepted."
    };
  }

  // Constant-time HMAC-SHA256 signature verification
  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(signingInput)
    .digest();

  let actualSig;
  try {
    // Reject non-canonical base64url strings if re-encoding differs
    actualSig = base64UrlDecodeToBuffer(sigB64);
    if (base64UrlEncode(actualSig) !== sigB64) {
      return {
        valid: false,
        status: 401,
        error: "InvalidTokenSignature",
        message: "Token signature encoding is invalid or tampered."
      };
    }
  } catch (e) {
    return {
      valid: false,
      status: 401,
      error: "InvalidTokenSignature",
      message: "Invalid token signature."
    };
  }

  if (
    actualSig.length !== expectedSig.length ||
    !crypto.timingSafeEqual(actualSig, expectedSig)
  ) {
    return {
      valid: false,
      status: 401,
      error: "InvalidTokenSignature",
      message: "Token signature verification failed."
    };
  }

  let payload;
  try {
    if (base64UrlEncode(base64UrlDecodeToBuffer(payloadB64)) !== payloadB64) {
      return {
        valid: false,
        status: 401,
        error: "TamperedTokenPayload",
        message: "Token payload encoding is invalid or tampered."
      };
    }
    payload = JSON.parse(base64UrlDecodeToBuffer(payloadB64).toString("utf8"));
  } catch (e) {
    return {
      valid: false,
      status: 401,
      error: "MalformedTokenPayload",
      message: "Invalid JWT payload."
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload.exp !== "number" || nowSec >= payload.exp) {
    return {
      valid: false,
      status: 401,
      error: "TokenExpired",
      message: "Authentication token has expired. Please sign in again."
    };
  }

  if (payload.iss !== getJwtIssuer()) {
    return {
      valid: false,
      status: 401,
      error: "InvalidTokenIssuer",
      message: "Token issuer validation failed."
    };
  }

  if (payload.aud !== getJwtAudience()) {
    return {
      valid: false,
      status: 401,
      error: "InvalidTokenAudience",
      message: "Token audience validation failed."
    };
  }

  if (!payload.sub || !/^[0-9a-fA-F]{24}$/.test(String(payload.sub))) {
    return {
      valid: false,
      status: 401,
      error: "InvalidTokenSubject",
      message: "Token subject is not a valid customer identifier."
    };
  }

  return {
    valid: true,
    payload
  };
}

/**
 * Hashes a plaintext password using scrypt with a random 16-byte salt.
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return { passwordSalt: salt, passwordHash: derivedKey };
}

/**
 * Verifies a plaintext password against a stored scrypt hash and salt in constant time.
 */
function verifyPassword(password, passwordSalt, passwordHash) {
  if (!password || !passwordSalt || !passwordHash) return false;
  try {
    const derivedBuf = crypto.scryptSync(String(password), String(passwordSalt), 64);
    const storedBuf = Buffer.from(String(passwordHash), "hex");
    if (derivedBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, storedBuf);
  } catch (e) {
    return false;
  }
}

/**
 * Extracts the Bearer token from the Authorization header.
 */
function extractBearerToken(req) {
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== "string") {
    return null;
  }
  const trimmed = authHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = trimmed.slice(7).trim();
  return token || null;
}

/**
 * Verifies that the request carries a valid signed Bearer JWT and that the customer account
 * still exists in MongoDB. Never trusts client-supplied headers or body fields for identity.
 */
async function verifyCustomerAuth(req) {
  if (mongoose.connection.readyState !== 1) {
    return {
      authorized: false,
      status: 503,
      error: "DatabaseUnavailable",
      message: "Authentication check unavailable because the database is offline."
    };
  }

  const token = extractBearerToken(req);
  if (!token) {
    return {
      authorized: false,
      status: 401,
      error: "AuthenticationRequired",
      message: "Bearer authentication token is required."
    };
  }

  const verification = verifyJwtToken(token);
  if (!verification.valid) {
    return {
      authorized: false,
      status: verification.status,
      error: verification.error,
      message: verification.message
    };
  }

  const customer = await Customer.findById(verification.payload.sub).lean().exec();
  if (!customer) {
    return {
      authorized: false,
      status: 401,
      error: "AccountNotFound",
      message: "Authenticated customer account was not found or has been deleted."
    };
  }

  req.authUser = customer;
  req.tokenPayload = verification.payload;

  return {
    authorized: true,
    customer,
    tokenPayload: verification.payload
  };
}

/**
 * Express middleware that requires a valid authenticated customer Bearer token.
 */
async function requireCustomerAuth(req, res, next) {
  try {
    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({
        error: auth.error,
        message: auth.message
      });
    }
    next();
  } catch (err) {
    console.error("[Auth] Customer authentication error:", err.message);
    return res.status(500).json({
      error: "AuthenticationError",
      message: "Failed to verify customer authentication."
    });
  }
}

/**
 * Verifies that the request has a valid signed Bearer JWT AND that the user's current
 * MongoDB account is verified and holds either 'moderator' or 'admin' role.
 */
async function verifyModeratorOrAdmin(req) {
  const auth = await verifyCustomerAuth(req);
  if (!auth.authorized) {
    return auth;
  }

  const customer = auth.customer;

  if (customer.isVerified === false) {
    return {
      authorized: false,
      status: 403,
      error: "UnverifiedModerator",
      message: "Unverified accounts cannot perform moderation actions."
    };
  }

  if (!["moderator", "admin"].includes(customer.role)) {
    return {
      authorized: false,
      status: 403,
      error: "InsufficientPrivileges",
      message: "Access denied. Only verified moderator or admin accounts may perform this action."
    };
  }

  req.moderator = customer;
  return {
    authorized: true,
    moderator: customer,
    customer
  };
}

/**
 * Verifies that the request has a valid signed Bearer JWT AND that the user's current
 * MongoDB account is verified and holds the 'admin' role exclusively.
 * Moderator accounts are explicitly rejected with HTTP 403.
 */
async function verifyAdminOnly(req) {
  const auth = await verifyCustomerAuth(req);
  if (!auth.authorized) {
    return auth;
  }

  const customer = auth.customer;

  if (customer.isVerified === false) {
    return {
      authorized: false,
      status: 403,
      error: "UnverifiedAdmin",
      message: "Unverified accounts cannot perform administrative actions."
    };
  }

  if (customer.role !== "admin") {
    return {
      authorized: false,
      status: 403,
      error: "AdminPrivilegesRequired",
      message: "Access denied. Only administrator accounts may perform this operation."
    };
  }

  req.admin = customer;
  req.moderator = customer;
  return {
    authorized: true,
    admin: customer,
    moderator: customer,
    customer
  };
}

/**
 * Express middleware that enforces Moderator or Admin role authorization.
 */
async function requireModeratorOrAdmin(req, res, next) {
  try {
    const auth = await verifyModeratorOrAdmin(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({
        error: auth.error,
        message: auth.message
      });
    }
    req.moderator = auth.moderator;
    next();
  } catch (err) {
    console.error("[Auth] Moderator/Admin verification error:", err.message);
    return res.status(500).json({
      error: "AuthorizationError",
      message: "Failed to verify moderator/admin authorization."
    });
  }
}

/**
 * Express middleware that enforces Admin-only role authorization.
 */
async function requireAdminOnly(req, res, next) {
  try {
    const auth = await verifyAdminOnly(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({
        error: auth.error,
        message: auth.message
      });
    }
    req.admin = auth.admin;
    next();
  } catch (err) {
    console.error("[Auth] Admin verification error:", err.message);
    return res.status(500).json({
      error: "AuthorizationError",
      message: "Failed to verify administrator authorization."
    });
  }
}

module.exports = {
  signJwtToken,
  verifyJwtToken,
  hashPassword,
  verifyPassword,
  extractBearerToken,
  verifyCustomerAuth,
  requireCustomerAuth,
  verifyModeratorOrAdmin,
  verifyAdminOnly,
  requireModeratorOrAdmin,
  requireAdminOnly
};
