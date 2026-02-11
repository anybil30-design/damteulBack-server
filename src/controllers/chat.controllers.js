const pool = require("../db");

/** =========================
 * Promise 래퍼 (pool 전용)
 * - 트랜잭션 필요 없는 조회용
 * ========================= */
function qPool(sql, params = []) {
  return new Promise((resolve, reject) => {
    pool.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/** =========================
 * Promise 래퍼 (conn 전용)
 * - 트랜잭션 내부에서만 사용
 * ========================= */
function qConn(conn, sql, params = []) {
  return new Promise((resolve, reject) => {
    conn.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/** =========================
 * goods_id -> seller_id 조회 (pool로 OK)
 * ========================= */
async function getSellerIdByGoodsId(goodsId) {
  const rows = await qPool(
    `
    SELECT user_id AS seller_id
    FROM dam_goods_posts
    WHERE goods_id = ?
    LIMIT 1
    `,
    [goodsId]
  );
  return rows?.[0]?.seller_id ?? null;
}

/** =========================
 * (읽음처리용) 최신 메시지 id (pool로 OK)
 * ========================= */
async function getLatestMessageId(chat_id) {
  const rows = await qPool(
    `
    SELECT IFNULL(MAX(message_id), 0) AS maxId
    FROM dam_chat_messages
    WHERE chat_id = ?
    `,
    [chat_id]
  );
  return Number(rows?.[0]?.maxId ?? 0);
}

/** =========================
 * 읽음 처리 (pool로 OK)
 * ========================= */
async function markReadToLatest(chat_id, user_id) {
  const latestId = await getLatestMessageId(chat_id);
  const newLastRead = latestId > 0 ? latestId : null;

  await qPool(
    `
    INSERT INTO dam_chat_room_user_state
      (chat_id, user_id, last_read_message_id, last_read_at, created_at)
    VALUES
      (?, ?, ?, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
      last_read_message_id =
        CASE
          WHEN VALUES(last_read_message_id) IS NULL THEN last_read_message_id
          ELSE GREATEST(IFNULL(last_read_message_id, 0), VALUES(last_read_message_id))
        END,
      last_read_at = NOW()
    `,
    [chat_id, user_id, newLastRead]
  );

  return newLastRead;
}

/** =========================
 * 1) 방 조회
 * GET /api/chat/room?goods_id=17&buyer_id=29
 * ========================= */
exports.getRoomByGoodsAndBuyer = async (req, res) => {
  const goods_id = Number(req.query.goods_id);
  const buyer_id = Number(req.query.buyer_id);

  if (!goods_id || !buyer_id) {
    return res.status(400).json({
      success: false,
      message: "goods_id, buyer_id가 필요합니다.",
    });
  }

  try {
    const seller_id = await getSellerIdByGoodsId(goods_id);
    if (!seller_id) {
      return res.status(404).json({
        success: false,
        message: "해당 goods_id의 판매자를 찾을 수 없습니다.",
      });
    }

    const rows = await qPool(
      `
      SELECT chat_id
      FROM dam_chat_rooms
      WHERE goods_id = ? AND buyer_id = ? AND seller_id = ?
      LIMIT 1
      `,
      [goods_id, buyer_id, seller_id]
    );

    const chat_id = rows?.[0]?.chat_id ?? null;

    return res.json({
      success: true,
      chat_id,
      seller_id,
    });
  } catch (err) {
    console.error("getRoomByGoodsAndBuyer error:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
};

/** =========================
 * 2) 메시지 조회 + 자동 읽음처리
 * GET /api/chat/messages?chat_id=123&user_id=29
 * ========================= */
exports.getMessagesByChatId = async (req, res) => {
  const chat_id = Number(req.query.chat_id);
  const user_id = Number(req.query.user_id);

  if (!chat_id) {
    return res.status(400).json({ success: false, message: "chat_id가 필요합니다." });
  }
  if (!user_id) {
    return res.status(400).json({ success: false, message: "user_id가 필요합니다." });
  }

  try {
    const rows = await qPool(
      `
      SELECT
        m.message_id AS id,
        m.user_id,
        u.user_nickname AS nickname,
        m.content AS text,
        m.created_at AS createdAt
      FROM dam_chat_messages m
      JOIN damteul_users u ON u.user_id = m.user_id
      WHERE m.chat_id = ?
      ORDER BY m.message_id ASC
      `,
      [chat_id]
    );

    const lastReadMessageId = await markReadToLatest(chat_id, user_id);

    return res.json({
      success: true,
      messages: rows || [],
      lastReadMessageId,
    });
  } catch (err) {
    console.error("getMessagesByChatId error:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
};

/** =========================
 * 3) 첫 메시지: 방 생성 + 첫 메시지 저장 (트랜잭션)
 * POST /api/chat/send-first
 * body: { goods_id, buyer_id, content }
 * ========================= */
exports.sendFirstMessage = async (req, res) => {
  const { goods_id, buyer_id, content } = req.body;

  if (!goods_id || !buyer_id || !content?.trim()) {
    return res.status(400).json({
      success: false,
      message: "goods_id, buyer_id, content가 필요합니다.",
    });
  }

  const conn = await new Promise((resolve, reject) => {
    pool.getConnection((err, c) => (err ? reject(err) : resolve(c)));
  });

  try {
    const seller_id = await getSellerIdByGoodsId(goods_id);
    if (!seller_id) {
      conn.release();
      return res.status(404).json({
        success: false,
        message: "해당 goods_id의 판매자를 찾을 수 없습니다.",
      });
    }

    await qConn(conn, "START TRANSACTION");

    // ✅ 방 upsert (UNIQUE KEY(goods_id,buyer_id,seller_id) 필요)
    const roomResult = await qConn(
      conn,
      `
      INSERT INTO dam_chat_rooms (goods_id, buyer_id, seller_id, created_at)
      VALUES (?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE chat_id = LAST_INSERT_ID(chat_id)
      `,
      [goods_id, buyer_id, seller_id]
    );

    // ✅ 같은 conn에서 실행되므로 insertId가 안전
    const chat_id = Number(roomResult.insertId);

    // user_state 최초 생성(없으면 생성)
    await qConn(
      conn,
      `
      INSERT IGNORE INTO dam_chat_room_user_state (chat_id, user_id, created_at)
      VALUES (?, ?, NOW()), (?, ?, NOW())
      `,
      [chat_id, buyer_id, chat_id, seller_id]
    );

    // 메시지 저장
    const msgResult = await qConn(
      conn,
      `
      INSERT INTO dam_chat_messages (chat_id, user_id, content, created_at)
      VALUES (?, ?, ?, NOW())
      `,
      [chat_id, buyer_id, content.trim()]
    );
    const message_id = Number(msgResult.insertId);

    // created_at 조회 (굳이 다시 SELECT 안 해도 되지만 유지)
    const timeRows = await qConn(
      conn,
      `SELECT created_at AS createdAt FROM dam_chat_messages WHERE message_id = ? LIMIT 1`,
      [message_id]
    );
    const createdAt = timeRows?.[0]?.createdAt ?? null;

    // last_message 갱신
    await qConn(
      conn,
      `
      UPDATE dam_chat_rooms
      SET last_message_id = ?, last_message_at = NOW()
      WHERE chat_id = ?
      `,
      [message_id, chat_id]
    );

    // 보낸 사람(buyer)은 읽음 처리
    await qConn(
      conn,
      `
      INSERT INTO dam_chat_room_user_state
        (chat_id, user_id, last_read_message_id, last_read_at, created_at)
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        last_read_message_id = GREATEST(IFNULL(last_read_message_id, 0), VALUES(last_read_message_id)),
        last_read_at = NOW()
      `,
      [chat_id, buyer_id, message_id]
    );

    await qConn(conn, "COMMIT");
    conn.release();

    return res.json({
      success: true,
      chat_id,
      message_id,
      createdAt,
      seller_id,
      message: "첫 메시지 전송 + 채팅방 생성(필요 시) 완료",
    });
  } catch (err) {
    try {
      await qConn(conn, "ROLLBACK");
    } catch (e) {}
    conn.release();

    console.error("sendFirstMessage error:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
};

/** =========================
 * 4) 두번째 메시지부터: chat_id로 메시지 저장 (트랜잭션)
 * POST /api/chat/send
 * body: { chat_id, user_id, content }
 * ========================= */
exports.sendMessage = async (req, res) => {
  const { chat_id, user_id, content } = req.body;

  if (!chat_id || !user_id || !content?.trim()) {
    return res.status(400).json({
      success: false,
      message: "chat_id, user_id, content가 필요합니다.",
    });
  }

  const conn = await new Promise((resolve, reject) => {
    pool.getConnection((err, c) => (err ? reject(err) : resolve(c)));
  });

  try {
    await qConn(conn, "START TRANSACTION");

    const msgResult = await qConn(
      conn,
      `
      INSERT INTO dam_chat_messages (chat_id, user_id, content, created_at)
      VALUES (?, ?, ?, NOW())
      `,
      [chat_id, user_id, content.trim()]
    );
    const message_id = Number(msgResult.insertId);

    const timeRows = await qConn(
      conn,
      `SELECT created_at AS createdAt FROM dam_chat_messages WHERE message_id = ? LIMIT 1`,
      [message_id]
    );
    const createdAt = timeRows?.[0]?.createdAt ?? null;

    await qConn(
      conn,
      `
      UPDATE dam_chat_rooms
      SET last_message_id = ?, last_message_at = NOW()
      WHERE chat_id = ?
      `,
      [message_id, chat_id]
    );

    await qConn(
      conn,
      `
      INSERT INTO dam_chat_room_user_state
        (chat_id, user_id, last_read_message_id, last_read_at, created_at)
      VALUES (?, ?, ?, NOW(), NOW())
      ON DUPLICATE KEY UPDATE
        last_read_message_id = GREATEST(IFNULL(last_read_message_id, 0), VALUES(last_read_message_id)),
        last_read_at = NOW()
      `,
      [chat_id, user_id, message_id]
    );

    await qConn(conn, "COMMIT");
    conn.release();

    return res.json({
      success: true,
      chat_id,
      message_id,
      createdAt,
      message: "메시지 전송 완료",
    });
  } catch (err) {
    try {
      await qConn(conn, "ROLLBACK");
    } catch (e) {}
    conn.release();

    console.error("sendMessage error:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
};

/** =========================
 * 5) 내 채팅방 목록
 * GET /api/chat/rooms?user_id=29
 * ========================= */
exports.getMyChatRooms = async (req, res) => {
  const user_id = Number(req.query.user_id);
  if (!user_id) {
    return res.status(400).json({ success: false, message: "user_id가 필요합니다." });
  }

  try {
    const rows = await qPool(
      `
      SELECT
        r.chat_id,
        r.goods_id,
        r.buyer_id,
        r.seller_id,
        r.last_message_at AS lastMessageAt,
        lm.content AS lastText,

        CASE WHEN r.buyer_id = ? THEN u_s.user_id ELSE u_b.user_id END AS otherUserId,
        CASE WHEN r.buyer_id = ? THEN u_s.user_nickname ELSE u_b.user_nickname END AS otherNickname,
        CASE WHEN r.buyer_id = ? THEN u_s.profile ELSE u_b.profile END AS otherProfile,

        IFNULL(us.last_read_message_id, 0) AS lastReadMessageId,

        (
          SELECT COUNT(*)
          FROM dam_chat_messages mm
          WHERE mm.chat_id = r.chat_id
            AND mm.user_id <> ?
            AND mm.message_id > IFNULL(us.last_read_message_id, 0)
        ) AS unreadCount

      FROM dam_chat_rooms r
      LEFT JOIN dam_chat_messages lm
        ON lm.message_id = r.last_message_id

      JOIN damteul_users u_b ON u_b.user_id = r.buyer_id
      JOIN damteul_users u_s ON u_s.user_id = r.seller_id

      LEFT JOIN dam_chat_room_user_state us
        ON us.chat_id = r.chat_id AND us.user_id = ?

      WHERE (r.buyer_id = ? OR r.seller_id = ?)
        AND (us.left_at IS NULL OR us.user_id IS NULL)
      ORDER BY r.last_message_at DESC, r.chat_id DESC
      `,
      [user_id, user_id, user_id, user_id, user_id, user_id, user_id]
    );

    return res.json({ success: true, rooms: rows || [] });
  } catch (err) {
    console.error("getMyChatRooms error:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
};

/** =========================
 * 6) 읽음 처리
 * POST /api/chat/mark-read
 * body: { chat_id, user_id }
 * ========================= */
exports.markChatRead = async (req, res) => {
  const chat_id = Number(req.body.chat_id);
  const user_id = Number(req.body.user_id);

  if (!chat_id || !user_id) {
    return res.status(400).json({ success: false, message: "chat_id, user_id가 필요합니다." });
  }

  try {
    const lastReadMessageId = await markReadToLatest(chat_id, user_id);
    return res.json({ success: true, chat_id, user_id, lastReadMessageId });
  } catch (err) {
    console.error("markChatRead error:", err);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
};
