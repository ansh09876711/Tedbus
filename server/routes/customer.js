const express = require("express");
const router = express.Router();
const customercontroller = require("../controller/customer");

router.post("/customer", customercontroller.addnewcustomer);
router.get("/customer/:id", customercontroller.getCustomerProfile);
router.put("/customer/:id/preferences", customercontroller.updateCustomerPreferences);

module.exports = router;

