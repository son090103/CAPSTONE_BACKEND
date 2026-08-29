const db = require("../../../models");
const { PDFParse } = require("pdf-parse");
const { uploadToCloudinary } = require("../../helper/uploadToCloudinary.helper");
const cloudinary = require("../../config/cloudinary.config");
const technicalVectorStoreService = require("../ai/technicalVectorStore.service");

const Technical_Documents = db.Technical_Documents;

const extractTextFromPdf = async (buffer) => {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text || "";
  } finally {
    await parser.destroy();
  }
};

module.exports.createTechnicalDocument = async ({ title, makeId, fileBuffer, uploadedBy }) => {
  if (!title || !title.trim()) {
    throw { status: 400, message: "Vui lòng nhập tiêu đề tài liệu" };
  }
  if (!makeId) {
    throw { status: 400, message: "Vui lòng chọn hãng xe" };
  }
  if (!fileBuffer) {
    throw { status: 400, message: "Vui lòng chọn file PDF" };
  }

  const make = await db.Vehicle_Makes.findByPk(makeId);
  if (!make) {
    throw { status: 404, message: "Không tìm thấy hãng xe" };
  }

  const uploadResult = await uploadToCloudinary(fileBuffer, "technical-documents", true);

  const document = await Technical_Documents.create({
    title: title.trim(),
    make_id: makeId,
    file_url: uploadResult.secure_url,
    status: "PROCESSING",
    uploaded_by: uploadedBy || null,
  });

  try {
    const extractedText = await extractTextFromPdf(fileBuffer);
    if (!extractedText.trim()) {
      throw new Error("Không trích xuất được nội dung văn bản từ file PDF (có thể là file scan ảnh).");
    }
    document.extracted_text = extractedText;
    document.make = make;

    // Đẩy thẳng lên Pinecone ngay khi upload — không bắt admin/khách phải tự chạy lệnh
    // rag:sync thủ công. Nếu bước này lỗi (thiếu API key, Pinecone/Hugging Face gián đoạn),
    // tài liệu vẫn lưu được text (để admin thấy rõ lỗi và có thể thử lại), nhưng đánh dấu FAILED
    // vì AI chưa thể dùng được tài liệu này cho tới khi upsert thành công.
    await technicalVectorStoreService.upsertDocument(document);

    document.status = "READY";
    await document.save();
  } catch (error) {
    document.status = "FAILED";
    document.error_message = error.message;
    await document.save();
  }

  return document;
};

module.exports.listTechnicalDocuments = async ({ makeId } = {}) => {
  const where = {};
  if (makeId) where.make_id = makeId;
  return await Technical_Documents.findAll({
    where,
    attributes: ["id", "title", "make_id", "file_url", "status", "error_message", "uploaded_by", "createdAt"],
    include: [{ model: db.Vehicle_Makes, as: "make", attributes: ["id", "make_name"] }],
    order: [["createdAt", "DESC"]],
  });
};

module.exports.deleteTechnicalDocument = async (id) => {
  const document = await Technical_Documents.findByPk(id);
  if (!document) {
    throw { status: 404, message: "Không tìm thấy tài liệu" };
  }

  // Tính lại đúng danh sách ID chunk đã upsert lên Pinecone (chunk deterministic — cùng
  // extracted_text luôn ra cùng số chunk/id) để xóa sạch, tránh để lại vector rác sau khi
  // tài liệu đã bị xóa khỏi DB. Lỗi ở bước này không chặn việc xóa record DB.
  try {
    await technicalVectorStoreService.deleteDocument(document);
  } catch (error) {
    console.error("Lỗi khi xóa vector Pinecone của tài liệu kỹ thuật:", error);
  }

  await document.destroy();
  return { id };
};

// Delivery URL công khai của Cloudinary (res.cloudinary.com) bị tài khoản chặn ACL cho resource
// type raw (trả 401 "deny or ACL failure"). URL ký qua api.cloudinary.com (dùng API key/secret,
// giống mọi request quản trị khác) thì không bị chặn — dùng route này thay vì mở thẳng file_url.
module.exports.getSignedViewUrl = async (id) => {
  const document = await Technical_Documents.findByPk(id);
  if (!document) {
    throw { status: 404, message: "Không tìm thấy tài liệu" };
  }
  const match = document.file_url.match(/\/upload\/v\d+\/(.+)$/);
  if (!match) {
    throw { status: 500, message: "Không xác định được đường dẫn file trên Cloudinary" };
  }
  const publicId = match[1];
  return cloudinary.utils.private_download_url(publicId, "pdf", {
    resource_type: "raw",
    type: "upload",
  });
};

module.exports.listVehicleMakes = async () => {
  return await db.Vehicle_Makes.findAll({
    attributes: ["id", "make_name"],
    order: [["make_name", "ASC"]],
  });
};
