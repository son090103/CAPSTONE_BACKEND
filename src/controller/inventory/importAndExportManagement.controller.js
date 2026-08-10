const ImportAndExportManagement = require("../../service/inventory/importAndExportManagement.service");
const {
  importReceiptSchema,
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

module.exports.getExportRequests = async (req, res) => {
  try {
    const result = await ImportAndExportManagement.getExportRequests();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.approveExportRequest = async (req, res) => {
  try {
    const manager_id = res.locals.user.id;
    const { detailIds } = req.body;
    if (!Array.isArray(detailIds) || detailIds.length === 0) {
      return res.status(400).json({ message: "Vui lòng chọn ít nhất 1 dòng phụ tùng để duyệt." });
    }
    const result = await ImportAndExportManagement.approveExportRequest(detailIds, manager_id);
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

module.exports.rejectExportRequest = async (req, res) => {
  try {
    const { detailIds, reason } = req.body;
    if (!Array.isArray(detailIds) || detailIds.length === 0) {
      return res.status(400).json({ message: "Vui lòng chọn ít nhất 1 dòng phụ tùng để từ chối." });
    }
    const result = await ImportAndExportManagement.rejectExportRequest(detailIds, reason);
    return res.status(200).json({
      message: "Đã từ chối yêu cầu xuất kho",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getExportReceiptDetail = async (req, res) => {
  try {
    const { receiptCode } = req.params;
    const result = await ImportAndExportManagement.getExportReceiptDetail(receiptCode);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
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

module.exports.viewImportDetail = async (req, res) => {
  try {
    const { receiptCode } = req.params;
    const result = await ImportAndExportManagement.viewImportDetail(receiptCode);
    return res.status(200).json({ data: result });
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

module.exports.getWaitingStockItems = async (req, res) => {
  try {
    const result = await ImportAndExportManagement.getWaitingStockItems();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getRestockSuggestions = async (req, res) => {
  try {
    const result = await ImportAndExportManagement.getRestockSuggestions();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};


module.exports.confirmCustomPartArrival = async (req, res) => {
  try {
    const manager_id = res.locals.user.id;
    const { id } = req.params;
    const { actual_unit_price } = req.body;
    const result = await ImportAndExportManagement.confirmCustomPartArrival(
      manager_id,
      Number(id),
      actual_unit_price != null ? Number(actual_unit_price) : undefined,
    );
    return res.status(200).json({
      message: "Đã xác nhận phụ tùng đặt riêng đã về",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.exportCustomPartOrder = async (req, res) => {
  try {
    const manager_id = res.locals.user.id;
    const { id } = req.params;
    const result = await ImportAndExportManagement.exportCustomPartOrder(manager_id, Number(id));
    return res.status(200).json({
      message: "Đã xuất phụ tùng đặt riêng cho kỹ thuật viên",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.createRestockRequest = async (req, res) => {
  try {
    const requestedBy = res.locals.user.id;
    const { spare_part_id, quantity_needed, quotation_detail_id } = req.body;
    const result = await ImportAndExportManagement.createRestockRequest(
      requestedBy,
      Number(spare_part_id),
      Number(quantity_needed),
      quotation_detail_id ? Number(quotation_detail_id) : undefined,
    );
    return res.status(201).json({
      message: "Đã gửi yêu cầu bổ sung phụ tùng",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getRestockRequests = async (req, res) => {
  try {
    const result = await ImportAndExportManagement.getRestockRequests();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.resolveRestockRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await ImportAndExportManagement.resolveRestockRequest(Number(id));
    return res.status(200).json({
      message: "Đã đánh dấu hoàn tất yêu cầu bổ sung",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getRestockRequestsSummary = async (req, res) => {
  try {
    const result = await ImportAndExportManagement.getRestockRequestsSummary();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getRestockRequestsHistory = async (req, res) => {
  try {
    const result = await ImportAndExportManagement.getRestockRequestsHistory();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.exportRestockRequestsExcel = async (req, res) => {
  try {
    const buffer = await ImportAndExportManagement.exportRestockRequestsExcel();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="yeu-cau-bo-sung-phu-tung-${Date.now()}.xlsx"`,
    );
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.previewImportRestockExcel = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng upload file Excel" });
    }
    const result = await ImportAndExportManagement.previewImportRestockExcel(req.file.buffer);
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.confirmRestockImport = async (req, res) => {
  try {
    const manager_id = res.locals.user.id;
    const { supplier_id, items } = req.body;
    const result = await ImportAndExportManagement.confirmRestockImport(
      manager_id,
      Number(supplier_id),
      items,
    );
    return res.status(200).json({
      message: "Đã xác nhận nhập kho",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};
