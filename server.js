// backend/server.js
// 서버 켜는 역할
// env 파일
require("dotenv").config();
const app = require("./src/app");

// 포트번호 가져오기 - 포트번호가 빈값이면 9070을 가져와라
const PORT = process.env.PORT || 9070;

// listen
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});