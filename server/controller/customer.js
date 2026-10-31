const Customer = require("../models/customer");
const mongoose = require("mongoose");
const { signJwtToken, hashPassword, verifyPassword } = require("../middleware/auth");

function sanitizeCustomer(customerDoc) {
  if (!customerDoc) return null;
  const obj = typeof customerDoc.toObject === "function" ? customerDoc.toObject() : { ...customerDoc };
  delete obj.passwordHash;
  delete obj.passwordSalt;
  return obj;
}

/**
 * Authenticates an existing customer or registers a new customer account.
 *
 * Security guarantees:
 * - Never issues a JWT token based solely on a submitted name, email, or unverified googleId.
 * - Requires a valid password (minimum 6 characters).
 * - For existing accounts, verifies the submitted password against the stored scrypt hash in constant time.
 * - Rejects password login against accounts that do not have a stored passwordHash (preventing takeover of pre-existing records).
 * - Never trusts role or isVerified fields from the request body; new registrations always receive role='user'.
 */
exports.addnewcustomer = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Customer service is temporarily unavailable because the database is offline."
      });
    }

    const rawEmail = String(req.body?.email || "").trim().toLowerCase();
    const rawName = String(req.body?.name || "").trim();
    const rawPassword = typeof req.body?.password === "string" ? req.body.password : "";
    const profilePicture = req.body?.profilepicture || req.body?.profilePicture || "";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || !emailRegex.test(rawEmail)) {
      return res.status(400).json({
        error: "InvalidEmail",
        message: "A valid email address is required."
      });
    }

    if (!rawPassword || rawPassword.length < 6) {
      return res.status(401).json({
        error: "CredentialsRequired",
        message: "A valid password (at least 6 characters) is required for authentication. Name or email alone is not sufficient."
      });
    }

    const existingCustomer = await Customer.findOne({ email: rawEmail })
      .select("+passwordHash +passwordSalt")
      .exec();

    if (existingCustomer) {
      // Existing account: must have a stored password hash and match the submitted password
      if (
        !existingCustomer.passwordHash ||
        !existingCustomer.passwordSalt ||
        !verifyPassword(rawPassword, existingCustomer.passwordSalt, existingCustomer.passwordHash)
      ) {
        return res.status(401).json({
          error: "InvalidCredentials",
          message: "Invalid email or password."
        });
      }

      const safeCustomer = sanitizeCustomer(existingCustomer);
      const authToken = signJwtToken(safeCustomer);

      res.setHeader("X-Data-Source", "mongodb");
      return res.status(200).json({
        ...safeCustomer,
        authToken
      });
    }

    // New customer registration
    const finalName = rawName.length >= 2 ? rawName : rawEmail.split("@")[0];
    const { passwordSalt, passwordHash } = hashPassword(rawPassword);

    // Strictly enforce default 'user' role — never trust client-supplied role
    const customer = new Customer({
      name: finalName,
      email: rawEmail,
      passwordHash,
      passwordSalt,
      profilePicture: profilePicture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(finalName)}`,
      role: "user",
      isVerified: true
    });

    const newCustomer = await customer.save();
    const safeNewCustomer = sanitizeCustomer(newCustomer);
    const authToken = signJwtToken(safeNewCustomer);

    res.setHeader("X-Data-Source", "mongodb");
    return res.status(201).json({
      ...safeNewCustomer,
      authToken
    });
  } catch (error) {
    console.error("Error authenticating/registering customer:", error.message);
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
      customer = await Customer.findOne({ email: id.toLowerCase() }).lean().exec();
    } else {
      customer = await Customer.findOne({ googleId: id }).lean().exec();
    }

    if (!customer) {
      return res.status(404).json({ error: "CustomerNotFound", message: "Customer profile not found." });
    }

    res.setHeader("X-Data-Source", "mongodb");
    res.json(sanitizeCustomer(customer));
  } catch (error) {
    console.error("Error fetching customer profile:", error.message);
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
      query = { email: id.toLowerCase() };
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
    console.error("Error updating customer preferences:", error.message);
    res.status(500).json({ error: "Failed to update customer preferences" });
  }
};
