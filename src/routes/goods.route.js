// backend/src/routes/goods.route.js
const express = require("express");
const router = express.Router();
const goodsCtrl = require("../controllers/goods.controllers");

// ✅ 이미지 업로드 (app.js의 전역 API 사용)
// POST /api/upload/single/goods (단일 이미지)
// POST /api/upload/multi/goods (다중 이미지, 최대 11장)
// 응답: { success: true, files: [{savedName, url: "/uploads/goods/..."}, ...] }

// ✅ 상품 생성 (이미지 URL들을 포함하여 전송)
// 요청: POST /api/goods
// body: { images: ["/uploads/goods/file1.jpg", "/uploads/goods/file2.jpg", ...], ... }
router.post("/", goodsCtrl.create);

// 글 목록 가져오기
router.get("/",goodsCtrl.post);

// GoodsDetail에 띄울 상세페이지 정보 조회하기
router.get("/:goods_id", goodsCtrl.findOne);

// 글 삭제하기
router.delete("/:goods_id", goodsCtrl.remove);

// 좋아요 토글
router.post('/like', goodsCtrl.toggleLike);

module.exports = router;