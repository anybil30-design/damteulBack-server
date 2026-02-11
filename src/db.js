// backend/src/db.js
require("dotenv").config();
// mysql 사용하기
const mysql = require("mysql");

const connection = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT || 3306),
});

// ✅ pool 연결 테스트(서버 시작 시 한번 확인)
connection.getConnection((err, conn) => {
  if (err) {
    console.error("❌ DB connection failed:", err);
    return;
  }
  console.log("✅ DB connected!");
  conn.release();
});

module.exports = connection;