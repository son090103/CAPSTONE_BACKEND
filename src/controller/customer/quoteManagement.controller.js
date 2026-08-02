const quoteManagementService = require("../../service/customer/quoteManagement.service");

module.exports.getPendingQuotations = async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const result = await quoteManagementService.getPendingQuotations(userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getQuotationHistory = async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const result = await quoteManagementService.getQuotationHistory(userId);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getQuotationById = async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const { id } = req.params;
    const result = await quoteManagementService.getQuotationById(userId, id);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports.approveQuotation = async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const { id } = req.params;
    await quoteManagementService.approveQuotation(userId, id);
    return res.status(200).json({ message: "Duyệt báo giá thành công" });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.rejectQuotation = async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const { id } = req.params;
    const { reason } = req.body;
    await quoteManagementService.rejectQuotation(userId, id, reason);
    return res.status(200).json({ message: "Từ chối báo giá thành công" });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};
