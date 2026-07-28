const dashboardService = require("../../service/admin/dashboard.service");

module.exports.getAdminDashboard = async (req, res) => {
  try {
    const data = await dashboardService.getAdminDashboardSummary();
    return res.status(200).json({ data });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};
