const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin.controllers");
const { getAdminEvents, getAdminNotices, getEventDetail, updateEvent, deleteEvent, getNoticeDetail, updateNotice, deleteNotice, createEvent, createNotice } = require("../controllers/admin.noticeEvent.controllers");



// 주소 가져오기
// ✅ GET /api/addresses?q=역삼&limit=10
// q: 검색어
// limit: 최대 몇개까지 줄지 (기본 10)
router.post("/auth/login", adminController.adminLogin);


router.get("/dashboard", adminController.dashboard);

// adminUsers
router.get("/users", adminController.users);
router.get("/users/:user_id", adminController.getUserDetail);
router.put("/users/:id/delete", adminController.userDelete);

// adminReports
router.get("/reports", adminController.reports);
router.get("/reports/:id", adminController.getReportsDetail);
router.patch("/reports/:id", adminController.updateReportsDetail);
router.put("/reports/:id/delete", adminController.reportDelete);

// adminTrades
router.get("/trades", adminController.trades);
router.get("/trades/:id", adminController.getTradesDeatail);
router.put("/trades/:id/delete", adminController.tradeDelete);



// 이벤트 목록
router.get("/events", getAdminEvents);

// 공지사항 목록
router.get("/notices", getAdminNotices);

// 공지사항 상세 가져오기
router.get("/notice/:id", getNoticeDetail);

// 공지사항 업데이트
router.put("/notice/:id", updateNotice);  

router.put("/notice/:id/delete", deleteNotice);

router.post("/notice/create", createNotice);

// 이벤트 상세 가져오기
router.get("/event/:id", getEventDetail);

// 이벤트 업데이트
router.put("/event/:id", updateEvent);

// 이벤트 삭제
router.put("/events/:id/delete", deleteEvent);

router.post("/event/create", createEvent);



// admainCommu
router.get("/community", adminController.community);
router.get("/community/:id", adminController.getCommunityDetail);
router.put("/community/:id/delete", adminController.communityDelete);

// adminPosts (젤 하단에 위치 시킬것)
router.get("/posts", adminController.posts);
router.put("/:url/:id/delete", adminController.postDelete);
router.get("/:cate/:id", adminController.getPostDetail);

module.exports = router;