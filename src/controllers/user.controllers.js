// user관련 작업
const connection = require("../db");
const userJwt = require('jsonwebtoken');
const SECRET_KEY = 'user1234';

// 회원가입
// /api/user/register
exports.register = (req, res) => {
  const { user_name, user_nickname, user_phone, address } = req.body;

  // 1. 서버 유효성 검사
  if (!user_name || !user_nickname || !user_phone || !address) {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "필수 값이 누락되었습니다.",
    });
  }

  // 2. 중복 체크 (전화번호 OR 닉네임)
  const checkRes = `
    SELECT user_phone, user_nickname
    FROM damteul_users
    WHERE user_phone = ? OR user_nickname = ?
  `;

  connection.query(
    checkRes,
    [user_phone, user_nickname],
    (err, results) => {
      if (err) {
        return res.status(500).json({
          code: "DB_ERROR",
          message: "DB 오류가 발생했습니다.",
        });
      }

      // ✅ 중복 에러 누적용 객체
      const errors = {};

      results.forEach((row) => {
        if (row.user_phone === user_phone) {
          errors.user_phone = "이미 사용 중인 전화번호입니다.";
        }
        if (row.user_nickname === user_nickname) {
          errors.user_nickname = "이미 사용 중인 닉네임입니다.";
        }
      });

      // ✅ 중복이 하나라도 있으면 여기서 종료
      if (Object.keys(errors).length > 0) {
        return res.status(409).json({
          code: "DUPLICATE",
          errors,
        });
      }

      // 3. 중복 없으면 INSERT
      const insertRes = `
        INSERT INTO damteul_users (user_name, user_nickname, user_phone, address)
        VALUES (?, ?, ?, ?)
      `;

      connection.query(
        insertRes,
        [user_name, user_nickname, user_phone, address],
        (err2, result2) => {
          if (err2) {
            if (err2.code === "ER_DUP_ENTRY") {
              return res.status(409).json({
                code: "DUPLICATE",
                message: "이미 사용 중인 값이 있습니다.",
              });
            }
            return res.status(500).json({
              code: "DB_ERROR",
              message: "회원가입 저장 중 오류가 발생했습니다.",
            });
          }

          const user_id = result2.insertId;

          const userToken = userJwt.sign(
            {
              user_id,
              user_nickname,
            },
            SECRET_KEY,
            { expiresIn: "1h" }
          );

          return res.status(201).json({
            ok: true,
            userToken,
          });
        }
      );
    }
  );
};


// 로그인
// /api/uset/login
exports.login = (req, res) => {
  const { user_name, user_phone } = req.body;

  // 1. 서버 유효성 검사
  if (!user_name || !user_phone) {
    return res.status(400).json({
      code: "VALIDATION_ERROR",
      message: "필수 값이 누락되었습니다.",
    });
  }

  // 2. 로그인 체크
  const checkLogin = `
    SELECT * FROM damteul_users
    WHERE user_phone = ?
  `;

  connection.query(checkLogin,[user_phone], (err, results)=>{
    if(err){
      return res.status(500).json({
        code: "DB_ERROR",
        message: "DB오류가 발생했습니다.",
      });
    }

    // 값이 없는 경우
    if (results.length === 0){
      return res.status(401).json({
        code: "DUPLICATE",
        message: "해당 회원 정보가 조회되지 않습니다. 다시 시도해주세요."
      })
    }
    const user = results[0];

    // 일치 하지 않을경우
    if(user_name.trim()!==user.user_name){
      return res.status(401).json({
        code: "DUPLICATE",
        message: "해당 회원 정보가 조회되지 않습니다. 다시 시도해주세요."
      });
    }


    // 일치시 토큰생성
    const userToken = userJwt.sign({user_id:user.user_id, user_nickname:user.user_nickname},SECRET_KEY,{
        expiresIn:'1h'
    });

    return res.status(200).json({
      ok:true,
      userToken
    });
  });
}