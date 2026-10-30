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

/**
 * Retrieves a customer profile by ID or email.
 */
exports.getCustomerProfile = async (req, res) => {
  try {
    const { id } = req.params;
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "DatabaseUnavailable", message: "Database offline" });
    }

    let customer = null;
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
      customer = await Customer.findById(id).lean().exec();
    } else if (id && id.includes("@")) {
      customer = await Customer.findOne({ email: id }).lean().exec();
    } else {
      customer = await Customer.findOne({ googleId: id }).lean().exec();
    }

    if (!customer) {
      return res.status(404).json({ error: "CustomerNotFound", message: "Customer profile not found." });
    }

    res.setHeader("X-Data-Source", "mongodb");
    res.json(customer);
  } catch (error) {
    console.error("Error fetching customer profile:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * Updates customer preferences (themePreference, languagePreference).
 */
exports.updateCustomerPreferences = async (req, res) => {
  try {
    const { id } = req.params;
    const { themePreference, languagePreference } = req.body;

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "DatabaseUnavailable", message: "Database offline" });
    }

    const updateFields = {};
    if (themePreference && ["light", "dark", "system"].includes(themePreference)) {
      updateFields.themePreference = themePreference;
    }
    if (languagePreference && ["en", "hi"].includes(languagePreference)) {
      updateFields.languagePreference = languagePreference;
    }

    let query = {};
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
      query = { _id: id };
    } else if (id && id.includes("@")) {
      query = { email: id };
    } else {
      query = { googleId: id };
    }

    const updated = await Customer.findOneAndUpdate(query, { $set: updateFields }, { new: true }).lean().exec();
    if (!updated) {
      return res.status(404).json({ error: "CustomerNotFound", message: "Customer profile not found." });
    }

    res.setHeader("X-Data-Source", "mongodb");
    res.json({
      success: true,
      themePreference: updated.themePreference,
      languagePreference: updated.languagePreference,
    });
  } catch (error) {
    console.error("Error updating customer preferences:", error);
    res.status(500).json({ error: "Failed to update customer preferences" });
  }
};

