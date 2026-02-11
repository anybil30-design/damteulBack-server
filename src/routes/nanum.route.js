const express = require("express");
const router = express.Router();
const nanumCtrl = require("../controllers/nanum.controllers");

// ✅ 이미지 업로드 (app.js의 전역 API 사용)
// POST /api/upload/multi/nanum (다중 이미지, 최대 11장)
// 응답: { success: true, files: [{savedName, url: "/uploads/nanum/..."}, ...] }

// POST /api/nanum - 나눔 글 작성  
// body: { images: ["/uploads/nanum/file1.jpg", ...], ... }
router.post("/", nanumCtrl.create);

// "응모하기" 시 데이터 추가하기
router.post("/apply", nanumCtrl.apply);

// GET /api/nanum/:nanum_id - 나눔 상세페이지 조회
router.get("/:nanum_id", nanumCtrl.findOne);

// 데이터 가져오기
router.get("/", nanumCtrl.findAll);

// 글 삭제(소프트 삭제)
router.delete("/:nanum_id", nanumCtrl.remove);

module.exports = router;