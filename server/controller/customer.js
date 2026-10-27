const Customer = require("../models/customer");
const mongoose = require("mongoose");

exports.addnewcustomer = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Customer service is temporarily unavailable because the database is offline."
      });
    }

    const { name, email, googleId, profilepicture } = req.body;
    let exisitingcustomer = await Customer.findOne({ email: email })
      .lean()
      .exec();
    if (exisitingcustomer) {
      res.setHeader("X-Data-Source", "mongodb");
      res.send(exisitingcustomer);
    } else {
      const customer = new Customer({
        name,
        email,
        googleId,
        profilePicture: profilepicture,
      });
      const newCustomer = await customer.save();
      res.setHeader("X-Data-Source", "mongodb");
      res.status(201).json(newCustomer);
    }
  } catch (error) {
    console.error("Error adding customer:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
