const statisticsService = require("../../service/admin/statistics.service");
const aiAnalysisHistoryService = require("../../service/admin/aiAnalysisHistory.service");

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
  const startedAt = Date.now();
  let history = null;
  try {
    const generateAi = req.query.generateAi === 'true';
    const { timeframe, startDate, endDate, planHorizon } = req.query;
    const normalizedPlanHorizon = planHorizon === '3_months' ? '3_months' : '1_month';
    if (generateAi && startDate && endDate) {
      history = await aiAnalysisHistoryService.createProcessingHistory({
        userId: res.locals.user?.id,
        startDate,
        endDate,
        timeframe,
        planHorizon: normalizedPlanHorizon,
      });
    }
    const result = await statisticsService.getAdvancedAnalysisStats({
      generateAi,
      timeframe,
      startDate,
      endDate,
      planHorizon: normalizedPlanHorizon
    });
    if (!result) {
      const message = "Chưa có báo cáo phân tích nâng cao. Vui lòng chạy file Python trước.";
      if (history) {
        await aiAnalysisHistoryService.failHistory(history, new Error(message), Date.now() - startedAt);
        history = null;
      }
      return res.status(404).json({ success: false, message });
    }
    if (history) {
      await aiAnalysisHistoryService.completeHistory(history, result, Date.now() - startedAt);
      result.analysis_history_id = history.id;
    }
    console.log("thành công")
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (history) {
      try {
        await aiAnalysisHistoryService.failHistory(history, error, Date.now() - startedAt);
      } catch (historyError) {
        console.error('Không thể cập nhật lịch sử phân tích thất bại:', historyError);
      }
    }
    console.error("Error in getAdvancedStats controller:", error);
    return res.status(error.status || 500).json({ success: false, message: "Lỗi Server", error: error.message });
  }
};
