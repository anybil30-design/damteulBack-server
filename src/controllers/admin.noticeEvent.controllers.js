// backend/src/controllers/admin.noticeEvent.controllers.js
const connection = require("../db");

// 공통 에러 응답 헬퍼
function serverError(res, error, message = "서버 오류") {
  console.error(error);
  return res.status(500).json({ success: false, message });
}

function syncEventStatus(cb) {
  const syncSql = `
    UPDATE dam_event_notice
    SET status = CASE
      WHEN NOW() < start_date THEN 0   -- 예정
      WHEN NOW() > end_date   THEN 2   -- 종료
      ELSE 1                            -- 진행중
    END
  `;

  connection.query(syncSql, (err) => cb(err));
}

function toStartDateTime(dateStr) {
  if (!dateStr) return null;
  return `${dateStr} 00:00:00`;
}

function toEndDateTime(dateStr) {
  if (!dateStr) return null;
  return `${dateStr} 23:59:59`;
}

/**
 * GET /api/admin/events
 * cate=0 이벤트 목록
 * (목록 조회는 is_deleted=0)
 */
exports.getAdminEvents = (req, res) => {
  syncEventStatus((err) => {
    if (err) {
      console.error("syncEventStatus error:", err);
      return res
        .status(500)
        .json({ success: false, message: "서버 오류(status 갱신 실패)" });
    }

    const sql = `
      SELECT
        event_id AS id,
        title,
        DATE_FORMAT(start_date, '%Y-%m-%d') AS startDate,
        DATE_FORMAT(end_date, '%Y-%m-%d') AS endDate,
        CASE status
          WHEN 0 THEN '예정'
          WHEN 1 THEN '진행중'
          WHEN 2 THEN '종료'
        END AS status
      FROM dam_event_notice
      WHERE cate = 0 AND is_deleted = 0
      ORDER BY event_id DESC
    `;

    connection.query(sql, (err2, rows) => {
      if (err2) return serverError(res, err2, "이벤트 조회 실패");
      return res.json({ success: true, events: rows || [] });
    });
  });
};

/**
 * GET /api/admin/notices
 * cate=1 공지사항 목록
 * (목록 조회는 is_deleted=0)
 */
exports.getAdminNotices = (req, res) => {
  const sql = `
    SELECT
      event_id AS id,
      title,
      DATE_FORMAT(created_at, '%Y-%m-%d') AS postDate
    FROM dam_event_notice
    WHERE cate = 1 AND is_deleted = 0
    ORDER BY event_id DESC
  `;

  connection.query(sql, (err, rows) => {
    if (err) return serverError(res, err, "공지사항 조회 실패");
    return res.json({ success: true, notices: rows || [] });
  });
};

// ---------------------------
// 공지사항 상세 (요청대로 상세는 is_deleted 조건 안 넣음)
// ---------------------------
exports.getNoticeDetail = (req, res) => {
  const id = Number(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "유효하지 않은 ID" });

  syncEventStatus((err) => {
    if (err) {
      console.error("syncNoticeStatus error:", err);
      return res
        .status(500)
        .json({ success: false, message: "서버 오류(status 갱신 실패)" });
    }

    const selectSql = `
      SELECT
        event_id AS id,
        title,
        content,
        image,
        DATE_FORMAT(created_at, '%Y-%m-%d') AS created_at
      FROM dam_event_notice
      WHERE event_id = ?
    `;

    connection.query(selectSql, [id], (err2, rows) => {
      if (err2) {
        console.error("getNoticeDetail error:", err2);
        return res
          .status(500)
          .json({ success: false, message: "서버 오류(공지사항 조회 실패)" });
      }

      if (!rows || rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "공지사항이 존재하지 않습니다." });
      }

      return res.json({ success: true, event: rows[0] });
    });
  });
};

// 공지사항 업데이트
exports.updateNotice = (req, res) => {
  const id = Number(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "유효하지 않은 ID" });

  const { title, content, image } = req.body;

  if (!title?.trim())
    return res.status(400).json({ success: false, message: "제목이 없습니다." });
  if (!content?.trim())
    return res.status(400).json({ success: false, message: "내용이 없습니다." });
  if (!image?.trim())
    return res.status(400).json({ success: false, message: "이미지가 없습니다." });

  const updateSql = `
    UPDATE dam_event_notice
    SET
      title = ?,
      content = ?,
      image = ?
    WHERE event_id = ?
  `;

  connection.query(updateSql, [title, content, image, id], (err, result) => {
    if (err) {
      console.error("updateNotice error:", err);
      return res
        .status(500)
        .json({ success: false, message: "서버 오류(공지사항 수정 실패)" });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "수정할 공지사항이 없습니다." });
    }

    return res.json({ success: true, message: "공지사항 수정 완료" });
  });
};

// ✅ 공지사항 삭제 (DELETE -> UPDATE soft delete)
// ✅ 라우트는 PUT /api/admin/notices/:id/delete 로 쓰는 걸 추천
exports.deleteNotice = (req, res) => {
  const id = Number(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "유효하지 않은 ID" });

  const sql = `
    UPDATE dam_event_notice
    SET is_deleted = 1
    WHERE event_id = ?
      AND is_deleted = 0
      AND cate = 1
  `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      console.error("deleteNotice(soft) error:", err);
      return res
        .status(500)
        .json({ success: false, message: "서버 오류(공지사항 삭제 실패)" });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "삭제할 공지사항이 없습니다." });
    }

    return res.json({ success: true, message: "공지사항 삭제(소프트) 완료" });
  });
};

// 공지사항 생성
exports.createNotice = (req, res) => {
  const { title, content, image } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({ success: false, message: "제목을 입력해주세요." });
  }
  if (!content?.trim()) {
    return res.status(400).json({ success: false, message: "내용을 입력해주세요." });
  }
  if (!image?.trim()) {
    return res.status(400).json({ success: false, message: "이미지를 등록해주세요." });
  }

  const sql = `
    INSERT INTO dam_event_notice
      (cate, title, content, image, start_date, end_date, status, created_at, is_deleted)
    VALUES
      (1, ?, ?, ?, NULL, NULL, 0, NOW(), 0)
  `;

  connection.query(sql, [title.trim(), content.trim(), image.trim()], (err, result) => {
    if (err) return serverError(res, err, "공지사항 등록 실패");

    return res.status(201).json({
      success: true,
      message: "공지사항 등록 완료",
      id: result.insertId,
    });
  });
};

/**
 * GET /api/admin/event/:id
 * 이벤트 상세 (요청대로 상세는 is_deleted 조건 안 넣음)
 */
exports.getEventDetail = (req, res) => {
  const id = Number(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "유효하지 않은 ID" });

  syncEventStatus((err) => {
    if (err) {
      console.error("syncEventStatus error:", err);
      return res
        .status(500)
        .json({ success: false, message: "서버 오류(status 갱신 실패)" });
    }

    const selectSql = `
      SELECT
        event_id AS id,
        title,
        content,
        image,
        start_date AS startDate,
        end_date   AS endDate,
        CASE status
          WHEN 0 THEN '예정'
          WHEN 1 THEN '진행중'
          WHEN 2 THEN '종료'
        END AS status
      FROM dam_event_notice
      WHERE event_id = ?
    `;

    connection.query(selectSql, [id], (err2, rows) => {
      if (err2) {
        console.error("getEventDetail error:", err2);
        return res
          .status(500)
          .json({ success: false, message: "서버 오류(이벤트 조회 실패)" });
      }

      if (!rows || rows.length === 0) {
        return res
          .status(404)
          .json({ success: false, message: "이벤트가 존재하지 않습니다." });
      }

      return res.json({ success: true, event: rows[0] });
    });
  });
};

// 이벤트 업데이트
exports.updateEvent = (req, res) => {
  const id = Number(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "유효하지 않은 ID" });

  const { title, content, image, startDate, endDate } = req.body;

  if (!title?.trim())
    return res.status(400).json({ success: false, message: "제목이 없습니다." });
  if (!content?.trim())
    return res.status(400).json({ success: false, message: "내용이 없습니다." });
  if (!image?.trim())
    return res.status(400).json({ success: false, message: "이미지가 없습니다." });
  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, message: "날짜가 올바르지 않습니다." });
  }
  if (String(endDate) < String(startDate)) {
    return res
      .status(400)
      .json({ success: false, message: "종료일은 시작일보다 빠를 수 없습니다." });
  }

  const updateSql = `
    UPDATE dam_event_notice
    SET
      title = ?,
      content = ?,
      image = ?,
      start_date = ?,
      end_date = ?,
      status = CASE
        WHEN NOW() < ? THEN 0
        WHEN NOW() > ? THEN 2
        ELSE 1
      END
    WHERE event_id = ?
  `;

  connection.query(
    updateSql,
    [title, content, image, startDate, endDate, startDate, endDate, id],
    (err, result) => {
      if (err) {
        console.error("updateEvent error:", err);
        return res
          .status(500)
          .json({ success: false, message: "서버 오류(이벤트 수정 실패)" });
      }

      if (result.affectedRows === 0) {
        return res
          .status(404)
          .json({ success: false, message: "수정할 이벤트가 없습니다." });
      }

      return res.json({ success: true, message: "이벤트 수정 완료" });
    }
  );
};

/**
 * ✅ 이벤트 삭제 (DELETE -> UPDATE soft delete)
 * ✅ 라우트는 PUT /api/admin/events/:id/delete 로 쓰는 걸 추천
 */
exports.deleteEvent = (req, res) => {
  const id = Number(req.params.id);
  if (!id)
    return res.status(400).json({ success: false, message: "유효하지 않은 ID" });

  const sql = `
    UPDATE dam_event_notice
    SET is_deleted = 1
    WHERE event_id = ?
      AND is_deleted = 0
      AND cate = 0
  `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      console.error("deleteEvent(soft) error:", err);
      return res
        .status(500)
        .json({ success: false, message: "서버 오류(이벤트 삭제 실패)" });
    }

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ success: false, message: "삭제할 이벤트가 없습니다." });
    }

    return res.json({ success: true, message: "이벤트 삭제(소프트) 완료" });
  });
};

// 이벤트 생성
exports.createEvent = (req, res) => {
  const { title, content, image, startDate, endDate } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({ success: false, message: "제목을 입력해주세요." });
  }
  if (!content?.trim()) {
    return res.status(400).json({ success: false, message: "내용을 입력해주세요." });
  }
  if (!image?.trim()) {
    return res.status(400).json({ success: false, message: "이미지를 등록해주세요." });
  }
  if (!startDate) {
    return res.status(400).json({ success: false, message: "시작일을 선택해주세요." });
  }
  if (!endDate) {
    return res.status(400).json({ success: false, message: "종료일을 선택해주세요." });
  }
  if (endDate < startDate) {
    return res
      .status(400)
      .json({ success: false, message: "종료일은 시작일보다 빠를 수 없습니다." });
  }

  const startDT = toStartDateTime(startDate);
  const endDT = toEndDateTime(endDate);

  const sql = `
    INSERT INTO dam_event_notice
      (cate, title, content, image, start_date, end_date, status, created_at, is_deleted)
    VALUES
      (
        0,
        ?,
        ?,
        ?,
        ?,
        ?,
        CASE
          WHEN NOW() < ? THEN 0
          WHEN NOW() > ? THEN 2
          ELSE 1
        END,
        NOW(),
        0
      )
  `;

  const params = [
    title.trim(),
    content.trim(),
    image.trim(),
    startDT,
    endDT,
    startDT,
    endDT,
  ];

  connection.query(sql, params, (err, result) => {
    if (err) return serverError(res, err, "이벤트 등록 실패");

    return res.status(201).json({
      success: true,
      message: "이벤트 등록 완료",
      id: result.insertId,
    });
  });
};
