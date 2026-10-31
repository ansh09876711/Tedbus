const mongoose = require("mongoose");
const { CommunityPost, CommunityComment, ContentReport, ModerationAction } = require("../models/community");
const Customer = require("../models/customer");
const { createAndDispatchNotification } = require("./notification");
const { verifyModeratorOrAdmin, verifyCustomerAuth, extractBearerToken } = require("../middleware/auth");

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
    likes: ["u1", "u2", "u3"],
    commentsCount: 2,
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
    likes: ["u1"],
    commentsCount: 1,
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
    likes: ["u2", "u3"],
    commentsCount: 1,
    reportsCount: 0,
    createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
  }
];

const defaultCommentsByPost = {
  "post-101": [
    {
      _id: "cmt-101-1",
      postId: "post-101",
      parentCommentId: null,
      authorName: "Arjun Nair",
      authorPicture: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100",
      isAuthorVerified: true,
      text: "Great tip about the lower berth! Also keep motion sickness tablets handy after Sundernagar.",
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    },
    {
      _id: "cmt-101-2",
      postId: "post-101",
      parentCommentId: "cmt-101-1",
      authorName: "Priya Sharma",
      authorPicture: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120",
      isAuthorVerified: true,
      text: "Totally agree Arjun! The Aut tunnel stretch is much faster now though.",
      createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    }
  ],
  "post-102": [
    {
      _id: "cmt-102-1",
      postId: "post-102",
      parentCommentId: null,
      authorName: "Sneha Kulkarni",
      authorPicture: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100",
      isAuthorVerified: true,
      text: "Thanks for the update! Is the Anmod Ghat section open for heavy buses now?",
      createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
    }
  ],
  "post-103": [
    {
      _id: "cmt-103-1",
      postId: "post-103",
      parentCommentId: null,
      authorName: "Meera Joshi",
      authorPicture: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100",
      isAuthorVerified: true,
      text: "Shivneri is my go-to for Dadar to Wakad commute every week. Very reliable!",
      createdAt: new Date(Date.now() - 3600000 * 20).toISOString(),
    }
  ]
};

/**
 * Helper to verify that an authorId belongs to a real, verified Customer in MongoDB.
 */
async function verifyAuthorIdentity(authorId) {
  if (!authorId || !String(authorId).match(/^[0-9a-fA-F]{24}$/)) {
    return {
      valid: false,
      status: 403,
      error: "AuthorVerificationRequired",
      message: "A valid verified customer account ID is required to publish community content."
    };
  }

  const user = await Customer.findById(authorId).lean().exec();
  if (!user) {
    return {
      valid: false,
      status: 403,
      error: "AuthorNotFound",
      message: "Customer account not found. Only registered and verified accounts may publish community content."
    };
  }

  if (user.isVerified === false) {
    return {
      valid: false,
      status: 403,
      error: "UnverifiedAuthor",
      message: "Only verified accounts may publish community posts and comments."
    };
  }

  return { valid: true, user };
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /community/posts — Get community feed with category, sort, and pagination
// ─────────────────────────────────────────────────────────────────────────────
exports.getPosts = async (req, res) => {
  try {
    const { category, sort, page, limit, authorId } = req.query;
    let query = { isHidden: { $ne: true } };
    if (category && category !== "all") {
      query.category = category;
    }
    if (authorId && String(authorId).match(/^[0-9a-fA-F]{24}$/)) {
      query.author = authorId;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
    const skipNum = (pageNum - 1) * limitNum;

    let posts = [];
    let totalCount = 0;
    try {
      if (mongoose.connection.readyState === 1) {
        totalCount = await CommunityPost.countDocuments(query);
        let mongoQuery = CommunityPost.find(query);
        if (sort === "popular") {
          mongoQuery = mongoQuery.sort({ likes: -1, createdAt: -1 });
        } else {
          mongoQuery = mongoQuery.sort({ createdAt: -1 });
        }
        posts = await mongoQuery.skip(skipNum).limit(limitNum).lean().exec();

        // Populate live commentsCount for MongoDB posts
        if (posts.length > 0) {
          const postIds = posts.map(p => p._id);
          const counts = await CommunityComment.aggregate([
            { $match: { postId: { $in: postIds }, isHidden: { $ne: true } } },
            { $group: { _id: "$postId", count: { $sum: 1 } } }
          ]);
          const countMap = {};
          counts.forEach(c => { countMap[String(c._id)] = c.count; });
          posts = posts.map(p => ({
            ...p,
            commentsCount: countMap[String(p._id)] !== undefined ? countMap[String(p._id)] : (p.commentsCount || 0)
          }));
        }
      }
    } catch (e) {
      posts = [];
    }

    const isFallback = (!posts || posts.length === 0) && !authorId;
    if (isFallback) {
      if (category && category !== "all") {
        posts = defaultPosts.filter(p => p.category === category);
      } else {
        posts = [...defaultPosts];
      }
      if (sort === "popular") {
        posts.sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0));
      }
      totalCount = posts.length;
      res.setHeader("X-Data-Source", "fallback");
    } else {
      res.setHeader("X-Data-Source", "mongodb");
    }

    res.setHeader("X-Total-Count", String(totalCount));
    res.setHeader("X-Has-More", String(skipNum + posts.length < totalCount));
    res.json(posts);
  } catch (error) {
    console.error("Error fetching community posts:", error);
    res.status(500).json({ error: "Failed to fetch community posts" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /community/posts — Create a new post (Strictly Verified Users Only)
// ─────────────────────────────────────────────────────────────────────────────
exports.createPost = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Community service is temporarily offline because the database is unavailable."
      });
    }

    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { title, content, category, imageUrl, authorName, authorPicture } = req.body;
    const suppliedAuthorId = req.body.authorId || req.headers["x-author-id"];

    if (suppliedAuthorId && String(suppliedAuthorId).trim() !== String(auth.customer._id)) {
      return res.status(403).json({
        error: "AuthorIdentityMismatch",
        message: "Submitted authorId does not match the authenticated customer token."
      });
    }

    if (auth.customer.isVerified === false) {
      return res.status(403).json({
        error: "UnverifiedAuthor",
        message: "Only verified accounts may publish community posts and comments."
      });
    }

    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const verifiedUser = auth.customer;
    const VALID_CATEGORIES = ["tips", "experiences", "safety", "routes", "general"];
    const normalizedCategory = VALID_CATEGORIES.includes(category) ? category : "general";

    const newPost = await CommunityPost.create({
      author: verifiedUser._id,
      authorName: verifiedUser.name || (authorName && authorName.trim()) || "TedBus Traveler",
      authorPicture: verifiedUser.profilePicture || authorPicture || "",
      isAuthorVerified: true,
      title: title.trim(),
      content: content.trim(),
      category: normalizedCategory,
      imageUrl: imageUrl ? imageUrl.trim() : "",
      likes: [],
      commentsCount: 0,
    });

    res.setHeader("X-Data-Source", "mongodb");
    res.status(201).json(newPost);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: "Failed to create post in database" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /community/posts/:id/comments — Fetch comments & replies for a post
// ─────────────────────────────────────────────────────────────────────────────
exports.getComments = async (req, res) => {
  try {
    const { id } = req.params;

    // Fallback post comments support
    if (defaultCommentsByPost[id]) {
      res.setHeader("X-Data-Source", "fallback");
      return res.json(defaultCommentsByPost[id]);
    }

    if (!id || !String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.json([]);
    }

    if (mongoose.connection.readyState !== 1) {
      return res.json([]);
    }

    const comments = await CommunityComment.find({
      postId: id,
      isHidden: { $ne: true }
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    res.setHeader("X-Data-Source", "mongodb");
    res.json(comments);
  } catch (error) {
    console.error("Error fetching post comments:", error);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /community/posts/:id/comments — Add a comment or reply to a post
// ─────────────────────────────────────────────────────────────────────────────
exports.addComment = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        error: "DatabaseUnavailable",
        message: "Comment service is temporarily unavailable because the database is offline."
      });
    }

    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { id } = req.params;
    const { text, parentCommentId, authorName, authorPicture } = req.body;
    const suppliedAuthorId = req.body.authorId || req.headers["x-author-id"];

    if (suppliedAuthorId && String(suppliedAuthorId).trim() !== String(auth.customer._id)) {
      return res.status(403).json({
        error: "AuthorIdentityMismatch",
        message: "Submitted authorId does not match the authenticated customer token."
      });
    }

    if (auth.customer.isVerified === false) {
      return res.status(403).json({
        error: "UnverifiedAuthor",
        message: "Only verified accounts may publish community posts and comments."
      });
    }

    if (!id || !String(id).match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ error: "InvalidPostId", message: "Valid post ID is required to comment." });
    }

    if (!text || text.trim().length < 2) {
      return res.status(400).json({ error: "CommentTooShort", message: "Comment text must be at least 2 characters." });
    }

    const post = await CommunityPost.findById(id);
    if (!post || post.isHidden) {
      return res.status(404).json({ error: "PostNotFound", message: "Community post not found." });
    }

    let validParentId = null;
    if (parentCommentId && String(parentCommentId).match(/^[0-9a-fA-F]{24}$/)) {
      const parentComment = await CommunityComment.findById(parentCommentId).lean().exec();
      if (!parentComment || String(parentComment.postId) !== String(id)) {
        return res.status(400).json({ error: "InvalidParentComment", message: "Parent comment not found on this post." });
      }
      validParentId = parentComment._id;
    }

    const verifiedUser = auth.customer;
    const comment = await CommunityComment.create({
      postId: post._id,
      parentCommentId: validParentId,
      author: verifiedUser._id,
      authorName: verifiedUser.name || (authorName && authorName.trim()) || "TedBus Traveler",
      authorPicture: verifiedUser.profilePicture || authorPicture || "",
      isAuthorVerified: true,
      text: text.trim(),
    });

    post.commentsCount = (post.commentsCount || 0) + 1;
    await post.save();

    // Dispatch community_activity notification to post author if someone else commented
    if (post.author && String(post.author) !== String(verifiedUser._id)) {
      createAndDispatchNotification({
        customerId: String(post.author),
        type: "community_activity",
        title: `New Reply on "${post.title.slice(0, 36)}"`,
        message: `${comment.authorName} commented on your community post: "${comment.text.slice(0, 80)}"`,
        link: `/community#${post._id}`,
        idempotencyKey: `community_comment_${comment._id}`
      }).catch(() => {});
    }

    res.setHeader("X-Data-Source", "mongodb");
    res.status(201).json(comment);
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: "Failed to add comment" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /community/posts/:id/like — Like / Unlike a post (Authenticated Customer Only)
// ─────────────────────────────────────────────────────────────────────────────
exports.likePost = async (req, res) => {
  try {
    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { id } = req.params;
    const suppliedUserId = req.body.userId;
    const authUserId = String(auth.customer._id);

    if (suppliedUserId && String(suppliedUserId).trim() !== authUserId) {
      return res.status(403).json({
        error: "UserIdentityMismatch",
        message: "Submitted userId does not match the authenticated customer token."
      });
    }

    if (String(id).match(/^[0-9a-fA-F]{24}$/)) {
      const post = await CommunityPost.findById(id);
      if (!post) {
        return res.status(404).json({ error: "PostNotFound", message: "Community post not found." });
      }

      const hasLiked = post.likes.some(uId => uId.toString() === authUserId);
      if (hasLiked) {
        post.likes = post.likes.filter(uId => uId.toString() !== authUserId);
      } else {
        post.likes.push(new mongoose.Types.ObjectId(authUserId));
      }

      await post.save();
      return res.json({ success: true, likesCount: post.likes.length, isLiked: !hasLiked });
    }

    res.json({ success: true, likesCount: 1, isLiked: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to process like" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /community/posts/:id/report — Report a community post (Authenticated Customer Only)
// ─────────────────────────────────────────────────────────────────────────────
exports.reportPost = async (req, res) => {
  try {
    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { id } = req.params;
    const { reason, description, reportedBy } = req.body;
    const authUserId = String(auth.customer._id);

    if (reportedBy && String(reportedBy).trim() !== authUserId) {
      return res.status(403).json({
        error: "ReporterIdentityMismatch",
        message: "Submitted reportedBy does not match the authenticated customer token."
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Report reason is required" });
    }

    let reportDoc = null;
    if (mongoose.connection.readyState === 1 && String(id).match(/^[0-9a-fA-F]{24}$/)) {
      reportDoc = await ContentReport.create({
        targetType: "post",
        targetId: new mongoose.Types.ObjectId(id),
        reportedBy: auth.customer._id,
        reason: reason.trim(),
        description: description || "",
        status: "pending"
      });

      await CommunityPost.findByIdAndUpdate(id, { $inc: { reportsCount: 1 } });
    }

    res.status(201).json({
      success: true,
      reportId: reportDoc ? reportDoc._id : undefined,
      message: "Report submitted to moderation team for review"
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to report content" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /community/comments/:id/report — Report a community comment (Authenticated Customer Only)
// ─────────────────────────────────────────────────────────────────────────────
exports.reportComment = async (req, res) => {
  try {
    const auth = await verifyCustomerAuth(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { id } = req.params;
    const { reason, description, reportedBy } = req.body;
    const authUserId = String(auth.customer._id);

    if (reportedBy && String(reportedBy).trim() !== authUserId) {
      return res.status(403).json({
        error: "ReporterIdentityMismatch",
        message: "Submitted reportedBy does not match the authenticated customer token."
      });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Report reason is required" });
    }

    let reportDoc = null;
    if (mongoose.connection.readyState === 1 && String(id).match(/^[0-9a-fA-F]{24}$/)) {
      reportDoc = await ContentReport.create({
        targetType: "comment",
        targetId: new mongoose.Types.ObjectId(id),
        reportedBy: auth.customer._id,
        reason: reason.trim(),
        description: description || "",
        status: "pending"
      });

      await CommunityComment.findByIdAndUpdate(id, { $inc: { reportsCount: 1 } });
    }

    res.status(201).json({
      success: true,
      reportId: reportDoc ? reportDoc._id : undefined,
      message: "Comment report submitted to moderation team"
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to report comment" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /community/reports — Moderator queue: list flagged posts/comments & logs
// ─────────────────────────────────────────────────────────────────────────────
exports.getReports = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({ reports: [], moderationLog: [] });
    }

    const auth = await verifyModeratorOrAdmin(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { status } = req.query;
    const filter = {};
    if (status && ["pending", "reviewed", "dismissed"].includes(status)) {
      filter.status = status;
    }

    const rawReports = await ContentReport.find(filter)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
      .exec();

    // Enrich each report with target post/comment preview
    const enrichedReports = await Promise.all(
      rawReports.map(async (r) => {
        let targetSummary = null;
        try {
          if (r.targetType === "post") {
            const p = await CommunityPost.findById(r.targetId).lean().exec();
            if (p) {
              targetSummary = {
                title: p.title,
                content: p.content,
                authorName: p.authorName,
                isHidden: p.isHidden,
                reportsCount: p.reportsCount
              };
            }
          } else if (r.targetType === "comment") {
            const c = await CommunityComment.findById(r.targetId).lean().exec();
            if (c) {
              targetSummary = {
                title: "Comment on post",
                content: c.text,
                authorName: c.authorName,
                isHidden: c.isHidden,
                reportsCount: c.reportsCount
              };
            }
          }
        } catch (_) {}
        return { ...r, targetSummary };
      })
    );

    const moderationLog = await ModerationAction.find({})
      .sort({ createdAt: -1 })
      .limit(25)
      .lean()
      .exec();

    res.setHeader("X-Data-Source", "mongodb");
    res.json({ reports: enrichedReports, moderationLog });
  } catch (error) {
    console.error("Error fetching community reports:", error);
    res.status(500).json({ error: "Failed to fetch moderation reports" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /community/posts/:id/moderate — Moderate a post (hide / restore / delete)
// ─────────────────────────────────────────────────────────────────────────────
exports.moderatePost = async (req, res) => {
  try {
    const auth = await verifyModeratorOrAdmin(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { id } = req.params;
    const { action, reason } = req.body;

    const VALID_ACTIONS = ["hide", "restore", "delete"];
    if (!action || !VALID_ACTIONS.includes(action) || !reason) {
      return res.status(400).json({ error: "Valid action (hide/restore/delete) and reason are required for moderation" });
    }

    if (mongoose.connection.readyState === 1 && String(id).match(/^[0-9a-fA-F]{24}$/)) {
      if (action === "hide") {
        await CommunityPost.findByIdAndUpdate(id, { isHidden: true });
      } else if (action === "restore") {
        await CommunityPost.findByIdAndUpdate(id, { isHidden: false });
      } else if (action === "delete") {
        await CommunityPost.findByIdAndDelete(id);
        await CommunityComment.deleteMany({ postId: id });
      }

      await ContentReport.updateMany(
        { targetType: "post", targetId: id, status: "pending" },
        { $set: { status: "reviewed" } }
      );

      await ModerationAction.create({
        actionType: action,
        targetType: "post",
        targetId: new mongoose.Types.ObjectId(id),
        moderator: auth.moderator._id,
        reason: reason.trim(),
      });
    }

    res.json({ success: true, action, targetId: id, message: `Post ${action} action executed successfully` });
  } catch (error) {
    console.error("Error moderating post:", error);
    res.status(500).json({ error: "Failed to execute moderation action" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /community/comments/:id/moderate — Moderate a comment (hide / restore / delete)
// ─────────────────────────────────────────────────────────────────────────────
exports.moderateComment = async (req, res) => {
  try {
    const auth = await verifyModeratorOrAdmin(req);
    if (!auth.authorized) {
      return res.status(auth.status).json({ error: auth.error, message: auth.message });
    }

    const { id } = req.params;
    const { action, reason } = req.body;

    const VALID_ACTIONS = ["hide", "restore", "delete"];
    if (!action || !VALID_ACTIONS.includes(action) || !reason) {
      return res.status(400).json({ error: "Valid action (hide/restore/delete) and reason are required" });
    }

    if (mongoose.connection.readyState === 1 && String(id).match(/^[0-9a-fA-F]{24}$/)) {
      const comment = await CommunityComment.findById(id);
      if (action === "hide" && comment) {
        comment.isHidden = true;
        await comment.save();
      } else if (action === "restore" && comment) {
        comment.isHidden = false;
        await comment.save();
      } else if (action === "delete" && comment) {
        await CommunityPost.findByIdAndUpdate(comment.postId, { $inc: { commentsCount: -1 } });
        await CommunityComment.findByIdAndDelete(id);
      }

      await ContentReport.updateMany(
        { targetType: "comment", targetId: id, status: "pending" },
        { $set: { status: "reviewed" } }
      );

      await ModerationAction.create({
        actionType: action,
        targetType: "comment",
        targetId: new mongoose.Types.ObjectId(id),
        moderator: auth.moderator._id,
        reason: reason.trim(),
      });
    }

    res.json({ success: true, action, targetId: id, message: `Comment ${action} action executed successfully` });
  } catch (error) {
    res.status(500).json({ error: "Failed to moderate comment" });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /community/user/:customerId — User's authored posts, liked posts & comments
// ─────────────────────────────────────────────────────────────────────────────
exports.getUserCommunityActivity = async (req, res) => {
  try {
    const { customerId } = req.params;

    if (mongoose.connection.readyState !== 1 || !customerId || !String(customerId).match(/^[0-9a-fA-F]{24}$/)) {
      res.setHeader("X-Data-Source", "fallback");
      return res.json({
        authoredPosts: [],
        likedPosts: [],
        comments: [],
        stats: { postsCount: 0, likesGivenCount: 0, commentsCount: 0 }
      });
    }

    const [authoredPosts, likedPosts, comments] = await Promise.all([
      CommunityPost.find({ author: customerId, isHidden: { $ne: true } }).sort({ createdAt: -1 }).lean().exec(),
      CommunityPost.find({ likes: customerId, isHidden: { $ne: true } }).sort({ createdAt: -1 }).lean().exec(),
      CommunityComment.find({ author: customerId, isHidden: { $ne: true } }).sort({ createdAt: -1 }).lean().exec(),
    ]);

    res.setHeader("X-Data-Source", "mongodb");
    res.json({
      authoredPosts,
      likedPosts,
      comments,
      stats: {
        postsCount: authoredPosts.length,
        likesGivenCount: likedPosts.length,
        commentsCount: comments.length
      }
    });
  } catch (error) {
    console.error("Error fetching user community activity:", error);
    res.status(500).json({ error: "Failed to fetch user community activity" });
  }
};
