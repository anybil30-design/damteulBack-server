const express = require("express");
const router = express.Router();
const chatController = require("../controllers/chat.controllers");

// ✅ 목록(채팅 페이지)
router.get("/rooms", chatController.getMyChatRooms);

// ✅ 방 존재 조회(상품 상세 등에서)
router.get("/room", chatController.getRoomByGoodsAndBuyer);

// ✅ 메시지 목록(+자동 읽음처리)
router.get("/messages", chatController.getMessagesByChatId);

// ✅ 첫 메시지(방 생성 + 첫 메시지 저장)
router.post("/send-first", chatController.sendFirstMessage);

// ✅ 두번째부터 메시지 전송
router.post("/send", chatController.sendMessage);

// ✅ 읽음 처리 전용(옵션)
router.post("/mark-read", chatController.markChatRead);

module.exports = router;
