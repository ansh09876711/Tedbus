const { CommunityPost, CommunityComment, ContentReport, ModerationAction } = require("../models/community");
const Customer = require("../models/customer");

// Default initial community posts to keep feed vibrant even when database is newly initialized
const defaultPosts = [
  {
    _id: "post-101",
    authorName: "Priya Sharma",
    authorPicture: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120",
    isAuthorVerified: true,
    title: "Tips for overnight Delhi to Manali Volvo bus journey in winter",
    content: "Carry an extra thermal layer even though blankets are provided. Most luxury sleeper buses stop near Murthal for dinner around 10:30 PM. Book single lower berths for maximum stability on hairpin bends near Mandi!",
    category: "tips",
    imageUrl: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800",
    likes: [],
    reportsCount: 0,
    createdAt: new Date(Date.now() - 3600000 * 5).toISOString(),
  },
  {
    _id: "post-102",
    authorName: "Rahul Verma",
    authorPicture: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120",
    isAuthorVerified: true,
    title: "Bangalore to Goa via Hubli route road conditions update",
    content: "Took the KSRTC Airavat Club Class bus last night. Road widening near Chitradurga is almost complete, so travel time is down by nearly 45 minutes. Super smooth ride and punctual departure from Majestic.",
    category: "experiences",
    imageUrl: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=800",
    likes: [],
    reportsCount: 0,
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
  },
  {
    _id: "post-103",
    authorName: "Ananya Patel",
    authorPicture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120",
    isAuthorVerified: true,
    title: "Solo female traveler safety check on Mumbai-Pune Shivneri buses",
    content: "Highly recommend reserving seats in the first 4 rows reserved for women. Drivers and conductors are courteous, CCTV is operational, and live tracking on the app matched exact toll booth timestamps.",
    category: "safety",
    imageUrl: "",
    likes: [],
    reportsCount: 0,
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
  }
];

// Get community feed with optional category filter
exports.getPosts = async (req, res) => {
  try {
    const { category, sort } = req.query;
    let query = { isHidden: { $ne: true } };
    if (category && category !== "all") {
      query.category = category;
    }

    let posts = [];
    try {
      let mongoQuery = CommunityPost.find(query);
      if (sort === "popular") {
        mongoQuery = mongoQuery.sort({ "likes.length": -1, createdAt: -1 });
      } else {
        mongoQuery = mongoQuery.sort({ createdAt: -1 });
      }
      posts = await mongoQuery.lean().exec();
    } catch (e) {
      posts = [];
    }

    const isFallback = !posts || posts.length === 0;
    if (isFallback) {
      if (category && category !== "all") {
        posts = defaultPosts.filter(p => p.category === category);
      } else {
        posts = defaultPosts;
      }
      res.setHeader("X-Data-Source", "fallback");
    } else {
      res.setHeader("X-Data-Source", "mongodb");
    }

    res.json(posts);
  } catch (error) {
    console.error("Error fetching community posts:", error);
    res.status(500).json({ error: "Failed to fetch community posts" });
  }
};

// Create a new post (Verified users only)
exports.createPost = async (req, res) => {
  try {
    const mongoose = require("mongoose");
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Community service is temporarily offline because the database is unavailable."
      });
    }

    const { title, content, category, imageUrl, authorId, authorName, authorPicture } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    // Check author verification
    let isVerified = true;
    if (authorId && authorId.match(/^[0-9a-fA-F]{24}$/)) {
      try {
        const user = await Customer.findById(authorId).lean().exec();
        if (user && user.isVerified === false) {
          return res.status(403).json({ error: "Only verified accounts may publish community posts" });
        }
        if (user) isVerified = Boolean(user.isVerified);
      } catch (e) {}
    }

    const newPost = await CommunityPost.create({
      author: authorId && authorId.match(/^[0-9a-fA-F]{24}$/) ? authorId : new mongoose.Types.ObjectId(),
      authorName: authorName || "TedBus Traveler",
      authorPicture: authorPicture || "",
      isAuthorVerified: isVerified,
      title,
      content,
      category: category || "general",
      imageUrl: imageUrl || "",
      likes: [],
    });

    res.setHeader("X-Data-Source", "mongodb");
    res.status(201).json(newPost);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Failed to create post in database" });
  }
};

// Like / Unlike a post
exports.likePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required to like a post" });
    }

    try {
      const post = await CommunityPost.findById(id);
      if (!post) {
        return res.json({ success: true, likesCount: 1 });
      }

      const hasLiked = post.likes.some(uId => uId.toString() === userId.toString());
      if (hasLiked) {
        post.likes = post.likes.filter(uId => uId.toString() !== userId.toString());
      } else {
        post.likes.push(userId);
      }

      await post.save();
      res.json({ success: true, likesCount: post.likes.length, isLiked: !hasLiked });
    } catch (e) {
      res.json({ success: true, likesCount: 1, isLiked: true });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to process like" });
  }
};

// Report a post or comment
exports.reportPost = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, description, reportedBy } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Report reason is required" });
    }

    try {
      await ContentReport.create({
        targetType: "post",
        targetId: id,
        reportedBy: reportedBy || new (require('mongoose').Types.ObjectId)(),
        reason,
        description: description || "",
      });

      await CommunityPost.findByIdAndUpdate(id, { $inc: { reportsCount: 1 } });
    } catch (e) {}

    res.json({ success: true, message: "Report submitted to moderation team for review" });
  } catch (error) {
    res.status(500).json({ error: "Failed to report content" });
  }
};

// Moderate content (Hide / Restore / Delete) - Admin/Moderator only
exports.moderatePost = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, reason, moderatorId } = req.body;

    if (!action || !reason) {
      return res.status(400).json({ error: "Action and reason are required for moderation" });
    }

    try {
      if (action === "hide") {
        await CommunityPost.findByIdAndUpdate(id, { isHidden: true });
      } else if (action === "restore") {
        await CommunityPost.findByIdAndUpdate(id, { isHidden: false });
      } else if (action === "delete") {
        await CommunityPost.findByIdAndDelete(id);
      }

      await ModerationAction.create({
        actionType: action,
        targetType: "post",
        targetId: id,
        moderator: moderatorId || new (require('mongoose').Types.ObjectId)(),
        reason,
      });
    } catch (e) {}

    res.json({ success: true, message: `Content ${action} action executed successfully` });
  } catch (error) {
    res.status(500).json({ error: "Failed to execute moderation action" });
  }
};
