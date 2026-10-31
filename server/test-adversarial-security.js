require("dotenv").config({ path: __dirname + "/.env" });
const crypto = require("crypto");
const http = require("http");
const mongoose = require("mongoose");

const app = require("./index");
const Booking = require("./models/booking");
const Customer = require("./models/customer");
const Route = require("./models/route");
const Bus = require("./models/bus");
const { CommunityPost, CommunityComment, ContentReport } = require("./models/community");
const { JourneyReview, ReviewReport } = require("./models/review");
const { signJwtToken } = require("./middleware/auth");

const TEST_PORT = 5059;
const results = [];

function record(id, name, passed, detail) {
  const status = passed ? "PASS" : "FAIL";
  results.push({ id, name, status, detail });
  console.log(`[${status}] ${id}: ${name} — ${detail}`);
}

function makeRequest(method, path, headers = {}, bodyObj = null) {
  return new Promise((resolve, reject) => {
    const payload = bodyObj ? JSON.stringify(bodyObj) : null;
    const reqHeaders = {
      Origin: "http://localhost:4200",
      ...headers
    };
    if (payload) {
      reqHeaders["Content-Type"] = "application/json";
      reqHeaders["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: TEST_PORT,
        path,
        method,
        headers: reqHeaders
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {}
          resolve({ statusCode: res.statusCode, headers: res.headers, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function runAdversarialSuite() {
  console.log("=================================================================");
  console.log("     TEDBUS PHASE 2.2 ADVERSARIAL SECURITY VERIFICATION SUITE    ");
  console.log("=================================================================\n");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  await mongoose.connect(process.env.LOCAL_MONGODB_URI || "mongodb://127.0.0.1:27017/tedbus");

  const createdCustomerIds = [];
  const createdBookingIds = [];

  try {
    // Setup test actors via real API registration and controlled role fixtures
    const regARes = await makeRequest("POST", "/customer", {}, {
      name: "Alice Traveler",
      email: `alice.sec.${Date.now()}@tedbus.com`,
      password: "AliceStrongPassword!123"
    });
    const customerA = regARes.body;
    const tokenA = customerA.authToken;
    if (customerA?._id) createdCustomerIds.push(customerA._id);

    const regBRes = await makeRequest("POST", "/customer", {}, {
      name: "Bob Traveler",
      email: `bob.sec.${Date.now()}@tedbus.com`,
      password: "BobStrongPassword!456"
    });
    const customerB = regBRes.body;
    const tokenB = customerB.authToken;
    if (customerB?._id) createdCustomerIds.push(customerB._id);

    const moderatorUser = await Customer.create({
      name: "Verified Moderator",
      email: `mod.sec.${Date.now()}@tedbus.com`,
      role: "moderator",
      isVerified: true
    });
    createdCustomerIds.push(moderatorUser._id);
    const tokenModerator = signJwtToken(moderatorUser);

    const unverifiedMod = await Customer.create({
      name: "Unverified Moderator",
      email: `unvmod.sec.${Date.now()}@tedbus.com`,
      role: "moderator",
      isVerified: false
    });
    createdCustomerIds.push(unverifiedMod._id);
    const tokenUnverifiedMod = signJwtToken(unverifiedMod);

    const adminUser = await Customer.create({
      name: "Verified Admin",
      email: `admin.sec.${Date.now()}@tedbus.com`,
      role: "admin",
      isVerified: true
    });
    createdCustomerIds.push(adminUser._id);
    const tokenAdmin = signJwtToken(adminUser);

    // Create bookings for Customer A and Customer B (far future so normal cancellation works when authorized)
    const bookingA = await Booking.create({
      customerId: customerA._id.toString(),
      busId: "bus-sec-test-1",
      operatorName: "Security Express",
      seats: [1],
      fare: 650,
      status: "confirmed",
      bookingDate: "2027-06-15",
      email: customerA.email,
      phoneNumber: "9111111111",
      departureDetails: { city: "Delhi", time: 10, date: "2027-06-15" },
      arrivalDetails: { city: "Jaipur", time: 15, date: "2027-06-15" }
    });
    createdBookingIds.push(bookingA._id);

    const bookingB = await Booking.create({
      customerId: customerB._id.toString(),
      busId: "bus-sec-test-1",
      operatorName: "Security Express",
      seats: [2],
      fare: 650,
      status: "confirmed",
      bookingDate: "2027-06-15",
      email: customerB.email,
      phoneNumber: "9222222222",
      departureDetails: { city: "Delhi", time: 10, date: "2027-06-15" },
      arrivalDetails: { city: "Jaipur", time: 15, date: "2027-06-15" }
    });
    createdBookingIds.push(bookingB._id);

    // -------------------------------------------------------------------------
    // ADV-01: Missing Bearer token
    // -------------------------------------------------------------------------
    const noTokenList = await makeRequest("GET", `/booking?customerId=${customerA._id}`, {
      "X-Customer-Id": customerA._id.toString(),
      "X-Customer-Email": customerA.email
    });
    const noTokenSingle = await makeRequest("GET", `/booking/${customerA._id}`, {
      "X-Customer-Id": customerA._id.toString()
    });
    const noTokenCancel = await makeRequest("PUT", `/booking/${bookingA._id}/cancel`, {
      "X-Customer-Id": customerA._id.toString()
    }, { customerId: customerA._id.toString(), email: customerA.email });

    record(
      "ADV-01",
      "Missing Bearer token rejected across booking endpoints",
      noTokenList.statusCode === 401 && noTokenSingle.statusCode === 401 && noTokenCancel.statusCode === 401,
      `GET /booking -> ${noTokenList.statusCode}, GET /booking/:id -> ${noTokenSingle.statusCode}, PUT /booking/:id/cancel -> ${noTokenCancel.statusCode} (even when X-Customer-Id/email supplied)`
    );

    // -------------------------------------------------------------------------
    // ADV-02: Invalid signature
    // -------------------------------------------------------------------------
    const fakeHeader = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const fakePayload = base64UrlEncode(
      JSON.stringify({
        sub: customerB._id.toString(),
        email: customerB.email,
        role: "user",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "tedbus-api",
        aud: "tedbus-client"
      })
    );
    const wrongSig = base64UrlEncode(
      crypto.createHmac("sha256", "wrong-attacker-signing-secret-key-99999").update(`${fakeHeader}.${fakePayload}`).digest()
    );
    const wrongSigToken = `${fakeHeader}.${fakePayload}.${wrongSig}`;

    const badSigRes = await makeRequest("GET", "/booking", {
      Authorization: `Bearer ${wrongSigToken}`
    });
    record(
      "ADV-02",
      "Invalid JWT signature rejected",
      badSigRes.statusCode === 401 && badSigRes.body?.error === "InvalidTokenSignature",
      `GET /booking with wrong signing key -> HTTP ${badSigRes.statusCode} (${badSigRes.body?.error})`
    );

    // -------------------------------------------------------------------------
    // ADV-03: Tampered token
    // -------------------------------------------------------------------------
    const tokenParts = tokenA.split(".");
    const tamperedPayloadB64 = base64UrlEncode(
      JSON.stringify({
        sub: customerB._id.toString(),
        email: customerB.email,
        role: "admin",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        iss: "tedbus-api",
        aud: "tedbus-client"
      })
    );
    const tamperedToken = `${tokenParts[0]}.${tamperedPayloadB64}.${tokenParts[2]}`;

    const tamperedRes = await makeRequest("GET", "/booking", {
      Authorization: `Bearer ${tamperedToken}`
    });
    record(
      "ADV-03",
      "Tampered JWT payload rejected",
      tamperedRes.statusCode === 401 && tamperedRes.body?.error === "InvalidTokenSignature",
      `GET /booking with modified payload claims -> HTTP ${tamperedRes.statusCode} (${tamperedRes.body?.error})`
    );

    // -------------------------------------------------------------------------
    // ADV-04: Expired token
    // -------------------------------------------------------------------------
    const expiredToken = signJwtToken(customerA, {
      iat: Math.floor(Date.now() / 1000) - 7200,
      exp: Math.floor(Date.now() / 1000) - 3600
    });
    const expiredRes = await makeRequest("GET", "/booking", {
      Authorization: `Bearer ${expiredToken}`
    });
    record(
      "ADV-04",
      "Expired JWT token rejected",
      expiredRes.statusCode === 401 && expiredRes.body?.error === "TokenExpired",
      `GET /booking with expired token -> HTTP ${expiredRes.statusCode} (${expiredRes.body?.error})`
    );

    // -------------------------------------------------------------------------
    // ADV-05: Deleted customer account
    // -------------------------------------------------------------------------
    const ephemeralCustomer = await Customer.create({
      name: "Deleted User",
      email: `deleted.sec.${Date.now()}@tedbus.com`,
      role: "user",
      isVerified: true
    });
    const deletedUserToken = signJwtToken(ephemeralCustomer);
    await Customer.findByIdAndDelete(ephemeralCustomer._id);

    const deletedUserRes = await makeRequest("GET", "/booking", {
      Authorization: `Bearer ${deletedUserToken}`
    });
    record(
      "ADV-05",
      "Deleted customer account token rejected",
      deletedUserRes.statusCode === 401 && deletedUserRes.body?.error === "AccountNotFound",
      `GET /booking with token of deleted customer -> HTTP ${deletedUserRes.statusCode} (${deletedUserRes.body?.error})`
    );

    // -------------------------------------------------------------------------
    // ADV-06: Customer A accessing Customer B's bookings
    // -------------------------------------------------------------------------
    const crossQueryIdRes = await makeRequest("GET", `/booking?customerId=${customerB._id}`, {
      Authorization: `Bearer ${tokenA}`
    });
    const crossQueryEmailRes = await makeRequest("GET", `/booking?email=${encodeURIComponent(customerB.email)}`, {
      Authorization: `Bearer ${tokenA}`
    });
    const crossParamCustIdRes = await makeRequest("GET", `/booking/${customerB._id}`, {
      Authorization: `Bearer ${tokenA}`
    });
    const crossParamBookingIdRes = await makeRequest("GET", `/booking/${bookingB._id}`, {
      Authorization: `Bearer ${tokenA}`
    });
    const ownBookingsRes = await makeRequest("GET", "/booking", {
      Authorization: `Bearer ${tokenA}`
    });
    const onlySeesOwn =
      ownBookingsRes.statusCode === 200 &&
      Array.isArray(ownBookingsRes.body) &&
      ownBookingsRes.body.length === 1 &&
      String(ownBookingsRes.body[0]._id) === String(bookingA._id);

    record(
      "ADV-06",
      "Customer A blocked from accessing Customer B's bookings",
      crossQueryIdRes.statusCode === 403 &&
        crossQueryEmailRes.statusCode === 403 &&
        crossParamCustIdRes.statusCode === 403 &&
        crossParamBookingIdRes.statusCode === 403 &&
        onlySeesOwn,
      `Query id->${crossQueryIdRes.statusCode}, Query email->${crossQueryEmailRes.statusCode}, Param custId->${crossParamCustIdRes.statusCode}, Param bookingId->${crossParamBookingIdRes.statusCode}; Own GET /booking returned only Customer A's booking`
    );

    // -------------------------------------------------------------------------
    // ADV-07: Customer A cancelling Customer B's booking
    // -------------------------------------------------------------------------
    const crossCancelRes = await makeRequest(
      "PUT",
      `/booking/${bookingB._id}/cancel`,
      { Authorization: `Bearer ${tokenA}` },
      {}
    );
    const bookingBAfterCrossAttempt = await Booking.findById(bookingB._id).lean();
    record(
      "ADV-07",
      "Customer A blocked from cancelling Customer B's booking",
      crossCancelRes.statusCode === 403 && bookingBAfterCrossAttempt.status === "confirmed",
      `PUT /booking/${bookingB._id}/cancel with Customer A token -> HTTP ${crossCancelRes.statusCode} (${crossCancelRes.body?.error}); DB status remains '${bookingBAfterCrossAttempt.status}'`
    );

    // -------------------------------------------------------------------------
    // ADV-08: Forged customerId/email in request body & passwordless login attempt
    // -------------------------------------------------------------------------
    const passwordlessLoginAttempt = await makeRequest("POST", "/customer", {}, {
      name: customerB.name,
      email: customerB.email
    });
    const wrongPasswordLoginAttempt = await makeRequest("POST", "/customer", {}, {
      name: customerB.name,
      email: customerB.email,
      password: "WrongPasswordAttempt999"
    });
    const forgedCancelBodyRes = await makeRequest(
      "PUT",
      `/booking/${bookingB._id}/cancel`,
      { Authorization: `Bearer ${tokenA}` },
      { customerId: customerB._id.toString(), email: customerB.email }
    );
    const forgedCreateBookingBodyRes = await makeRequest(
      "POST",
      "/booking",
      { Authorization: `Bearer ${tokenA}` },
      {
        customerId: customerB._id.toString(),
        email: customerB.email,
        busId: "bus-sec-test-1",
        seats: [19],
        fare: 500,
        date: "2027-06-15"
      }
    );

    record(
      "ADV-08",
      "Forged customerId/email in request body & unverified email login rejected",
      passwordlessLoginAttempt.statusCode === 401 &&
        wrongPasswordLoginAttempt.statusCode === 401 &&
        forgedCancelBodyRes.statusCode === 403 &&
        forgedCreateBookingBodyRes.statusCode === 403,
      `Passwordless POST /customer -> ${passwordlessLoginAttempt.statusCode}, Wrong password -> ${wrongPasswordLoginAttempt.statusCode}, Forged cancel body -> ${forgedCancelBodyRes.statusCode}, Forged create booking body -> ${forgedCreateBookingBodyRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // ADV-09: Forged X-Moderator-Id header
    // -------------------------------------------------------------------------
    const forgedModHeaderUnauth = await makeRequest("GET", "/community/reports", {
      "X-Moderator-Id": moderatorUser._id.toString(),
      "X-Admin-Id": adminUser._id.toString()
    });
    const forgedModHeaderWithUserToken = await makeRequest("GET", "/community/reports", {
      Authorization: `Bearer ${tokenA}`,
      "X-Moderator-Id": moderatorUser._id.toString(),
      "X-Admin-Id": adminUser._id.toString()
    });
    record(
      "ADV-09",
      "Forged X-Moderator-Id and X-Admin-Id headers rejected",
      forgedModHeaderUnauth.statusCode === 401 && forgedModHeaderWithUserToken.statusCode === 403,
      `Unauthenticated with X-Moderator-Id -> ${forgedModHeaderUnauth.statusCode}; Normal user token with X-Moderator-Id -> ${forgedModHeaderWithUserToken.statusCode}`
    );

    // -------------------------------------------------------------------------
    // ADV-10: Forged X-Role header and body role escalation
    // -------------------------------------------------------------------------
    const forgedRoleModRes = await makeRequest(
      "POST",
      `/community/posts/${new mongoose.Types.ObjectId()}/moderate`,
      {
        Authorization: `Bearer ${tokenA}`,
        "X-Role": "admin"
      },
      {
        action: "hide",
        reason: "Trying forged X-Role header",
        role: "admin"
      }
    );
    const regEscalationRes = await makeRequest("POST", "/customer", {}, {
      name: "Escalation Attacker",
      email: `escalate.sec.${Date.now()}@tedbus.com`,
      password: "EscalatePassword123!",
      role: "admin"
    });
    if (regEscalationRes.body?._id) createdCustomerIds.push(regEscalationRes.body._id);
    const dbEscalatedUser = await Customer.findById(regEscalationRes.body?._id).lean();

    record(
      "ADV-10",
      "Forged X-Role header and body role='admin' escalation rejected",
      forgedRoleModRes.statusCode === 403 && dbEscalatedUser?.role === "user",
      `Moderation with X-Role: admin -> HTTP ${forgedRoleModRes.statusCode}; Registration with role='admin' persisted as role='${dbEscalatedUser?.role}'`
    );

    // -------------------------------------------------------------------------
    // ADV-11: Moderator attempting admin-only operations
    // -------------------------------------------------------------------------
    const modCommunityQueueRes = await makeRequest("GET", "/community/reports", {
      Authorization: `Bearer ${tokenModerator}`
    });
    const modRouteInitRes = await makeRequest("POST", "/routes/initialize", {
      Authorization: `Bearer ${tokenModerator}`
    });
    const modNotifRetryRes = await makeRequest("POST", "/notifications/retry-failed", {
      Authorization: `Bearer ${tokenModerator}`
    });
    const modNotifTriggerRes = await makeRequest(
      "POST",
      "/notifications/trigger",
      { Authorization: `Bearer ${tokenModerator}` },
      {
        customerId: customerA._id.toString(),
        type: "system",
        title: "Mod Trigger Attempt",
        message: "Should be blocked"
      }
    );
    const modNotifHistoryRes = await makeRequest("GET", "/notifications/delivery-history", {
      Authorization: `Bearer ${tokenModerator}`
    });

    record(
      "ADV-11",
      "Moderator blocked from all admin-only operations while retaining moderation access",
      modCommunityQueueRes.statusCode === 200 &&
        modRouteInitRes.statusCode === 403 &&
        modNotifRetryRes.statusCode === 403 &&
        modNotifTriggerRes.statusCode === 403 &&
        modNotifHistoryRes.statusCode === 403,
      `Moderator GET /community/reports -> ${modCommunityQueueRes.statusCode}; POST /routes/initialize -> ${modRouteInitRes.statusCode}, POST /notifications/retry-failed -> ${modNotifRetryRes.statusCode}, POST /notifications/trigger -> ${modNotifTriggerRes.statusCode}, GET /notifications/delivery-history -> ${modNotifHistoryRes.statusCode}`
    );

    // -------------------------------------------------------------------------
    // ADV-12: Unverified moderator access
    // -------------------------------------------------------------------------
    const unvModQueueRes = await makeRequest("GET", "/community/reports", {
      Authorization: `Bearer ${tokenUnverifiedMod}`
    });
    const unvModReviewRes = await makeRequest(
      "POST",
      `/reviews/${new mongoose.Types.ObjectId()}/moderate`,
      { Authorization: `Bearer ${tokenUnverifiedMod}` },
      { action: "hide" }
    );
    record(
      "ADV-12",
      "Unverified moderator account blocked from moderation endpoints",
      unvModQueueRes.statusCode === 403 &&
        unvModQueueRes.body?.error === "UnverifiedModerator" &&
        unvModReviewRes.statusCode === 403 &&
        unvModReviewRes.body?.error === "UnverifiedModerator",
      `GET /community/reports -> ${unvModQueueRes.statusCode} (${unvModQueueRes.body?.error}); POST /reviews/:id/moderate -> ${unvModReviewRes.statusCode} (${unvModReviewRes.body?.error})`
    );

    // -------------------------------------------------------------------------
    // ADV-13: Unauthorized route initialization & admin idempotency
    // -------------------------------------------------------------------------
    const unauthInitRes = await makeRequest("POST", "/routes/initialize");
    const userInitRes = await makeRequest("POST", "/routes/initialize", {
      Authorization: `Bearer ${tokenA}`
    });
    const adminInitRes1 = await makeRequest("POST", "/routes/initialize", {
      Authorization: `Bearer ${tokenAdmin}`
    });
    const routesCountAfter1 = await Route.countDocuments();
    const busesCountAfter1 = await Bus.countDocuments();
    const adminInitRes2 = await makeRequest("POST", "/routes/initialize", {
      Authorization: `Bearer ${tokenAdmin}`
    });
    const routesCountAfter2 = await Route.countDocuments();
    const busesCountAfter2 = await Bus.countDocuments();

    record(
      "ADV-13",
      "Unauthorized route initialization rejected & admin seeding is idempotent",
      unauthInitRes.statusCode === 401 &&
        userInitRes.statusCode === 403 &&
        adminInitRes1.statusCode === 200 &&
        adminInitRes2.statusCode === 200 &&
        adminInitRes2.body?.seededRoutes === 0 &&
        adminInitRes2.body?.seededBuses === 0 &&
        routesCountAfter1 === routesCountAfter2 &&
        busesCountAfter1 === busesCountAfter2,
      `Unauth -> ${unauthInitRes.statusCode}, User -> ${userInitRes.statusCode}, Admin 2nd run seededRoutes=${adminInitRes2.body?.seededRoutes}, seededBuses=${adminInitRes2.body?.seededBuses}`
    );

    // -------------------------------------------------------------------------
    // ADV-14: Unauthorized notification retry and trigger
    // -------------------------------------------------------------------------
    const unauthRetry = await makeRequest("POST", "/notifications/retry-failed");
    const unauthTrigger = await makeRequest("POST", "/notifications/trigger", {}, {
      customerId: customerA._id.toString(),
      type: "system",
      title: "Unauth",
      message: "Unauth"
    });
    const userRetry = await makeRequest("POST", "/notifications/retry-failed", {
      Authorization: `Bearer ${tokenA}`
    });
    const userTrigger = await makeRequest(
      "POST",
      "/notifications/trigger",
      { Authorization: `Bearer ${tokenA}` },
      {
        customerId: customerA._id.toString(),
        type: "system",
        title: "User",
        message: "User"
      }
    );
    const userHistory = await makeRequest("GET", "/notifications/delivery-history", {
      Authorization: `Bearer ${tokenA}`
    });

    record(
      "ADV-14",
      "Unauthorized notification retry, trigger, and delivery-history rejected",
      unauthRetry.statusCode === 401 &&
        unauthTrigger.statusCode === 401 &&
        userRetry.statusCode === 403 &&
        userTrigger.statusCode === 403 &&
        userHistory.statusCode === 403,
      `Unauth retry/trigger -> ${unauthRetry.statusCode}/${unauthTrigger.statusCode}; Normal user retry/trigger/history -> ${userRetry.statusCode}/${userTrigger.statusCode}/${userHistory.statusCode}`
    );

    // -------------------------------------------------------------------------
    // ADV-15: Cancellation of already-departed journeys
    // -------------------------------------------------------------------------
    const pastDateObj = new Date(Date.now() - 3 * 60 * 60 * 1000); // 3 hours ago
    const pastYyyy = pastDateObj.getFullYear();
    const pastMm = String(pastDateObj.getMonth() + 1).padStart(2, "0");
    const pastDd = String(pastDateObj.getDate()).padStart(2, "0");
    const pastDateStr = `${pastYyyy}-${pastMm}-${pastDd}`;
    const pastHour = pastDateObj.getHours();

    const departedBooking = await Booking.create({
      customerId: customerA._id.toString(),
      busId: "bus-departed-1",
      operatorName: "Past Travels",
      seats: [14],
      fare: 500,
      status: "confirmed",
      bookingDate: pastDateStr,
      email: customerA.email,
      phoneNumber: "9111111111",
      departureDetails: { city: "Delhi", time: pastHour, date: pastDateStr },
      arrivalDetails: { city: "Jaipur", time: (pastHour + 5) % 24, date: pastDateStr }
    });
    createdBookingIds.push(departedBooking._id);

    const cancelDepartedRes = await makeRequest(
      "PUT",
      `/booking/${departedBooking._id}/cancel`,
      { Authorization: `Bearer ${tokenA}` },
      {}
    );
    const departedAfter = await Booking.findById(departedBooking._id).lean();

    record(
      "ADV-15",
      "Cancellation of already-departed journey rejected",
      cancelDepartedRes.statusCode === 400 &&
        cancelDepartedRes.body?.error === "CancellationWindowClosed" &&
        departedAfter.status === "confirmed",
      `PUT /booking/${departedBooking._id}/cancel (departed 3h ago) -> HTTP ${cancelDepartedRes.statusCode} (${cancelDepartedRes.body?.error}); DB status='${departedAfter.status}'`
    );

    // -------------------------------------------------------------------------
    // ADV-16: Cancellation within the two-hour cutoff
    // -------------------------------------------------------------------------
    const soonDateObj = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now
    const soonYyyy = soonDateObj.getFullYear();
    const soonMm = String(soonDateObj.getMonth() + 1).padStart(2, "0");
    const soonDd = String(soonDateObj.getDate()).padStart(2, "0");
    const soonDateStr = `${soonYyyy}-${soonMm}-${soonDd}`;
    const soonTimeStr = `${String(soonDateObj.getHours()).padStart(2, "0")}:${String(soonDateObj.getMinutes()).padStart(2, "0")}`;

    const cutoffBooking = await Booking.create({
      customerId: customerA._id.toString(),
      busId: "bus-cutoff-1",
      operatorName: "Soon Travels",
      seats: [15],
      fare: 500,
      status: "confirmed",
      bookingDate: soonDateStr,
      email: customerA.email,
      phoneNumber: "9111111111",
      departureDetails: { city: "Delhi", time: soonTimeStr, date: soonDateStr },
      arrivalDetails: { city: "Jaipur", time: 23, date: soonDateStr }
    });
    createdBookingIds.push(cutoffBooking._id);

    const cancelCutoffRes = await makeRequest(
      "PUT",
      `/booking/${cutoffBooking._id}/cancel`,
      { Authorization: `Bearer ${tokenA}` },
      {}
    );
    const cutoffAfter = await Booking.findById(cutoffBooking._id).lean();

    record(
      "ADV-16",
      "Cancellation within 2-hour pre-departure cutoff rejected",
      cancelCutoffRes.statusCode === 400 &&
        cancelCutoffRes.body?.error === "CancellationWindowClosed" &&
        cutoffAfter.status === "confirmed",
      `PUT /booking/${cutoffBooking._id}/cancel (departs in 1h) -> HTTP ${cancelCutoffRes.statusCode} (${cancelCutoffRes.body?.error}); DB status='${cutoffAfter.status}'`
    );

    // -------------------------------------------------------------------------
    // ADV-17: Community write endpoints require valid Bearer token & reject forged identity
    // -------------------------------------------------------------------------
    const postNoToken = await makeRequest("POST", "/community/posts", {}, {
      title: "Unauthenticated Post",
      content: "Should fail without token",
      routeTitle: "Delhi to Jaipur",
      category: "route_advice"
    });
    const postInvalidToken = await makeRequest(
      "POST",
      "/community/posts",
      { Authorization: "Bearer invalid.jwt.token" },
      {
        title: "Invalid Token Post",
        content: "Should fail with invalid token",
        routeTitle: "Delhi to Jaipur",
        category: "route_advice"
      }
    );
    const postForgedAuthor = await makeRequest(
      "POST",
      "/community/posts",
      { Authorization: `Bearer ${tokenA}` },
      {
        authorId: customerB._id.toString(),
        title: "Forged Author Post",
        content: "Customer A attempting to post as Customer B",
        routeTitle: "Delhi to Jaipur",
        category: "route_advice"
      }
    );
    const postValid = await makeRequest(
      "POST",
      "/community/posts",
      { Authorization: `Bearer ${tokenA}` },
      {
        title: "Verified Community Post",
        content: "Authenticated Customer A post",
        routeTitle: "Delhi to Jaipur",
        category: "route_advice"
      }
    );
    const createdPostId = postValid.body?._id;

    const commentNoToken = await makeRequest(
      "POST",
      `/community/posts/${createdPostId}/comments`,
      {},
      { text: "Unauthenticated comment" }
    );
    const commentForged = await makeRequest(
      "POST",
      `/community/posts/${createdPostId}/comments`,
      { Authorization: `Bearer ${tokenB}` },
      { authorId: customerA._id.toString(), text: "Forged authorId comment" }
    );
    const commentValid = await makeRequest(
      "POST",
      `/community/posts/${createdPostId}/comments`,
      { Authorization: `Bearer ${tokenB}` },
      { text: "Authenticated Customer B comment" }
    );
    const createdCommentId = commentValid.body?._id;

    const likeNoToken = await makeRequest(
      "POST",
      `/community/posts/${createdPostId}/like`,
      {},
      {}
    );
    const likeForged = await makeRequest(
      "POST",
      `/community/posts/${createdPostId}/like`,
      { Authorization: `Bearer ${tokenB}` },
      { userId: customerA._id.toString() }
    );
    const likeValid = await makeRequest(
      "POST",
      `/community/posts/${createdPostId}/like`,
      { Authorization: `Bearer ${tokenB}` },
      {}
    );

    const reportPostNoToken = await makeRequest(
      "POST",
      `/community/posts/${createdPostId}/report`,
      {},
      { reason: "spam" }
    );
    const reportPostForged = await makeRequest(
      "POST",
      `/community/posts/${createdPostId}/report`,
      { Authorization: `Bearer ${tokenB}` },
      { reportedBy: customerA._id.toString(), reason: "spam" }
    );
    const reportPostValid = await makeRequest(
      "POST",
      `/community/posts/${createdPostId}/report`,
      { Authorization: `Bearer ${tokenB}` },
      { reason: "spam" }
    );
    const reportCommentNoToken = await makeRequest(
      "POST",
      `/community/comments/${createdCommentId}/report`,
      {},
      { reason: "spam" }
    );
    const reportCommentValid = await makeRequest(
      "POST",
      `/community/comments/${createdCommentId}/report`,
      { Authorization: `Bearer ${tokenA}` },
      { reason: "spam" }
    );

    if (createdPostId) {
      await CommunityPost.findByIdAndDelete(createdPostId).catch(() => {});
      await CommunityComment.deleteMany({ postId: createdPostId }).catch(() => {});
      await ContentReport.deleteMany({ targetId: { $in: [createdPostId, createdCommentId] } }).catch(() => {});
    }

    const adv17Passed =
      postNoToken.statusCode === 401 &&
      postInvalidToken.statusCode === 401 &&
      postForgedAuthor.statusCode === 403 &&
      postValid.statusCode === 201 &&
      String(postValid.body?.author) === customerA._id.toString() &&
      commentNoToken.statusCode === 401 &&
      commentForged.statusCode === 403 &&
      commentValid.statusCode === 201 &&
      likeNoToken.statusCode === 401 &&
      likeForged.statusCode === 403 &&
      likeValid.statusCode === 200 &&
      reportPostNoToken.statusCode === 401 &&
      reportPostForged.statusCode === 403 &&
      reportPostValid.statusCode === 201 &&
      reportCommentNoToken.statusCode === 401 &&
      reportCommentValid.statusCode === 201;

    record(
      "ADV-17",
      "Community endpoints enforce mandatory Bearer token & verified JWT identity",
      adv17Passed,
      `createPost(noTok=${postNoToken.statusCode},badTok=${postInvalidToken.statusCode},forged=${postForgedAuthor.statusCode},valid=${postValid.statusCode}); comment(noTok=${commentNoToken.statusCode},forged=${commentForged.statusCode},valid=${commentValid.statusCode}); like(noTok=${likeNoToken.statusCode},forged=${likeForged.statusCode},valid=${likeValid.statusCode}); report(noTok=${reportPostNoToken.statusCode},forged=${reportPostForged.statusCode},valid=${reportPostValid.statusCode}/${reportCommentValid.statusCode})`
    );

    // -------------------------------------------------------------------------
    // ADV-18: Review write endpoints require valid Bearer token & verify ownership
    // -------------------------------------------------------------------------
    const completedBookingA = await Booking.create({
      customerId: customerA._id.toString(),
      busId: "bus-rev-sec-1",
      operatorName: "Review Security Express",
      seats: [9],
      fare: 600,
      status: "confirmed",
      bookingDate: "2024-05-01",
      email: customerA.email,
      phoneNumber: "9111111111",
      departureDetails: { city: "Delhi", time: "08:00", date: "2024-05-01" },
      arrivalDetails: { city: "Jaipur", time: 13, date: "2024-05-01" }
    });
    createdBookingIds.push(completedBookingA._id);

    const revNoToken = await makeRequest("POST", "/reviews", {}, {
      bookingId: completedBookingA._id.toString(),
      busId: "bus-rev-sec-1",
      rating: 5,
      reviewText: "Should fail without token regardless of body"
    });
    const revInvalidToken = await makeRequest(
      "POST",
      "/reviews",
      { Authorization: "Bearer invalid.jwt.token" },
      {
        bookingId: completedBookingA._id.toString(),
        busId: "bus-rev-sec-1",
        rating: 5,
        reviewText: "Should fail with invalid token"
      }
    );
    const revCrossCustomer = await makeRequest(
      "POST",
      "/reviews",
      { Authorization: `Bearer ${tokenB}` },
      {
        bookingId: completedBookingA._id.toString(),
        busId: "bus-rev-sec-1",
        rating: 1,
        reviewText: "Customer B attempting to review Customer A booking"
      }
    );
    const revValid = await makeRequest(
      "POST",
      "/reviews",
      { Authorization: `Bearer ${tokenA}` },
      {
        bookingId: completedBookingA._id.toString(),
        busId: "bus-rev-sec-1",
        rating: 5,
        reviewText: "Smooth journey verified by Customer A!"
      }
    );
    const createdReviewId = revValid.body?._id;

    const editNoToken = await makeRequest(
      "PUT",
      `/reviews/${createdReviewId}`,
      {},
      { rating: 4, reviewText: "Unauthenticated edit attempt" }
    );
    const editCrossCustomer = await makeRequest(
      "PUT",
      `/reviews/${createdReviewId}`,
      { Authorization: `Bearer ${tokenB}` },
      { rating: 1, reviewText: "Customer B hijacking Customer A review" }
    );
    const editValid = await makeRequest(
      "PUT",
      `/reviews/${createdReviewId}`,
      { Authorization: `Bearer ${tokenA}` },
      { rating: 4, reviewText: "Updated by owner Customer A within 24h window" }
    );

    const helpfulNoToken = await makeRequest(
      "POST",
      `/reviews/${createdReviewId}/helpful`,
      {},
      {}
    );
    const helpfulForged = await makeRequest(
      "POST",
      `/reviews/${createdReviewId}/helpful`,
      { Authorization: `Bearer ${tokenB}` },
      { userId: customerA._id.toString() }
    );
    const helpfulValid = await makeRequest(
      "POST",
      `/reviews/${createdReviewId}/helpful`,
      { Authorization: `Bearer ${tokenB}` },
      {}
    );

    const reportRevNoToken = await makeRequest(
      "POST",
      `/reviews/${createdReviewId}/report`,
      {},
      { reason: "spam" }
    );
    const reportRevForged = await makeRequest(
      "POST",
      `/reviews/${createdReviewId}/report`,
      { Authorization: `Bearer ${tokenB}` },
      { reportedBy: customerA._id.toString(), reason: "spam" }
    );
    const reportRevValid = await makeRequest(
      "POST",
      `/reviews/${createdReviewId}/report`,
      { Authorization: `Bearer ${tokenB}` },
      { reason: "spam" }
    );

    if (createdReviewId) {
      await JourneyReview.findByIdAndDelete(createdReviewId).catch(() => {});
      await ReviewReport.deleteMany({ reviewId: createdReviewId }).catch(() => {});
    }

    const adv18Passed =
      revNoToken.statusCode === 401 &&
      revInvalidToken.statusCode === 401 &&
      revCrossCustomer.statusCode === 403 &&
      revValid.statusCode === 201 &&
      String(revValid.body?.customerId) === customerA._id.toString() &&
      editNoToken.statusCode === 401 &&
      editCrossCustomer.statusCode === 403 &&
      editValid.statusCode === 200 &&
      helpfulNoToken.statusCode === 401 &&
      helpfulForged.statusCode === 403 &&
      helpfulValid.statusCode === 200 &&
      reportRevNoToken.statusCode === 401 &&
      reportRevForged.statusCode === 403 &&
      reportRevValid.statusCode === 201;

    record(
      "ADV-18",
      "Review endpoints enforce mandatory Bearer token, booking ownership & review ownership",
      adv18Passed,
      `createReview(noTok=${revNoToken.statusCode},badTok=${revInvalidToken.statusCode},crossCust=${revCrossCustomer.statusCode},valid=${revValid.statusCode}); editReview(noTok=${editNoToken.statusCode},crossCust=${editCrossCustomer.statusCode},valid=${editValid.statusCode}); helpful(noTok=${helpfulNoToken.statusCode},forged=${helpfulForged.statusCode},valid=${helpfulValid.statusCode}); report(noTok=${reportRevNoToken.statusCode},forged=${reportRevForged.statusCode},valid=${reportRevValid.statusCode})`
    );
  } finally {
    if (createdBookingIds.length > 0) {
      await Booking.deleteMany({ _id: { $in: createdBookingIds } }).catch(() => {});
    }
    if (createdCustomerIds.length > 0) {
      await Customer.deleteMany({ _id: { $in: createdCustomerIds } }).catch(() => {});
    }
    server.close();
    await mongoose.disconnect().catch(() => {});
  }

  console.log("\n=================================================================");
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  console.log(`ADVERSARIAL SUITE SUMMARY: ${passCount} PASS / ${failCount} FAIL (Total: ${results.length})`);
  console.log("=================================================================");

  if (failCount > 0) {
    process.exit(1);
  }
}

runAdversarialSuite().catch((err) => {
  console.error("Adversarial test runner error:", err);
  process.exit(1);
});

