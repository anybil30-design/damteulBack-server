const express = require('express');
const router = express.Router();
const eventCtrl = require('../controllers/event.controllers');
const { eventFindOne } = require('../controllers/event.controllers');

// /api/event 경로로 들어오는 요청들
router.get("/", eventCtrl.eventFindAll);       // 이벤트 목록
router.get("/:id",eventCtrl.eventFindOne);

module.exports = router;