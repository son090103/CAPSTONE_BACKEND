const dashboardService = require("../../service/inventory/dashboard.service");

module.exports.getInventoryDashboard = async (req, res) => {
  try {
    const data = await dashboardService.getInventoryDashboardSummary();
    return res.status(200).json({ data });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};
