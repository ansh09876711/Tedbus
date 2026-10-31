const https = require("https");
const crypto = require("crypto");
const url = require("url");

/**
 * Checks whether VAPID Web Push keys are configured in environment variables.
 */
function isVapidConfigured() {
  const pub = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const priv = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const subj = (process.env.VAPID_SUBJECT || "").trim();
  if (!pub || !priv || !subj) return false;
  if (pub.includes("<") || priv.includes("<") || pub === "replace-with-vapid-public-key") {
    return false;
  }
  return true;
}

function getVapidPublicKey() {
  return isVapidConfigured() ? process.env.VAPID_PUBLIC_KEY.trim() : null;
}

function base64UrlEncode(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Dispatches a RFC 8292 VAPID Web Push notification to a browser push endpoint.
 * Never claims successful delivery if VAPID keys or push subscription endpoint are missing.
 */
function sendWebPushNotification(subscription, payloadObj) {
  return new Promise((resolve) => {
    if (!isVapidConfigured()) {
      return resolve({
        delivered: false,
        error: "VAPID WebPush keys are not configured (set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT)."
      });
    }

    if (!subscription || !subscription.endpoint) {
      return resolve({
        delivered: false,
        error: "Customer has no active Service Worker WebPush subscription endpoint."
      });
    }

    try {
      const parsed = new url.URL(subscription.endpoint);
      const origin = `${parsed.protocol}//${parsed.host}`;
      const nowSec = Math.floor(Date.now() / 1000);

      const jwtHeader = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
      const jwtPayload = base64UrlEncode(
        JSON.stringify({
          aud: origin,
          exp: nowSec + 12 * 3600,
          sub: process.env.VAPID_SUBJECT.trim()
        })
      );

      // Sign VAPID JWT if private key is PEM/DER compatible, otherwise fail honestly
      let vapidAuthHeader = "";
      try {
        const sign = crypto.createSign("SHA256");
        sign.update(`${jwtHeader}.${jwtPayload}`);
        sign.end();
        const sig = sign.sign({
          key: process.env.VAPID_PRIVATE_KEY.trim(),
          dsaEncoding: "ieee-p1363"
        });
        const jwt = `${jwtHeader}.${jwtPayload}.${base64UrlEncode(sig)}`;
        vapidAuthHeader = `vapid t=${jwt}, k=${process.env.VAPID_PUBLIC_KEY.trim()}`;
      } catch (sigErr) {
        return resolve({
          delivered: false,
          error: `VAPID ES256 key signing failed: ${sigErr.message}`
        });
      }

      const req = https.request(
        subscription.endpoint,
        {
          method: "POST",
          timeout: 8000,
          headers: {
            TTL: "86400",
            Authorization: vapidAuthHeader,
            "Content-Length": "0"
          }
        },
        (res) => {
          res.resume();
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ delivered: true, statusCode: res.statusCode });
          } else {
            resolve({
              delivered: false,
              error: `Push service responded with HTTP ${res.statusCode}`
            });
          }
        }
      );

      req.on("timeout", () => {
        req.destroy();
        resolve({ delivered: false, error: "WebPush request timed out." });
      });
      req.on("error", (err) => {
        resolve({ delivered: false, error: `WebPush request failed: ${err.message}` });
      });
      req.end();
    } catch (err) {
      resolve({ delivered: false, error: `Invalid push subscription endpoint: ${err.message}` });
    }
  });
}

module.exports = {
  isVapidConfigured,
  getVapidPublicKey,
  sendWebPushNotification
};

