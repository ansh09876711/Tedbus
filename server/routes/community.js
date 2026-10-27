const express = require("express");
const router = express.Router();
const communityController = require("../controller/community");

router.get("/community/posts", communityController.getPosts);
router.post("/community/posts", communityController.createPost);
router.post("/community/posts/:id/like", communityController.likePost);
router.post("/community/posts/:id/report", communityController.reportPost);
router.post("/community/posts/:id/moderate", communityController.moderatePost);

module.exports = router;
