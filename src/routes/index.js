// backend/src/routes/index.js
// 모든 라우터가 모이는곳

const express = require("express");
const router = express.Router();

// goods 파일 안에 있는 모든 route들 가져오기
// 여기까지의 경로 - /api/goods
router.use("/goods", require("./goods.route"));
router.use("/user", require("./user.route"));
router.use("/addresses", require('./address.route'));
router.use("/nanum", require("./nanum.route"));
router.use("/event", require("./event.route"));
router.use("/admin",require("./admin.route"));
router.use("/profile", require("./profile.route"));
router.use("/chat", require("./chat.route"));
// 커뮤니티
// 경로 - /api/community
router.use("/community", require("./community.route"));



module.exports = router;