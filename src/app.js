const express = require("express");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");

// routes 및 미들웨어 불러오기
const apiRoutes = require("./routes");
const notFound = require("./middlewares/notFound.middleware");
const errorHandler = require("./middlewares/error.middleware");

const app = express();

// ✅ 1. 공통 미들웨어 세팅
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ 2. 정적 파일 통로 설정
// "URL이 /uploads/...로 오면, 서버의 uploads/... 폴더에서 파일을 찾아 응답"
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ✅ 3. Multer 상세 설정 (이미지 전용)
const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"]);
const ALLOWED_MIME_PREFIX = ["image/"];

const storage = (folder) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      // app.js 위치가 src 폴더 안이므로 상위 폴더의 uploads를 가리킴
      const uploadPath = path.join(process.cwd(), "uploads", folder);

      // 폴더 없으면 자동 생성
      if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
      }
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      // 파일 이름 중복 방지: 시간값 + 랜덤값
      const savedName = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, savedName);
    },
  });



// const multer = require("multer");
const upload = (folder) => multer({
  storage: storage(folder),

  //파일 필터 (mimetype + 확장자 둘 다 체크)
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = (file.mimetype || "").toLowerCase();

    const mimeOk = ALLOWED_MIME_PREFIX.some((p) => mimetype.startsWith(p));
    const extOk = ALLOWED_EXT.has(ext);

    // 이미지 타입 및 확장자 체크 (모바일 호환 고려)
    if (mimeOk && extOk) return cb(null, true);

    const err = new Error("이미지 파일만 업로드 가능합니다. (jpg, png, webp, gif, heic)");
    err.code = "INVALID_FILE_TYPE";
    cb(err);
  },
});


// 들어올수 있는 url 한정 시키기
const ALLOWED = ["community", "goods", "profile", "event", "notice", "nanum"];


// url 한정 함수
const validateUploadPath = (req, res, next) => {
  if (!ALLOWED.includes(req.params.url)) {
    return res.status(400).json({ success: false, message: "허용되지 않은 경로" });
  }
  next();
};

// ✅ 5. 이미지 업로드 전용 API
// 5-1) 단일 업로드
app.post(
  "/api/upload/single/:url",
  validateUploadPath,
  (req, res, next) => upload(req.params.url).single("image")(req, res, next),
  (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, message: "파일이 없습니다." });
    const savedName = req.file.filename;
    res.json({
      success: true,
      savedName,
      url: `/uploads/${req.params.url}/${savedName}`,
    });
  }
);

// 5-2) 다중 업로드 (최대 11장)
app.post(
  "/api/upload/multi/:url",
  validateUploadPath,
  (req, res, next) => upload(req.params.url).array("images", 11)(req, res, next),
  (req, res) => {
    if (!req.files || req.files.length === 0) return res.status(400).json({ success: false, message: "파일이 없습니다." });
    const files = req.files.map((f) => ({
      savedName: f.filename,
      url: `/uploads/${req.params.url}/${f.filename}`,
    }));
    res.json({ success: true, files });
  }
);

// ✅ 6. 메인 API 라우터 연결
app.use("/api", apiRoutes);

// ✅ 7. 404 및 에러 핸들링
app.use(notFound);
app.use(errorHandler);

module.exports = app;