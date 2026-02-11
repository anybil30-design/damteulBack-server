const db = require("../db");

exports.create = (req, res) => {
  const { user_id, title, content, status, images } = req.body;

  const sql = `
    INSERT INTO dam_nanum_posts (user_id, title, content, status, end_nanum) 
    VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))
  `;

  db.query(sql, [user_id, title, content, status], (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "DB 저장 실패" });
    }
    const nanum_id = result.insertId;

    // ✅ 이미지 처리 로직
    if (images && (Array.isArray(images) || (typeof images === 'string' && images.length > 0))) {
      let imageList = [];
      
      if (Array.isArray(images)) {
        // 객체 배열이면 url만 추출, 아니면 그대로
        imageList = images.map(img => (typeof img === 'object' ? img.url : img));
      } else {
        // 문자열이면 split
        imageList = images.split(',');
      }

      console.log("📸 이미지 저장 전 imageList:", imageList);

      const imageSql = `
        INSERT INTO dam_nanum_images (nanum_id, image_url) 
        VALUES ?
      `;

      // 데이터 정제: [object Object] 방지 및 문자열 강제 변환
      const imageParams = imageList
        .filter(url => url && String(url).indexOf('[object Object]') === -1)
        .map(url => [
          nanum_id,
          String(url).trim()
        ]);

      console.log("💾 DB에 저장될 이미지 params:", imageParams);

      if (imageParams.length > 0) {
        db.query(imageSql, [imageParams], (imgErr) => {
          if (imgErr) console.error("이미지 저장 에러:", imgErr.sqlMessage);
          else console.log("✅ 이미지 저장 성공");
          return res.status(200).json({ nanum_id: nanum_id });
        });
      } else {
        return res.status(200).json({ nanum_id: nanum_id });
      }
    } else {
      res.status(200).json({ nanum_id: nanum_id });
    }
  });
};

// 조회하기
exports.findOne = (req, res) => {
  const { nanum_id } = req.params;
  const sql = "SELECT dam_nanum_posts.*, damteul_users.user_nickname, damteul_users.level_code FROM dam_nanum_posts JOIN damteul_users ON dam_nanum_posts.user_id = damteul_users.user_id WHERE dam_nanum_posts.nanum_id =? AND dam_nanum_posts.is_deleted = 0";

  db.query(sql, [nanum_id], (err, result) => {
    if (err) return res.status(500).json(err);
    if (!result || result.length === 0) return res.status(404).json({ error: "게시글을 찾을 수 없습니다." });

    const data = result[0];

    // 이미지 따로 조회
    const imageSql = `
      SELECT image_url
      FROM dam_nanum_images
      WHERE nanum_id = ?`;

    db.query(imageSql, [nanum_id], (imgErr, images) => {
      if (imgErr) {
        console.error("이미지 조회 에러", imgErr);
        return res.status(500).json({ error: "이미지 조회 실패" });
      }
      data.images = images;
      res.status(200).json(data);
    });
  });
};


// 데이터 가져오기
exports.findAll = (req, res) => {
  const sql = `
    SELECT 
      dam_nanum_posts.*,
      (SELECT image_url FROM dam_nanum_images WHERE dam_nanum_images.nanum_id = dam_nanum_posts.nanum_id LIMIT 1) AS image
    FROM dam_nanum_posts 
    WHERE dam_nanum_posts.is_deleted = 0
    ORDER BY created_at DESC`;

  db.query(sql, (err, result) => {
    if(err){
      console.error(err);
      return res.status(500).json({error:"목록 조회 실패"});
    }
    // DB결과 반환
    res.status(200).json(result);
  });
};

// 소프트 삭제: is_deleted = 1
exports.remove = (req, res) => {
  const { nanum_id } = req.params;
  const sql = `UPDATE dam_nanum_posts SET is_deleted = 1 WHERE nanum_id = ?`;

  db.query(sql, [nanum_id], (err, result) => {
    if (err) {
      console.error("나눔 삭제(소프트) 에러:", err);
      return res.status(500).json({ ok: false, message: "삭제 실패" });
    }
    if (result.affectedRows > 0) {
      return res.status(200).json({ ok: true, message: "삭제(소프트) 완료", id: nanum_id });
    }
    return res.status(404).json({ ok: false, message: "게시글을 찾을 수 없습니다." });
  });
};


// SQL에 들어갈 이벤트
// -- 1. 이벤트 스케줄러 활성화
// SET GLOBAL event_scheduler = ON;

// -- 2. 기존 이벤트가 있다면 삭제 (중복 방지)
// DROP EVENT IF EXISTS update_nanum_status;

// -- 3. 30분 주기로 변경하여 재생성
// CREATE EVENT update_nanum_status
// ON SCHEDULE EVERY 30 MINUTE
// DO
//   UPDATE dam_nanum_posts 
//   SET status = 1 
//   WHERE end_nanum <= NOW() AND status = 0;

// 응모하기 버튼 클릭시 데이터 POST
exports.apply = (req, res) => {
  const { nanum_id, user_id } = req.body;
  const status = 0;

  const checkSql = "SELECT * FROM dam_nanum_apply WHERE nanum_id=? AND user_id=?";

  db.query(checkSql, [nanum_id, user_id], (err, result) => {
    if (err) return res.status(500).json(err);

    // 1. 중복 확인 결과가 0보다 크면 여기서 중단
    if (result.length > 0) {
      return res.status(400).json({ message: "이미 응모한 게시글입니다." });
    }

    // 2. 중복이 없을 때(result.length === 0) 실행될 INSERT 쿼리를 이 안으로 이동
    const sql = `INSERT INTO dam_nanum_apply (nanum_id, user_id, status) VALUES (?,?,?)`;

    db.query(sql, [nanum_id, user_id, status], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "응모 실패" });
      }
      res.status(200).json({ message: "응모 성공", apply_id: result.insertId });
    });
  });
};

// 이미지 업로드는 app.js의 전역 업로드 API 사용
// POST /api/upload/multi/nanum (다중 업로드)
// 응답: { success: true, files: [{savedName, url: "/uploads/nanum/..."}, ...] }