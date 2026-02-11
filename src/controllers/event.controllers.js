const db = require("../db");

// 1. 이벤트 전체 목록 조회
exports.eventFindAll = (req, res) => {
  // cate = 0 (이벤트), cate = 1 (공지사항) 등 구분값에 맞춰 쿼리
  const sql = "SELECT * FROM dam_event_notice WHERE cate = 0 ORDER BY event_id DESC";

  db.query(sql, (err, result) => {
    if (err) {
      console.error("이벤트 목록 조회 실패:", err);
      return res.status(500).json({ error: "데이터베이스 조회 오류" });
    }
    res.status(200).json(result);
  });
};

// 2. 이벤트 상세 데이터 조회
exports.eventFindOne = (req, res) => {
  const { id } = req.params;
  const sql = "SELECT * FROM dam_event_notice WHERE event_id = ?";

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("이벤트 상세 조회 실패:", err);
      return res.status(500).json({ error: "데이터베이스 조회 오류" });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "해당 이벤트를 찾을 수 없습니다." });
    }
    // 프론트에서 나눔과 구분하기 쉽게 type을 섞어서 보냅니다.
    res.status(200).json({ ...result[0], type: 'event' });
  });
};