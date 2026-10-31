const express = require("express");
const router = express.Router();
const communityController = require("../controller/community");

router.get("/community/posts", communityController.getPosts);
router.post("/community/posts", communityController.createPost);
router.get("/community/posts/:id/comments", communityController.getComments);
router.post("/community/posts/:id/comments", communityController.addComment);
router.post("/community/posts/:id/like", communityController.likePost);
router.post("/community/posts/:id/report", communityController.reportPost);
router.post("/community/posts/:id/moderate", communityController.moderatePost);

router.post("/community/comments/:id/report", communityController.reportComment);
router.post("/community/comments/:id/moderate", communityController.moderateComment);
router.get("/community/reports", communityController.getReports);
router.get("/community/user/:customerId", communityController.getUserCommunityActivity);

module.exports = router;
