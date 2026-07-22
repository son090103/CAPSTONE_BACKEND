const ImportAndExportManagement = require("../../service/inventory/importAndExportManagement.service");
const {
  importReceiptSchema,
  approveExportSchema,
} = require("../../validation/inventory/importAndExportManagement.validation");
const scanInvoiceService = require("../../service/inventory/importAndExportManagement.service");

module.exports.scanInvoice = async (req, res) => {
  try {
    console.log("SCAN req.files:", req.files);
    console.log("SCAN req.file:", req.file);
    console.log("SCAN body keys:", Object.keys(req.body || {}));
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "Vui lòng upload ít nhất 1 ảnh hóa đơn" });
    }
    const files = req.files.map((file) => ({
      imageBase64: file.buffer.toString("base64"),
      mimeType: file.mimetype,
    }));
    const result = await scanInvoiceService.scanInvoice(files);
    return res.status(200).json({ data: result });
  } catch (error) {
    console.error("SCAN INVOICE ERROR:", error);
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.importSparePart = async (req, res) => {
  try {
    const manager_id = res.locals.user.id;
    const { supplier_id, items } = req.body;
    console.log(req.body);
    console.log(items);
    const validation = importReceiptSchema.safeParse({
      manager_id,
      supplier_id,
      items,
    });
    if (!validation.success) {
      console.log(validation.error.issues);
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    }
    const result = await ImportAndExportManagement.importSparePart(
      manager_id,
      supplier_id,
      items,
    );
    return res.status(201).json({
      message: "Tạo phiếu nhập kho thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
      part: error.part,
    });
  }
};

module.exports.viewImportHistory = async (req, res) => {
  try {
    const result = await ImportAndExportManagement.viewImportHistory();
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getApprovedQuotesWithParts = async (req, res) => {
  try {
    const result = await ImportAndExportManagement.getApprovedQuotesWithParts();
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.approveExportByQuotation = async (req, res) => {
  try {
    const manager_id = res.locals.user.id;
    const { quotationId } = req.params;
    const { detailIds } = req.body;
        console.log("params:", req.params, "body:", req.body);

    const validation = approveExportSchema.safeParse({
      quotationId: Number(quotationId),
    });
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    }
    const result = await ImportAndExportManagement.approveExportByQuotation(
      Number(quotationId),
      detailIds,
      manager_id,
    );
    return res.status(200).json({
      message: "Xuất kho thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.viewExportHistory = async (req, res) => {
  try {
    const result = await ImportAndExportManagement.viewExportHistory();
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.viewExportDetail = async (req, res) => {
  try {
    const { receiptCode } = req.params;
    const result = await ImportAndExportManagement.viewExportDetail(receiptCode);
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};
