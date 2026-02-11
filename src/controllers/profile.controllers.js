const db = require("../db");

// 프로필 정보 가져오기
exports.getProfile = (req, res) => {
  const { user_id } = req.params;
  const sql = "SELECT * FROM damteul_users WHERE user_id = ?";

  db.query(sql, [user_id], (err, result) => {
    if (err) {
      console.error("프로필 데이터 전체 로드 실패:", err);
      return res.status(500).json({ error: "DB 조회 오류" });
    }
    if (result.length === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }
    // 모든 컬럼 데이터가 담긴 객체 하나를 반환
    res.status(200).json(result[0]);
  });
};

// 닉네임 변경
exports.updateNickname = (req, res) => {
  const { user_id, newNickname } = req.body;
	// 중복 확인
	const checkSql = "SELECT COUNT(*) AS count FROM damteul_users WHERE user_nickname=? AND user_id != ?";

	db.query(checkSql, [newNickname, user_id], (err, checkResult) => {
		if(err){
			console.error("중복 체크 실패 : ", err);
			return res.status(500).json({error: "DB 조회 오류"});
		}
		if(checkResult[0].count>0){
			return res.status(400).json({message:"이미 사용 중인 닉네임입니다."});
		}
	// 중복 없을 시 닉네임 변경 진행
  const sql = "UPDATE damteul_users SET user_nickname = ? WHERE user_id = ?";

  db.query(sql, [newNickname, user_id], (err, result) => {
    if (err) {
      console.error("닉네임 변경 실패:", err);
      return res.status(500).json({ error: "DB 업데이트 오류" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }
    res.status(200).json({ message: "닉네임이 변경되었습니다." });
  });
	});
};