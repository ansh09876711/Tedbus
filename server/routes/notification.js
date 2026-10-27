const express = require("express");
const router = express.Router();
const notificationController = require("../controller/notification");

router.get("/notifications", notificationController.getNotifications);
router.put("/notifications/:id/read", notificationController.markAsRead);
router.post("/notifications/mark-all-read", notificationController.markAllAsRead);
router.get("/notifications/preferences/:customerId", notificationController.getPreferences);
router.put("/notifications/preferences/:customerId", notificationController.updatePreferences);

module.exports = router;
