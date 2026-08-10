const quoteManagementService = require("../../service/receptionist/quoteManagement.service");

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
