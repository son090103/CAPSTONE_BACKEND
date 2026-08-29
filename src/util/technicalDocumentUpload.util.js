const multer = require("multer");
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file && file.mimetype === "application/pdf") {
        return cb(null, true);
    }
    cb(new Error("Chỉ cho phép tải lên file PDF!"), false);
};

const technicalDocumentUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB limit — tài liệu kỹ thuật thường nặng hơn ảnh
    },
});

module.exports = technicalDocumentUpload;
