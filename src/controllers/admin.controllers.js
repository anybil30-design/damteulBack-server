// backend/src/controllers/admin.controllers.js (예시 파일명)
// 너가 올린 코드 전체를 "이 파일"로 교체하면 됨.

const connection = require("../db");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const JWT_SECRET = "damteul";

// ---------------------------
// 0) 관리자 로그인
// ---------------------------
exports.adminLogin = (req, res) => {
  const { admin_id, admin_pw } = req.body;

  if (!admin_id?.trim() || !admin_pw?.trim()) {
    return res.status(400).json({
      success: false,
      message: "아이디와 비밀번호를 입력해주세요.",
    });
  }

  connection.query(
    `SELECT login_id, password, name FROM dam_admin_users WHERE login_id = ?`,
    [admin_id],
    async (error, rows) => {
      if (error) {
        console.error("adminLogin query error:", error);
        return res.status(500).json({
          success: false,
          message: "서버 오류(DB 조회 실패)",
        });
      }

      if (!rows || rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: "아이디 올바르지 않습니다.",
        });
      }

      const admin = rows[0];

      const ok = await bcrypt.compare(admin_pw, admin.password);
      if (!ok) {
        return res.status(401).json({
          success: false,
          message: "비밀번호가 올바르지 않습니다.",
        });
      }

      const token = jwt.sign({ admin_id: admin.login_id }, JWT_SECRET, {
        expiresIn: "7d",
      });

      return res.json({
        success: true,
        message: "로그인 성공",
        token,
        admin: {
          admin_id: admin.login_id,
          admin_name: admin.name,
        },
      });
    }
  );
};

// ---------------------------
// 1) 대쉬보드
// /api/admin/dashboard
// ---------------------------
exports.dashboard = (req, res) => {
  // 1) KPI (오늘/이번달 가입/신고/게시물)
  const kpiQuery = `
    SELECT
      (SELECT COUNT(*) FROM damteul_users WHERE DATE(created_at) = CURDATE() AND is_deleted = 0) AS today_users,
      (SELECT COUNT(*) FROM dam_reports WHERE DATE(created_at) = CURDATE() AND is_deleted = 0) AS today_reports,
      (SELECT COUNT(*) FROM dam_goods_posts WHERE DATE(created_at) = CURDATE() AND is_deleted = 0) AS today_goods_posts,
      (SELECT COUNT(*) FROM dam_nanum_posts WHERE DATE(created_at) = CURDATE() AND is_deleted = 0) AS today_nanum_posts,
      (SELECT COUNT(*) FROM dam_community_posts WHERE DATE(created_at) = CURDATE() AND is_deleted = 0) AS today_community_posts,

      (SELECT COUNT(*) FROM damteul_users WHERE YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE()) AND is_deleted = 0) AS month_users,
      (SELECT COUNT(*) FROM dam_reports WHERE YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE()) AND is_deleted = 0) AS month_reports,
      (SELECT COUNT(*) FROM dam_goods_posts WHERE YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE()) AND is_deleted = 0) AS month_goods_posts,
      (SELECT COUNT(*) FROM dam_nanum_posts WHERE YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE()) AND is_deleted = 0) AS month_nanum_posts,
      (SELECT COUNT(*) FROM dam_community_posts WHERE YEAR(created_at)=YEAR(CURDATE()) AND MONTH(created_at)=MONTH(CURDATE()) AND is_deleted = 0) AS month_community_posts
  `;

  // 2) 일자별 요약 (최근 7일)
  const summaryQuery = `
    SELECT
      DATE_FORMAT(d.date, '%Y-%m-%d') AS date,
      IFNULL(u.users, 0) AS users,
      IFNULL(r.reports, 0) AS reports,
      IFNULL(p.posts, 0) AS posts
    FROM (
      SELECT CURDATE() - INTERVAL n DAY AS date
      FROM (
        SELECT 0 n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL
        SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
      ) nums
    ) d
    LEFT JOIN (
      SELECT DATE(created_at) AS d, COUNT(*) AS users
      FROM damteul_users
      WHERE created_at >= CURDATE() - INTERVAL 6 DAY
        AND is_deleted = 0
      GROUP BY DATE(created_at)
    ) u ON u.d = DATE(d.date)
    LEFT JOIN (
      SELECT DATE(created_at) AS d, COUNT(*) AS reports
      FROM dam_reports
      WHERE created_at >= CURDATE() - INTERVAL 6 DAY
        AND is_deleted = 0
      GROUP BY DATE(created_at)
    ) r ON r.d = DATE(d.date)
    LEFT JOIN (
      SELECT d, COUNT(*) AS posts
      FROM (
        SELECT DATE(created_at) AS d
        FROM dam_nanum_posts
        WHERE created_at >= CURDATE() - INTERVAL 6 DAY
          AND is_deleted = 0

        UNION ALL

        SELECT DATE(created_at) AS d
        FROM dam_goods_posts
        WHERE created_at >= CURDATE() - INTERVAL 6 DAY
          AND is_deleted = 0

        UNION ALL

        SELECT DATE(created_at) AS d
        FROM dam_community_posts
        WHERE created_at >= CURDATE() - INTERVAL 6 DAY
          AND is_deleted = 0
      ) x
      GROUP BY d
    ) p ON p.d = DATE(d.date)
    ORDER BY DATE(d.date) DESC;
  `;

  // 3) 이벤트/공지 최근 N개
  const eventsQuery = `
    SELECT event_id, title, cate, DATE_FORMAT(created_at, '%Y-%m-%d') AS date
    FROM dam_event_notice
    WHERE is_deleted = 0
    ORDER BY created_at DESC
    LIMIT 5
  `;

  connection.query(kpiQuery, (err, kpiRows) => {
    if (err) {
      console.error("KPI query error:", err);
      return res.status(500).json({
        message: "대시보드 KPI 조회 실패",
        detail: err.sqlMessage || err.message,
        code: err.code || null,
      });
    }

    const k = kpiRows?.[0] || {};
    const dPosts =
      (k.today_goods_posts ?? 0) +
      (k.today_nanum_posts ?? 0) +
      (k.today_community_posts ?? 0);
    const mPosts =
      (k.month_goods_posts ?? 0) +
      (k.month_nanum_posts ?? 0) +
      (k.month_community_posts ?? 0);

    const kpiData = {
      today: {
        users: k.today_users ?? 0,
        reports: k.today_reports ?? 0,
        posts: dPosts,
      },
      month: {
        users: k.month_users ?? 0,
        reports: k.month_reports ?? 0,
        posts: mPosts,
      },
    };

    connection.query(summaryQuery, (err, summaryRows) => {
      if (err) {
        console.error("SUMMARY query error:", err);
        return res.status(500).json({
          message: "대시보드 요약 조회 실패",
          detail: err.sqlMessage || err.message,
          code: err.code || null,
        });
      }

      const summaryData = (summaryRows || []).map((row) => ({
        date: row.date,
        users: row.users ?? 0,
        reports: row.reports ?? 0,
        posts: row.posts ?? 0,
      }));

      connection.query(eventsQuery, (err, eventsRows) => {
        if (err) {
          console.error("EVENTS query error:", err);
          return res.status(500).json({
            message: "대시보드 이벤트/공지 조회 실패",
            detail: err.sqlMessage || err.message,
            code: err.code || null,
          });
        }

        const eventsData = (eventsRows || []).map((row) => ({
          id: row.event_id,
          title: row.title,
          type: row.cate,
          date: row.date,
        }));

        return res.json({ kpiData, summaryData, eventsData });
      });
    });
  });
};

// ---------------------------
// 2) 유저 목록
// /api/admin/users
// ---------------------------
exports.users = (req, res) => {
  const getUsersInfo = `
    SELECT user_id, user_nickname, level_code, reported_count, status, created_at
    FROM damteul_users
    WHERE is_deleted = 0
    ORDER BY user_id DESC
  `;
  connection.query(getUsersInfo, (err, result) => {
    if (err) {
      console.error("users 조회 오류: ", err);
      return res.status(500).json({
        success: false,
        message: "사용자 정보를 불러오는 중 오류가 발생했습니다.",
        error: err.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "사용자 목록 조회 성공",
      users: result,
    });
  });
};

// 유저 상세 (요청대로 상세는 is_deleted 조건 안 넣음)
exports.getUserDetail = (req, res) => {
  const { user_id } = req.params;

  if (!user_id) {
    return res.status(400).json({
      success: false,
      message: "user_id가 전달되지 않았습니다.",
    });
  }

  const sql = `
    SELECT
      user_id,
      user_nickname,
      level_code,
      reported_count,
      CASE status
        WHEN 0 THEN '활동중'
        WHEN 1 THEN '정지'
        WHEN 2 THEN '탈퇴'
        ELSE '기타'
      END AS status,
      created_at
    FROM damteul_users
    WHERE user_id = ?
    LIMIT 1
  `;

  connection.query(sql, [user_id], (err, rows) => {
    if (err) {
      console.error("유저 상세 조회 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "유저 상세 조회 중 서버 오류",
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "해당 user_id 유저를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      user: rows[0],
    });
  });
};

// ✅ 유저 삭제 (DELETE -> UPDATE soft delete)
exports.userDelete = (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  const sql = `
    UPDATE damteul_users
    SET is_deleted = 1
    WHERE user_id = ?
      AND is_deleted = 0
  `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      console.error("유저 소프트삭제 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "유저 삭제(소프트) 중 서버 오류",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제할 유저를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "유저 삭제(소프트) 완료",
      id,
    });
  });
};

// ---------------------------
// 3) 게시글 목록 (중고/나눔)
// ---------------------------
exports.posts = (req, res) => {
  const sql = `
    SELECT
      g.goods_id AS id,
      CASE g.category_id
        WHEN 1 THEN '티켓/교환권'
        WHEN 2 THEN '의류'
        WHEN 3 THEN '뷰티/미용'
        WHEN 4 THEN '유아용품'
        WHEN 5 THEN '도서'
        WHEN 6 THEN '스포츠/레저'
        WHEN 7 THEN '디지털기기'
      END AS category,
      g.title AS title,
      u.user_nickname AS author,
      DATE_FORMAT(g.created_at, '%Y-%m-%d') AS created_at,
      CASE g.condition_type
        WHEN 0 THEN '중고상품'
        WHEN 1 THEN '새상품'
        ELSE '기타'
      END AS product_state,
      'goods' AS post_type
    FROM dam_goods_posts g
    JOIN damteul_users u ON u.user_id = g.user_id
    WHERE g.is_deleted = 0

    UNION ALL

    SELECT
      n.nanum_id AS id,
      '나눔' AS category,
      n.title AS title,
      u.user_nickname AS author,
      DATE_FORMAT(n.created_at, '%Y-%m-%d') AS created_at,
      CASE n.status
        WHEN 0 THEN '나눔중'
        WHEN 1 THEN '나눔완료'
        ELSE '기타'
      END AS product_state,
      'nanum' AS post_type
    FROM dam_nanum_posts n
    JOIN damteul_users u ON u.user_id = n.user_id
    WHERE n.is_deleted = 0

    ORDER BY created_at DESC;
  `;

  connection.query(sql, (err, result) => {
    if (err) {
      console.error("posts 조회 오류:", err);
      return res.status(500).json({
        success: false,
        message: "게시판 정보를 불러오는 중 오류가 발생했습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "게시판 목록 조회 성공",
      posts: result,
    });
  });
};

// 게시글 상세 (요청대로 상세는 is_deleted 조건 안 넣음)
exports.getPostDetail = (req, res) => {
  const { cate, id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  const sql =
    cate === "goods"
      ? `SELECT
          g.goods_id AS id,
          u.user_nickname AS author,
          g.title AS title,
          g.content AS content,
          DATE_FORMAT(g.created_at,'%Y-%m-%d') AS created_at,
          CASE g.condition_type
            WHEN 0 THEN '중고상품'
            WHEN 1 THEN '새상품'
            ELSE '기타'
          END AS product_state
        FROM dam_goods_posts g
        JOIN damteul_users u ON u.user_id = g.user_id
        WHERE g.goods_id = ?
        LIMIT 1`
      : `SELECT
          n.nanum_id AS id,
          u.user_nickname AS author,
          n.title AS title,
          n.content AS content,
          DATE_FORMAT(n.created_at, '%Y-%m-%d') AS created_at,
          CASE n.status
            WHEN 0 THEN '나눔중'
            WHEN 1 THEN '나눔완료'
            ELSE '기타'
          END AS product_state
        FROM dam_nanum_posts n
        JOIN damteul_users u ON u.user_id = n.user_id
        WHERE n.nanum_id = ?
        LIMIT 1`;

  connection.query(sql, [id], (err, rows) => {
    if (err) {
      console.error("게시물 상세 조회 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "게시물 상세 조회 중 서버 오류",
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "해당 id의 게시물을 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      post: rows[0],
    });
  });
};

// ✅ 게시글 삭제 (DELETE -> UPDATE soft delete)
exports.postDelete = (req, res) => {
  const { url, id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  const sql =
    url === "goods"
      ? `
        UPDATE dam_goods_posts
        SET is_deleted = 1
        WHERE goods_id = ?
          AND is_deleted = 0
      `
      : `
        UPDATE dam_nanum_posts
        SET is_deleted = 1
        WHERE nanum_id = ?
          AND is_deleted = 0
      `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      console.error("게시물 소프트삭제 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "게시물 삭제(소프트) 중 서버 오류",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제할 게시물을 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "게시물 삭제(소프트) 완료",
      id,
    });
  });
};

// ---------------------------
// 4) 신고 목록
// ---------------------------
exports.reports = (req, res) => {
  const getReportsInfo = `
    SELECT 
      r.report_id AS id,
      u_reported.user_nickname AS reported,
      u_reporter.user_nickname AS reporter,
      r.target_type,
      CASE r.target_type
        WHEN 0 THEN '중고거래'
        WHEN 1 THEN '커뮤니티'
        ELSE '기타'
      END AS category,
      CASE r.status
        WHEN 0 THEN '처리중'
        WHEN 1 THEN '완료'
        ELSE '기타'
      END AS status,
      DATE_FORMAT(r.created_at, '%Y-%m-%d') AS created_at
    FROM dam_reports r
    JOIN damteul_users u_reported ON u_reported.user_id = r.writer_user_id
    JOIN damteul_users u_reporter ON u_reporter.user_id = r.reporter_user_id
    WHERE r.is_deleted = 0
    ORDER BY r.report_id DESC;
  `;

  connection.query(getReportsInfo, (err, result) => {
    if (err) {
      console.error("reports 조회 오류: ", err);
      return res.status(500).json({
        success: false,
        message: "신고 정보를 불러오는 중 오류가 발생했습니다.",
        error: err.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "신고 목록 조회 성공",
      reports: result,
    });
  });
};

// 신고 상세 (상세는 is_deleted 조건 안 넣음)
exports.getReportsDetail = (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  const sql = `
    SELECT 
      r.report_id AS id,
      u_reported.user_nickname AS reported,
      u_reporter.user_nickname AS reporter,
      r.target_type,
      CASE r.target_type
        WHEN 0 THEN '중고거래'
        WHEN 1 THEN '커뮤니티'
        ELSE '기타'
      END AS category,
      CASE r.processing_result
        WHEN 0 THEN '무효'
        WHEN 1 THEN '경고'
        WHEN 2 THEN '정지'
        ELSE '처리중'
      END AS processing_result,
      CASE r.reason
        WHEN 0 THEN '상품 상태 설명과 다릅니다.'
        WHEN 1 THEN '도배성 게시글 같습니다.'
        WHEN 2 THEN '욕설/비방 표현이 있어요.'
        WHEN 3 THEN '가격이 지나치게 비싸요(사기 의심).'
        WHEN 4 THEN '허위 매물로 의심됩니다.'
      END AS reason,
      DATE_FORMAT(r.created_at, '%Y-%m-%d') AS created_at
    FROM dam_reports r
    JOIN damteul_users u_reported ON u_reported.user_id = r.writer_user_id
    JOIN damteul_users u_reporter ON u_reporter.user_id = r.reporter_user_id
    WHERE r.report_id = ?
    LIMIT 1
  `;

  connection.query(sql, [id], (err, rows) => {
    if (err) {
      console.error("신고 상세 조회 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "신고 상세 조회 중 서버 오류",
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "해당 report_id 유저를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      report: rows[0],
    });
  });
};

// 상태 변경 (너 코드 그대로 유지)
exports.updateReportsDetail = (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  connection.getConnection((connErr, conn) => {
    if (connErr) {
      console.error("❌ getConnection 에러:", connErr);
      return res.status(500).json({
        success: false,
        message: "서버 오류(DB 커넥션 획득 실패)",
      });
    }

    conn.beginTransaction((txErr) => {
      if (txErr) {
        console.error("❌ beginTransaction 에러:", txErr);
        conn.release();
        return res.status(500).json({
          success: false,
          message: "서버 오류(트랜잭션 시작 실패)",
        });
      }

      const selectSql = `
        SELECT report_id, writer_user_id, processing_result
        FROM dam_reports
        WHERE report_id = ?
        FOR UPDATE
      `;

      conn.query(selectSql, [id], (selErr, rows) => {
        if (selErr) {
          console.error("❌ 조회 SQL 에러:", selErr);
          return conn.rollback(() => {
            conn.release();
            res.status(500).json({ success: false, message: "서버 오류(조회 실패)" });
          });
        }

        if (!rows || rows.length === 0) {
          return conn.rollback(() => {
            conn.release();
            res.status(404).json({
              success: false,
              message: "수정할 신고 정보를 찾을 수 없습니다.",
            });
          });
        }

        const report = rows[0];
        const writerUserId = report.writer_user_id;
        const prevProcessingResult = report.processing_result;

        const updateReportSql = `
          UPDATE dam_reports
          SET
            processing_result = ?,
            status = CASE WHEN ? IS NULL THEN status ELSE 1 END
          WHERE report_id = ?
        `;

        conn.query(updateReportSql, [status, status, id], (updErr, updResult) => {
          if (updErr) {
            console.error("❌ 수정 SQL 에러:", updErr);
            return conn.rollback(() => {
              conn.release();
              res.status(500).json({
                success: false,
                message: "신고 수정 중 서버 오류",
              });
            });
          }

          if (updResult.affectedRows === 0) {
            return conn.rollback(() => {
              conn.release();
              res.status(404).json({
                success: false,
                message: "수정할 신고 정보를 찾을 수 없습니다.",
              });
            });
          }

          const shouldInc = Number(status) === 1 && prevProcessingResult === null;

          const commitAndReturn = (reported_count_increased) => {
            conn.commit((cErr) => {
              if (cErr) {
                console.error("❌ commit 에러:", cErr);
                return conn.rollback(() => {
                  conn.release();
                  res.status(500).json({ success: false, message: "서버 오류(커밋 실패)" });
                });
              }

              conn.release();
              return res.status(200).json({
                success: true,
                message: "신고 상태 수정 완료",
                id,
                reported_count_increased,
              });
            });
          };

          if (!shouldInc) return commitAndReturn(false);

          const incUserSql = `
            UPDATE damteul_users
            SET reported_count = COALESCE(reported_count, 0) + 1
            WHERE user_id = ?
          `;

          conn.query(incUserSql, [writerUserId], (incErr, incResult) => {
            if (incErr) {
              console.error("❌ reported_count 증가 에러:", incErr);
              return conn.rollback(() => {
                conn.release();
                res.status(500).json({
                  success: false,
                  message: "서버 오류(유저 신고 카운트 증가 실패)",
                });
              });
            }

            if (incResult.affectedRows === 0) {
              return conn.rollback(() => {
                conn.release();
                res.status(404).json({
                  success: false,
                  message: "신고 대상 유저를 찾을 수 없습니다.",
                });
              });
            }

            return commitAndReturn(true);
          });
        });
      });
    });
  });
};

// ✅ 신고 삭제 (DELETE -> UPDATE soft delete)
exports.reportDelete = (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  const sql = `
    UPDATE dam_reports
    SET is_deleted = 1
    WHERE report_id = ?
      AND is_deleted = 0
  `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      console.error("신고 소프트삭제 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "신고 삭제(소프트) 중 서버 오류",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제할 신고 정보를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "신고 삭제(소프트) 완료",
      id,
    });
  });
};

// ---------------------------
// 5) 거래 목록
// ---------------------------
exports.trades = (req, res) => {
  const getTradesInfo = `
    SELECT
      t.tx_id AS id,
      g.title AS product,
      u_buyer.user_nickname AS buyer,
      u_seller.user_nickname AS seller,
      CASE t.tx_type
        WHEN 0 THEN '직거래'
        WHEN 1 THEN '택배'
        ELSE '기타'
      END AS method,
      t.final_price AS price,
      DATE_FORMAT(t.created_at, '%Y-%m-%d') AS created_at
    FROM dam_transactions t
    JOIN dam_goods_posts g ON g.goods_id = t.goods_id
    JOIN damteul_users u_buyer ON u_buyer.user_id = t.buyer_id
    JOIN damteul_users u_seller ON u_seller.user_id = t.seller_id
    WHERE t.is_deleted = 0
    ORDER BY t.tx_id DESC;
  `;

  connection.query(getTradesInfo, (err, result) => {
    if (err) {
      console.error("trades 조회 오류: ", err);
      return res.status(500).json({
        success: false,
        message: "거래 정보를 불러오는 중 오류가 발생했습니다.",
        error: err.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "거래 목록 조회 성공",
      trades: result,
    });
  });
};

// 거래상세 (상세는 is_deleted 조건 안 넣음)
exports.getTradesDeatail = (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  const sql = `
    SELECT
      t.tx_id AS id,
      g.title AS product,
      g.content AS content,
      u_buyer.user_nickname AS buyer,
      u_seller.user_nickname AS seller,
      CASE t.tx_type
        WHEN 0 THEN '직거래'
        WHEN 1 THEN '택배'
        ELSE '기타'
      END AS method,
      t.final_price AS price,
      DATE_FORMAT(t.created_at, '%Y-%m-%d') AS created_at
    FROM dam_transactions t
    JOIN dam_goods_posts g ON g.goods_id = t.goods_id
    JOIN damteul_users u_buyer ON u_buyer.user_id = t.buyer_id
    JOIN damteul_users u_seller ON u_seller.user_id = t.seller_id
    WHERE t.tx_id = ?
    LIMIT 1
  `;

  connection.query(sql, [id], (err, rows) => {
    if (err) {
      console.error("거래 상세 조회 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "거래 상세 조회 중 서버 오류",
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "해당 tx_id 유저를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      trade: rows[0],
    });
  });
};

// ✅ 거래 삭제 (DELETE -> UPDATE soft delete)
exports.tradeDelete = (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  const sql = `
    UPDATE dam_transactions
    SET is_deleted = 1
    WHERE tx_id = ?
      AND is_deleted = 0
  `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      console.error("거래 소프트삭제 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "거래 삭제(소프트) 중 서버 오류",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제할 거래 정보를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "거래 삭제(소프트) 완료",
      id,
    });
  });
};

// ---------------------------
// 6) 커뮤니티 목록
// ---------------------------
exports.community = (req, res) => {
  const getCommunityInfo = `
    SELECT
      c.post_id AS id,
      u.user_nickname AS user,
      c.title,
      CASE c.cate
        WHEN 1 THEN '티켓/교환권'
        WHEN 2 THEN '의류'
        WHEN 3 THEN '뷰티/미용'
        WHEN 4 THEN '유아용품'
        WHEN 5 THEN '도서'
        WHEN 6 THEN '스포츠/레저'
        WHEN 7 THEN '디지털기기'
        ELSE '기타'
      END AS category,
      DATE_FORMAT(c.created_at, '%Y-%m-%d') AS created_at
    FROM dam_community_posts c
    JOIN damteul_users u ON u.user_id = c.user_id
    WHERE c.is_deleted = 0
    ORDER BY c.post_id DESC;
  `;

  connection.query(getCommunityInfo, (err, result) => {
    if (err) {
      console.error("community 조회 오류: ", err);
      return res.status(500).json({
        success: false,
        message: "커뮤니티 정보를 불러오는 중 오류가 발생했습니다.",
        error: err.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "커뮤니티 목록 조회 성공",
      community: result,
    });
  });
};

// 커뮤니티 상세 (상세는 is_deleted 조건 안 넣음)
exports.getCommunityDetail = (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  const sql = `
    SELECT
      u.user_nickname AS author,
      c.title,
      c.content,
      CASE c.cate
        WHEN 1 THEN '티켓/교환권'
        WHEN 2 THEN '의류'
        WHEN 3 THEN '뷰티/미용'
        WHEN 4 THEN '유아용품'
        WHEN 5 THEN '도서'
        WHEN 6 THEN '스포츠/레저'
        WHEN 7 THEN '디지털기기'
        ELSE '기타'
      END AS category,
      DATE_FORMAT(c.created_at,'%Y-%m-%d') AS created_at
    FROM dam_community_posts c
    JOIN damteul_users u ON u.user_id = c.user_id
    WHERE c.post_id = ?
    LIMIT 1
  `;

  connection.query(sql, [id], (err, rows) => {
    if (err) {
      console.error("커뮤니티 상세 조회 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "커뮤니티 상세 조회 중 서버 오류",
      });
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "해당 post_id 유저를 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      community: rows[0],
    });
  });
};

// ✅ 커뮤니티 삭제 (DELETE -> UPDATE soft delete)
exports.communityDelete = (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({
      success: false,
      message: "id가 전달되지 않았습니다.",
    });
  }

  const sql = `
    UPDATE dam_community_posts
    SET is_deleted = 1
    WHERE post_id = ?
      AND is_deleted = 0
  `;

  connection.query(sql, [id], (err, result) => {
    if (err) {
      console.error("커뮤니티 소프트삭제 SQL 에러:", err);
      return res.status(500).json({
        success: false,
        message: "게시물 삭제(소프트) 중 서버 오류",
      });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "삭제할 게시물을 찾을 수 없습니다.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "게시물 삭제(소프트) 완료",
      id,
    });
  });
};
