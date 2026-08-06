const mockGetAdminDashboardStats = jest.fn();
const mockGetAdvancedAnalysisStats = jest.fn();

jest.mock("../../../service/admin/statistics.service", () => ({
  getAdminDashboardStats: mockGetAdminDashboardStats,
  getAdvancedAnalysisStats: mockGetAdvancedAnalysisStats,
}));

const controller = require("../../../controller/admin/statistics.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Statistics Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getDashboardStats", () => {
    it("should return dashboard stats data", async () => {
      const fakeData = { totalRevenue: 1000 };
      mockGetAdminDashboardStats.mockResolvedValue(fakeData);
      const req = { query: { timeframe: "month" } };
      const res = createMockResponse();

      await controller.getDashboardStats(req, res);

      expect(mockGetAdminDashboardStats).toHaveBeenCalledWith({
        timeframe: "month",
        startDate: undefined,
        endDate: undefined,
        year: undefined,
        month: undefined,
        week: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("getAdvancedStats", () => {
    it("should return advanced analysis stats", async () => {
      const fakeData = { analysis: "ok" };
      mockGetAdvancedAnalysisStats.mockResolvedValue(fakeData);
      const req = { query: { generateAi: "true" } };
      const res = createMockResponse();

      await controller.getAdvancedStats(req, res);

      expect(mockGetAdvancedAnalysisStats).toHaveBeenCalledWith({ generateAi: true });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });

    it("should return 404 when no analysis result exists", async () => {
      mockGetAdvancedAnalysisStats.mockResolvedValue(null);
      const req = { query: { generateAi: "false" } };
      const res = createMockResponse();

      await controller.getAdvancedStats(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Chưa có báo cáo phân tích nâng cao. Vui lòng chạy file Python trước.",
      });
    });
  });
});
