const mongoose = require("mongoose");
const { Notification, NotificationDeliveryAttempt } = require("../models/notification");
const Customer = require("../models/customer");
const { verifyAdminOnly } = require("../middleware/auth");
const { isSmtpConfigured, sendSmtpEmail } = require("../services/emailService");
const { isVapidConfigured, getVapidPublicKey, sendWebPushNotification } = require("../services/webPushService");

const defaultNotifications = [
  {
    _id: "notif-1",
    type: "booking_confirmed",
    title: "Booking Confirmed #TB-789412",
    message: "Your journey from Delhi to Jaipur on Nov 05, 2026 is confirmed. Live tracking link will be active 2 hours prior to departure.",
    link: "/profile",
    read: false,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
  {
    _id: "notif-2",
    type: "departure_reminder",
    title: "Boarding Gate Update",
    message: "Bus TB-304 leaves from Kashmiri Gate Bay #4. Please arrive 15 minutes before departure.",
    link: "/profile",
    read: true,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  }
];

/**
 * Core Multi-Channel Notification Dispatcher
 * Dispatches notifications across in_app, email, and push based on user preferences.
 * Enforces idempotency to avoid duplicate notifications.
 */
async function createAndDispatchNotification({ customerId, type, title, message, link, idempotencyKey, lang = 'en', meta = {} }) {
  if (mongoose.connection.readyState !== 1) {
    console.warn("[Notifications] MongoDB not connected; skipping notification creation.");
    return null;
  }

  try {
    // 1. Idempotency Check (prevent duplicate event notification)
    if (idempotencyKey) {
      const existing = await Notification.findOne({ idempotencyKey }).lean().exec();
      if (existing) {
        console.log(`[Notifications] Skipping duplicate notification for idempotencyKey=${idempotencyKey}`);
        return existing;
      }
    }

    // 2. Fetch Customer Preferences & Language
    let prefs = { inApp: true, email: true, push: true, promotional: false };
    let customerLang = lang;
    let custDoc = null;

    if (customerId) {
      try {
        let cust = null;
        if (mongoose.Types.ObjectId.isValid(customerId) && String(customerId).length === 24) {
          cust = await Customer.findById(customerId).lean().exec();
        }
        if (!cust) {
          cust = await Customer.findOne({ $or: [{ email: customerId }, { googleId: customerId }] }).lean().exec();
        }
        if (cust) {
          custDoc = cust;
          if (cust.notificationPreferences) prefs = { ...prefs, ...cust.notificationPreferences };
          if (cust.languagePreference) customerLang = cust.languagePreference;
        }
      } catch (e) { }
    }

    // 3. Check Promotional Opt-In
    if (type === "promotional" && !prefs.promotional) {
      console.log(`[Notifications] Customer ${customerId} has opted out of promotional notifications.`);
      return null;
    }

    // 4. Localize Notification Title & Message when customer prefers Hindi ('hi')
    let finalTitle = title;
    let finalMessage = message;
    if (customerLang === "hi") {
      if (meta.titleHi) finalTitle = meta.titleHi;
      else if (type === "booking_confirmed" && String(title).startsWith("Booking Confirmed")) {
        finalTitle = String(title).replace("Booking Confirmed", "बुकिंग पुष्ट");
      } else if (type === "booking_cancelled" && String(title).startsWith("Booking Cancelled")) {
        finalTitle = String(title).replace("Booking Cancelled", "बुकिंग रद्द");
      }
      if (meta.messageHi) finalMessage = meta.messageHi;
    }

    // Create Notification Document
    const notif = await Notification.create({
      customerId,
      type,
      title: finalTitle,
      message: finalMessage,
      link: link || "/profile",
      read: false,
      idempotencyKey: idempotencyKey || undefined,
    });

    // 5. Multi-channel delivery attempts tracking
    // Channel A: in_app (Immediate persistent delivery)
    if (prefs.inApp) {
      await NotificationDeliveryAttempt.create({
        notificationId: notif._id,
        channel: "in_app",
        status: "delivered",
        attemptCount: 1,
        errorMessage: "",
      });
    }

    // Channel B: email (Real SMTP transport; never claims delivered when credentials are missing)
    if (prefs.email) {
      const recipientEmail =
        meta.email ||
        (custDoc && custDoc.email) ||
        (typeof customerId === "string" && customerId.includes("@") ? customerId : "");

      if (!recipientEmail || !String(recipientEmail).includes("@")) {
        await NotificationDeliveryAttempt.create({
          notificationId: notif._id,
          channel: "email",
          status: "failed",
          attemptCount: 1,
          errorMessage: "No valid recipient email address on customer profile.",
        });
      } else if (!isSmtpConfigured()) {
        await NotificationDeliveryAttempt.create({
          notificationId: notif._id,
          channel: "email",
          status: "pending",
          attemptCount: 1,
          errorMessage: "SMTP credentials not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).",
        });
      } else {
        const emailResult = await sendSmtpEmail({
          to: recipientEmail,
          subject: finalTitle,
          text: finalMessage,
        });
        await NotificationDeliveryAttempt.create({
          notificationId: notif._id,
          channel: "email",
          status: emailResult.delivered ? "delivered" : "failed",
          attemptCount: 1,
          errorMessage: emailResult.error || "",
        });
      }
    }

    // Channel C: push (Service Worker VAPID Web Push; never claims delivered when VAPID keys are missing)
    if (prefs.push) {
      if (!isVapidConfigured()) {
        await NotificationDeliveryAttempt.create({
          notificationId: notif._id,
          channel: "push",
          status: "pending",
          attemptCount: 1,
          errorMessage: "VAPID WebPush keys not configured (set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).",
        });
      } else if (!custDoc || !custDoc.pushSubscription) {
        await NotificationDeliveryAttempt.create({
          notificationId: notif._id,
          channel: "push",
          status: "pending",
          attemptCount: 1,
          errorMessage: "Customer has not registered a browser WebPush subscription endpoint.",
        });
      } else {
        const pushResult = await sendWebPushNotification(custDoc.pushSubscription, {
          title: finalTitle,
          message: finalMessage,
          link: link || "/profile",
        });
        await NotificationDeliveryAttempt.create({
          notificationId: notif._id,
          channel: "push",
          status: pushResult.delivered ? "delivered" : "failed",
          attemptCount: 1,
          errorMessage: pushResult.error || "",
        });
      }
    }

    console.log(`[Notifications] Notification #${notif._id} dispatched for customer=${customerId} [type=${type}]`);
    return notif;

  } catch (error) {
    console.error("[Notifications] Dispatch error:", error);
    return null;
  }
}

// Get notifications for a user
exports.getNotifications = async (req, res) => {
  try {
    const { customerId, unreadOnly } = req.query;
    let notifications = [];

    if (mongoose.connection.readyState === 1 && customerId) {
      try {
        let filter = { customerId };
        if (mongoose.Types.ObjectId.isValid(customerId) && String(customerId).length === 24) {
          filter = { $or: [{ customerId }, { customerId: new mongoose.Types.ObjectId(customerId) }] };
        }
        if (unreadOnly === "true") {
          filter.read = false;
        }

        notifications = await Notification.find(filter)
          .sort({ createdAt: -1 })
          .limit(50)
          .lean()
          .exec();
      } catch (e) {
        notifications = [];
      }
    }

    const isFallback = !notifications || notifications.length === 0;
    if (isFallback) {
      notifications = defaultNotifications;
      res.setHeader("X-Data-Source", "fallback");
    } else {
      res.setHeader("X-Data-Source", "mongodb");
    }

    res.json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (mongoose.connection.readyState === 1 && id && mongoose.Types.ObjectId.isValid(id)) {
      await Notification.findByIdAndUpdate(id, { read: true });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notification" });
  }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    const { customerId } = req.body;
    if (mongoose.connection.readyState === 1 && customerId) {
      let filter = { customerId, read: false };
      if (mongoose.Types.ObjectId.isValid(customerId) && String(customerId).length === 24) {
        filter = { $or: [{ customerId }, { customerId: new mongoose.Types.ObjectId(customerId) }], read: false };
      }
      await Notification.updateMany(filter, { read: true });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark all as read" });
  }
};

// Get user notification preferences
exports.getPreferences = async (req, res) => {
  try {
    const { customerId } = req.params;
    let prefs = {
      email: true,
      push: true,
      inApp: true,
      promotional: false,
    };

    if (mongoose.connection.readyState === 1 && customerId) {
      try {
        let customer = null;
        if (mongoose.Types.ObjectId.isValid(customerId) && String(customerId).length === 24) {
          customer = await Customer.findById(customerId).lean().exec();
        }
        if (!customer) {
          customer = await Customer.findOne({ $or: [{ email: customerId }, { googleId: customerId }] }).lean().exec();
        }
        if (customer && customer.notificationPreferences) {
          prefs = customer.notificationPreferences;
        }
      } catch (e) { }
    }

    res.json(prefs);
  } catch (error) {
    res.status(500).json({ error: "Failed to get preferences" });
  }
};

// Update user notification preferences
exports.updatePreferences = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { email, push, inApp, promotional } = req.body;

    if (mongoose.connection.readyState === 1 && customerId) {
      const updateData = { notificationPreferences: { email, push, inApp, promotional } };
      if (mongoose.Types.ObjectId.isValid(customerId) && String(customerId).length === 24) {
        await Customer.findByIdAndUpdate(customerId, updateData);
      } else {
        await Customer.findOneAndUpdate({ $or: [{ email: customerId }, { googleId: customerId }] }, updateData);
      }
    }

    res.json({
      success: true,
      notificationPreferences: { email, push, inApp, promotional },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update preferences" });
  }
};

// Failed delivery retry mechanism (Admin-only protected)
exports.retryFailedDeliveries = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "DatabaseUnavailable" });
    }

    const auth = await verifyAdminOnly(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    // Find attempts that failed and haven't exceeded retry limit (max 3)
    const failedAttempts = await NotificationDeliveryAttempt.find({
      status: "failed",
      attemptCount: { $lt: 3 },
    })
      .populate("notificationId")
      .limit(20);

    let retried = 0;
    let deliveredCount = 0;
    for (const attempt of failedAttempts) {
      attempt.attemptCount += 1;
      if (attempt.channel === "in_app") {
        attempt.status = "delivered";
        attempt.errorMessage = "";
        deliveredCount++;
      } else if (attempt.channel === "email") {
        if (!isSmtpConfigured()) {
          attempt.status = "failed";
          attempt.errorMessage = "Retry blocked: SMTP credentials not configured (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).";
        } else {
          const notifDoc = attempt.notificationId;
          const recipient = notifDoc && typeof notifDoc.customerId === "string" && notifDoc.customerId.includes("@")
            ? notifDoc.customerId
            : "";
          const emailRes = await sendSmtpEmail({
            to: recipient,
            subject: notifDoc?.title || "TedBus Notification",
            text: notifDoc?.message || ""
          });
          attempt.status = emailRes.delivered ? "delivered" : "failed";
          attempt.errorMessage = emailRes.error || "";
          if (emailRes.delivered) deliveredCount++;
        }
      } else if (attempt.channel === "push") {
        if (!isVapidConfigured()) {
          attempt.status = "failed";
          attempt.errorMessage = "Retry blocked: VAPID WebPush keys not configured (set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).";
        } else {
          attempt.status = "failed";
          attempt.errorMessage = "Retry blocked: No active push subscription endpoint.";
        }
      }
      await attempt.save();
      retried++;
    }

    res.json({ success: true, retriedCount: retried, deliveredCount });
  } catch (error) {
    console.error("Retry failed error:", error);
    res.status(500).json({ error: "Failed to process delivery retries" });
  }
};

// Get delivery tracking history (Admin-only protected)
exports.getDeliveryHistory = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "DatabaseUnavailable" });
    }

    const auth = await verifyAdminOnly(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { notificationId } = req.query;
    const filter = notificationId ? { notificationId } : {};

    const history = await NotificationDeliveryAttempt.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("notificationId")
      .lean()
      .exec();

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch delivery history" });
  }
};

// Manual notification trigger endpoint (Admin-only protected)
exports.triggerNotification = async (req, res) => {
  try {
    const auth = await verifyAdminOnly(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { customerId, type, title, message, link, idempotencyKey, lang, email } = req.body;
    if (!customerId || !type || !title || !message) {
      return res.status(400).json({ error: "Missing required notification fields" });
    }

    const notif = await createAndDispatchNotification({
      customerId,
      type,
      title,
      message,
      link,
      idempotencyKey,
      lang,
      meta: { email }
    });

    if (!notif) {
      return res.status(200).json({ success: false, message: "Notification was suppressed by customer preference or duplicate key." });
    }

    res.status(201).json(notif);
  } catch (error) {
    res.status(500).json({ error: "Failed to trigger notification" });
  }
};

// Get notification provider & VAPID configuration status
exports.getConfigStatus = async (req, res) => {
  res.json({
    inAppConfigured: true,
    smtpConfigured: isSmtpConfigured(),
    vapidConfigured: isVapidConfigured(),
    vapidPublicKey: getVapidPublicKey(),
    smsConfigured: false,
    smsMessage: "SMS provider is not configured."
  });
};

module.exports.createAndDispatchNotification = createAndDispatchNotification;

