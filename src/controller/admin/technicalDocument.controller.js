const technicalDocumentService = require("../../service/admin/technicalDocument.service");

module.exports.list = async (req, res) => {
  try {
    const { makeId } = req.query;
    const data = await technicalDocumentService.listTechnicalDocuments({
      makeId: makeId ? Number(makeId) : undefined,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("list technical documents error:", error);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Lỗi máy chủ" });
  }
};

module.exports.create = async (req, res) => {
  try {
    const file = req.files && req.files["pdf_document"] && req.files["pdf_document"][0];
    const document = await technicalDocumentService.createTechnicalDocument({
      title: req.body.title,
      makeId: req.body.make_id ? Number(req.body.make_id) : undefined,
      fileBuffer: file ? file.buffer : undefined,
      uploadedBy: res.locals.user?.id,
    });
    return res.status(201).json({ success: true, message: "Tải lên tài liệu kỹ thuật thành công", data: document });
  } catch (error) {
    console.error("create technical document error:", error);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Lỗi máy chủ" });
  }
};

module.exports.listVehicleMakes = async (req, res) => {
  try {
    const data = await technicalDocumentService.listVehicleMakes();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("list vehicle makes error:", error);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Lỗi máy chủ" });
  }
};

module.exports.remove = async (req, res) => {
  try {
    await technicalDocumentService.deleteTechnicalDocument(req.params.id);
    return res.status(200).json({ success: true, message: "Đã xóa tài liệu kỹ thuật" });
  } catch (error) {
    console.error("delete technical document error:", error);
    return res.status(error.status || 500).json({ success: false, message: error.message || "Lỗi máy chủ" });
  }
};
