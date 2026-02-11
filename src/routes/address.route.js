const express = require("express");
const router = express.Router();
const addressController = require("../controllers/address.controllers");


// 주소 가져오기
// ✅ GET /api/addresses?q=역삼&limit=10
// q: 검색어
// limit: 최대 몇개까지 줄지 (기본 10)
router.get("/", addressController.searchAddresses);

module.exports = router;