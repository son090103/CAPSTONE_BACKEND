const { success } = require("zod");
const quoteManagementService = require("../../service/receptionist/quoteManagement.service");
const {
  createQuotationSchema,
  updateQuotationSchema,
} = require("../../validation/receptionist/quoteManagement.validation");

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
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getAllService = async (req,res) => {
  try {
    const result = await quoteManagementService.getAllService();
    return res.status(200).json({success: true, data: result});
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  };
};

module.exports.createQuotation = async (req, res) => {
  try {
    const receptionistId = res.locals.user.id;
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
      receptionistId,
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
    const receptionistId = res.locals.user.id;
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
      receptionistId,
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
    return res.status(200).json({
      data: result,
    });
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

module.exports.approveQuoteByOTP = async (req, res) => {
  try {
    const { id } = req.params;
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Thiếu mã xác thực OTP" });
    }
    await quoteManagementService.approveQuotationByOTP(id, idToken);
    return res.status(200).json({ message: "Duyệt báo giá qua OTP thành công" });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};



