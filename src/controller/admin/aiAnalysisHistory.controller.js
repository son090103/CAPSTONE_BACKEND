const historyService = require('../../service/admin/aiAnalysisHistory.service');

module.exports.getHistories = async (req, res) => {
  try {
    const data = await historyService.getHistories(req.query);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

module.exports.getHistoryById = async (req, res) => {
  try {
    const data = await historyService.getHistoryById(req.params.id);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

module.exports.deleteHistory = async (req, res) => {
  try {
    await historyService.deleteHistory(req.params.id);
    return res.status(200).json({ success: true, message: 'Đã xóa lịch sử phân tích AI' });
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};
