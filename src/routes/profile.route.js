const express = require('express');
const router = express.Router();
const profileCtrl = require('../controllers/profile.controllers');

// 프로필 정보 가져오기 (GET)
router.get("/:user_id", profileCtrl.getProfile);

// 닉네임 변경하기 (PUT)
router.put("/nickname", profileCtrl.updateNickname);

module.exports = router;