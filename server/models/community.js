const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Community Post Schema
const communityPostSchema = new Schema({
  author: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
  },
  authorName: {
    type: String,
    required: true,
  },
  authorPicture: {
    type: String,
    default: "",
  },
  isAuthorVerified: {
    type: Boolean,
    default: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
  },
  content: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    enum: ["tips", "experiences", "safety", "routes", "general"],
    default: "general",
  },
  imageUrl: {
    type: String,
    default: "",
  },
  likes: [{
    type: Schema.Types.ObjectId,
    ref: "Customers",
  }],
  reportsCount: {
    type: Number,
    default: 0,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Community Comment Schema
const communityCommentSchema = new Schema({
  postId: {
    type: Schema.Types.ObjectId,
    ref: "CommunityPosts",
    required: true,
    index: true,
  },
  author: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
  },
  authorName: {
    type: String,
    required: true,
  },
  authorPicture: {
    type: String,
    default: "",
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
  isHidden: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Content Report Schema
const contentReportSchema = new Schema({
  targetType: {
    type: String,
    enum: ["post", "comment"],
    required: true,
  },
  targetId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  reportedBy: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["pending", "reviewed", "dismissed"],
    default: "pending",
  },
}, { timestamps: true });

// Moderation Action Audit Log Schema
const moderationActionSchema = new Schema({
  actionType: {
    type: String,
    enum: ["hide", "restore", "delete"],
    required: true,
  },
  targetType: {
    type: String,
    enum: ["post", "comment"],
    required: true,
  },
  targetId: {
    type: Schema.Types.ObjectId,
    required: true,
  },
  moderator: {
    type: Schema.Types.ObjectId,
    ref: "Customers",
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
}, { timestamps: true });

const CommunityPost = mongoose.model("CommunityPosts", communityPostSchema);
const CommunityComment = mongoose.model("CommunityComments", communityCommentSchema);
const ContentReport = mongoose.model("ContentReports", contentReportSchema);
const ModerationAction = mongoose.model("ModerationActions", moderationActionSchema);

module.exports = {
  CommunityPost,
  CommunityComment,
  ContentReport,
  ModerationAction,
};
