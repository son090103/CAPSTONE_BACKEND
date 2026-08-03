const multer = require("multer");
const path = require("path");

const storage = multer.memoryStorage();

const allowedExtensions = [".xlsx", ".xls", ".csv"];

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();
  if (allowedExtensions.includes(extension)) {
    return cb(null, true);
  }
  cb(new Error("Chỉ cho phép file Excel (.xlsx, .xls) hoặc CSV (.csv)"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;
