// backend/src/routes/community.route.js
const express = require("express");
const router = express.Router();
const commController = require("../controllers/community.controllers");

// 목록 및 상세
router.get("/", commController.commList); 
router.get("/:id", commController.commDetail);

// 좋아요 상태 조회 및 토글 (✅ 404 에러 해결을 위해 추가)
router.get("/:id/likes", commController.getLikeStatus);
router.post("/likes/toggle", commController.toggleLike); 

// 작성 및 삭제
router.post("/", commController.commCreate);
router.put("/delete/:id", commController.commDelete); 

router.put("/:id", commController.commUpdate);

// 댓글 조회, 작성
router.get("/:id/comments", commController.getComments); 
router.post("/comments", commController.addComment);

module.exports = router;