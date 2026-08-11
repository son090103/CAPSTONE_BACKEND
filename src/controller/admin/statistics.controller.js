const statisticsService = require("../../service/admin/statistics.service");

module.exports.getDashboardStats = async (req, res) => {
  try {
    const { timeframe, startDate, endDate, year, month, week } = req.query;
    const result = await statisticsService.getAdminDashboardStats({ timeframe, startDate, endDate, year, month, week });
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Error in getDashboardStats controller:", error);
    return res.status(500).json({ success: false, message: "Lỗi Server", error: error.message });
  }
};

module.exports.getAdvancedStats = async (req, res) => {
  try {
    const generateAi = req.query.generateAi === 'true';
    const { timeframe, startDate, endDate } = req.query;
    const result = await statisticsService.getAdvancedAnalysisStats({
      generateAi,
      timeframe,
      startDate,
      endDate
    });
    if (!result) {
      return res.status(404).json({ success: false, message: "Chưa có báo cáo phân tích nâng cao. Vui lòng chạy file Python trước." });
    }
    console.log("thành công")
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error("Error in getAdvancedStats controller:", error);
    return res.status(500).json({ success: false, message: "Lỗi Server", error: error.message });
  }
};
