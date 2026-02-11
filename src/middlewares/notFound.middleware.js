module.exports = (req, res) => {
  res.status(404).json({ ok: false, message: "요청한 API를 찾을 수 없습니다" });
};