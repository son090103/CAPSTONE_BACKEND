const serviceHistoryAndTrackingService = require("../../service/customer/serviceHistoryAndTracking.service");

module.exports.getRepairProgress = async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const result = await serviceHistoryAndTrackingService.getRepairProgress(userId);
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getServiceHistory = async (req, res) => {
  try {
    const userId = res.locals.user.id;
    const result = await serviceHistoryAndTrackingService.getServiceHistory(userId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};
