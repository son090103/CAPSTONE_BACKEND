const db = require('../../../models');

const History = db.AI_Analysis_Histories;

module.exports.createProcessingHistory = ({ userId, startDate, endDate, timeframe, planHorizon }) => History.create({
  created_by: userId || null,
  start_date: startDate,
  end_date: endDate,
  timeframe: timeframe || 'custom',
  plan_horizon: planHorizon || '1_month',
  status: 'PROCESSING',
  model_name: 'gemini-2.5-flash',
  prompt_version: 'admin-analysis-v1',
  input_snapshot: {
    filters: { timeframe: timeframe || 'custom', startDate, endDate },
    planHorizon: planHorizon || '1_month',
  },
});

module.exports.completeHistory = async (history, report, durationMs) => {
  if (!history) return;
  await history.update({
    status: 'COMPLETED',
    input_snapshot: {
      filters: report?.filters || history.input_snapshot?.filters || null,
      periods: report?.periods || null,
      dashboardStats: report?.dashboard_stats || null,
      comparisonStats: report?.comparison_stats || null,
      planHorizon: report?.plan_horizon || history.plan_horizon,
    },
    analysis_snapshot: report,
    ai_plan: report?.gemini_plan || null,
    ai_insights: report?.gemini_insights || null,
    weather_snapshot: report?.weather_context || null,
    duration_ms: durationMs,
    error_message: null,
  });
};

module.exports.failHistory = async (history, error, durationMs) => {
  if (!history) return;
  await history.update({
    status: 'FAILED',
    error_message: error?.message || String(error || 'Lỗi không xác định'),
    duration_ms: durationMs,
  });
};

module.exports.getHistories = async ({ page = 1, limit = 20 } = {}) => {
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const result = await History.findAndCountAll({
    attributes: { exclude: ['input_snapshot', 'analysis_snapshot', 'ai_plan', 'ai_insights', 'weather_snapshot'] },
    include: [{
      model: db.User,
      as: 'createdBy',
      attributes: ['id', 'fullName', 'email'],
      required: false,
    }],
    order: [['createdAt', 'DESC']],
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  });
  return {
    items: result.rows,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: result.count,
      totalPages: Math.ceil(result.count / safeLimit),
    },
  };
};

module.exports.getHistoryById = async (id) => {
  const history = await History.findByPk(id, {
    include: [{
      model: db.User,
      as: 'createdBy',
      attributes: ['id', 'fullName', 'email'],
      required: false,
    }],
  });
  if (!history) throw { status: 404, message: 'Không tìm thấy lịch sử phân tích AI' };
  return history;
};

module.exports.deleteHistory = async (id) => {
  const history = await History.findByPk(id);
  if (!history) throw { status: 404, message: 'Không tìm thấy lịch sử phân tích AI' };
  await history.destroy();
};
