const connection = require("../db");

exports.searchAddresses = (req, res) => {
  // 1) 사용자가 입력한 검색어 가져오기
  // 예: /api/addresses?q=역삼 -> q = "역삼"
  const q = (req.query.q || "").trim();

  // 2) limit 가져오기 (없으면 10개)
  // limit이 너무 큰 값으로 들어오면 서버 부담이라 최대 30으로 제한
  const limit = Math.min(parseInt(req.query.limit || "10", 10), 30);

  // 3) 검색어가 비었으면 그냥 빈 배열 반환 (자동완성 목록 없음)
  if (!q) {
    return res.json({ ok: true, items: [] });
  }

    // ✅ 공백 제거한 검색어
  const qNoSpace = q.replace(/\s+/g, "");

  /**
   * ✅ 검색 방식 설명
   * - full_name LIKE '%역삼%' : "어디에든 역삼이 들어가면" 찾기 (연관검색어 느낌)
   * - is_active=1 : 활성 데이터만
   * - ORDER BY:
   *   - full_name이 "검색어로 시작"하면 더 위로 올림 (서울... 역삼... 보다 "역삼"으로 시작하는게 있다면)
   */

  // addr_id -> 찾기 위한 키
  // full_name -> 출력 내용
  // 시도,시군구,읍면동 -> 검색 키워드

  const sql = `
    SELECT addr_id, full_name, 시도, 시군구, 읍면동
    FROM damteul_addresses
    WHERE is_active = 1
      AND REPLACE(full_name, ' ', '') LIKE ?
    ORDER BY
      CASE WHEN REPLACE(full_name, ' ', '') LIKE ? THEN 0 ELSE 1 END,
      full_name ASC
    LIMIT ?
  `;

  // 포함 검색: %q%
  const likeContains = `%${qNoSpace}%`;
  // 시작 검색: q%
  const likeStarts = `${qNoSpace}%`;

  // 4) MySQL 실행
  connection.query(sql, [likeContains, likeStarts, limit], (err, rows) => {
    if (err) {
      console.error("주소 검색 DB 에러:", err);
      return res.status(500).json({ ok: false, message: "DB_ERROR" });
    }

    // 5) 결과 반환
    return res.json({ ok: true, items: rows });
  });
}