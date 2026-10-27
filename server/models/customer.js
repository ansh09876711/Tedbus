const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const customerSchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  googleId: {
    type: String,
    required: false,
  },
  age: {
    type: Number,
    required: false,
  },
  gender: {
    type: String,
    required: false,
  },
  email: {
    type: String,
    required: true,
  },
  dateOfBirth: {
    type: String,
    required: false,
  },
  profilePicture: {
    type: String,
    required: false,
  },
  role: {
    type: String,
    enum: ["user", "moderator", "admin"],
    default: "user",
  },
  isVerified: {
    type: Boolean,
    default: true,
  },
  languagePreference: {
    type: String,
    enum: ["en", "hi"],
    default: "en",
  },
  themePreference: {
    type: String,
    enum: ["light", "dark", "system"],
    default: "light",
  },
  notificationPreferences: {
    email: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    inApp: { type: Boolean, default: true },
    promotional: { type: Boolean, default: false },
  },
}, { timestamps: true });

module.exports = mongoose.model("Customers", customerSchema);

