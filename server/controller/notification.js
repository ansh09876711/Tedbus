const { Notification, NotificationDeliveryAttempt } = require("../models/notification");
const Customer = require("../models/customer");

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

// Get notifications for a user
exports.getNotifications = async (req, res) => {
  try {
    const { customerId } = req.query;
    let notifications = [];

    if (customerId && customerId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        notifications = await Notification.find({ customerId })
          .sort({ createdAt: -1 })
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
    try {
      await Notification.findByIdAndUpdate(id, { read: true });
    } catch (e) {}
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update notification" });
  }
};

// Mark all as read
exports.markAllAsRead = async (req, res) => {
  try {
    const { customerId } = req.body;
    try {
      if (customerId && customerId.match(/^[0-9a-fA-F]{24}$/)) {
        await Notification.updateMany({ customerId, read: false }, { read: true });
      }
    } catch (e) {}
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

    if (customerId && customerId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        const customer = await Customer.findById(customerId).lean().exec();
        if (customer && customer.notificationPreferences) {
          prefs = customer.notificationPreferences;
        }
      } catch (e) {}
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

    if (customerId && customerId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        await Customer.findByIdAndUpdate(customerId, {
          notificationPreferences: { email, push, inApp, promotional }
        });
      } catch (e) {}
    }

    res.json({
      success: true,
      notificationPreferences: { email, push, inApp, promotional },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update preferences" });
  }
};
