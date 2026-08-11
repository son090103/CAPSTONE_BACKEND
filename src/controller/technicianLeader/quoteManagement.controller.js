const quoteManagementService = require("../../service/technicianLeader/quoteManagement.service");
const {
  createQuotationSchema,
  updateQuotationSchema,
} = require("../../validation/receptionist/quoteManagement.validation");
const {
  createIssueReportSchema,
} = require("../../validation/technicianLeader/issueReport.validation");

module.exports.getAllComponents = async (req, res) => {
  try {
    const result = await quoteManagementService.getAllComponents();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports.getActiveTasksForIssueReport = async (req, res) => {
  try {
    const result = await quoteManagementService.getActiveTasksForIssueReport();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports.createIssuesReport = async (req, res) => {
  try {
    const { task_id, note, issues } = req.body;
    const validation = createIssueReportSchema.safeParse({
      task_id,
      issues,
      note,
    });
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    }
    const result = await quoteManagementService.createIssueReports(task_id, issues, note);
    return res.status(201).json({
      success: true,
      message: "Ghi nhận lỗi thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi.",
    });
  }
};

module.exports.getIssueReports = async (req, res) => {
  try {
    const result = await quoteManagementService.getIssuesReports();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

module.exports.getPaymentSummary = async (req, res) => {
  try {
    const { serviceOrderId } = req.params;
    const result = await quoteManagementService.getPaymentSummaryByServiceOrder(
      Number(serviceOrderId),
    );
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res
      .status(error.status || 500)
      .json({ message: error.message || "Internal server error" });
  }
};

module.exports.getSpareParts = async (req, res) => {
  try {
    const result = await quoteManagementService.getSpareParts();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getAllService = async (req, res) => {
  try {
    const result = await quoteManagementService.getAllService();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.createQuotation = async (req, res) => {
  try {
    const leaderId = res.locals.user.id;
    const { task_id, items, note, deposit_amount } = req.body;
    const validation = createQuotationSchema.safeParse({
      task_id,
      items,
      note,
      deposit_amount,
    });
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    }
    const result = await quoteManagementService.createQuotation(
      validation.data,
      leaderId,
    );
    return res.status(201).json({
      message: "Tạo báo giá thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.updateQuotation = async (req, res) => {
  try {
    const leaderId = res.locals.user.id;
    const { id } = req.params;
    const { items, note } = req.body;
    const validation = updateQuotationSchema.safeParse({
      items,
      note,
    });
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    }
    const result = await quoteManagementService.updateQuotation(
      id,
      validation.data,
      leaderId,
    );
    return res.status(200).json({
      message: "Cập nhật báo giá thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getQuoteHistory = async (req, res) => {
  try {
    const result = await quoteManagementService.getQuoteHistory();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getQuotationById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await quoteManagementService.getQuotationById(id);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.approveQuote = async (req, res) => {
  try {
    const { id } = req.params;
    await quoteManagementService.approveQuotation(id);
    return res.status(200).json({ message: "Duyệt báo giá thành công" });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

// Leader phát hiện phụ tùng thiếu tồn lúc lập báo giá -> gửi yêu cầu cho thủ kho biết cần mua
// thêm. Dùng chung service với Inventory (createRestockRequest ở importAndExportManagement).
module.exports.createRestockRequest = async (req, res) => {
  try {
    const requestedBy = res.locals.user.id;
    const { spare_part_id, quantity_needed, quotation_detail_id } = req.body;
    const inventoryService = require("../../service/inventory/importAndExportManagement.service");
    const result = await inventoryService.createRestockRequest(
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
