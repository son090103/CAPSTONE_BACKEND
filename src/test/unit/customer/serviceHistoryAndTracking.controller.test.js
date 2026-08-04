const serviceHistoryAndTrackingService = require("../../../service/customer/serviceHistoryAndTracking.service");

jest.mock("../../../service/customer/serviceHistoryAndTracking.service", () => ({
  getRepairProgress: jest.fn(),
  getServiceHistory: jest.fn(),
}));

const controller = require("../../../controller/customer/serviceHistoryAndTracking.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-05: Service History & Tracking Controller Tests (Customer Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. View Maintain & Repair History
   * ========================================================================== */
  describe("View Maintain & Repair History", () => {
    it("UTCID01 - View Maintain & Repair History - should return 200 OK with completed service history", async () => {
      const mockHistoryData = [
        {
          id: 101,
          status: "COMPLETED",
          entry_time: "2026-07-20T08:00:00.000Z",
          actual_finish_time: "2026-07-20T11:30:00.000Z",
          vehicle: { license_plate: "30A-999.99", color: "Black", model: { model_name: "Camry" } },
          payment: { payment_status: "PAID", amount: 1500000 },
        },
      ];
      serviceHistoryAndTrackingService.getServiceHistory.mockResolvedValue(mockHistoryData);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await controller.getServiceHistory(req, res);

      expect(serviceHistoryAndTrackingService.getServiceHistory).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockHistoryData,
      });
    });

    it("UTCID02 - View Maintain & Repair History - should return 200 OK with empty array when user has no completed records", async () => {
      serviceHistoryAndTrackingService.getServiceHistory.mockResolvedValue([]);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.getServiceHistory(req, res);

      expect(serviceHistoryAndTrackingService.getServiceHistory).toHaveBeenCalledWith(2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [],
      });
    });

    it("UTCID03 - View Maintain & Repair History - should return 404 Not Found when customer profile is missing", async () => {
      const error = { status: 404, message: "Không tìm thấy thông tin khách hàng" };
      serviceHistoryAndTrackingService.getServiceHistory.mockRejectedValue(error);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 99 };

      await controller.getServiceHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Không tìm thấy thông tin khách hàng",
      });
    });

    it("UTCID04 - View Maintain & Repair History - should return 401 Unauthorized when user session is invalid or missing", async () => {
      const error = { status: 401, message: "Unauthorized user token" };
      serviceHistoryAndTrackingService.getServiceHistory.mockRejectedValue(error);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: -1 };

      await controller.getServiceHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Unauthorized user token",
      });
    });

    it("UTCID05 - View Maintain & Repair History - should return 500 Internal Server Error on database connection timeout", async () => {
      serviceHistoryAndTrackingService.getServiceHistory.mockRejectedValue(
        new Error("Database connection timeout")
      );

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await controller.getServiceHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Database connection timeout",
      });
    });
  });

  /* ==========================================================================
   * 2. View Track Service Progress
   * ========================================================================== */
  describe("View Track Service Progress", () => {
    it("UTCID06 - View Track Service Progress - should return 200 OK with ongoing repair progress data", async () => {
      const mockProgressData = [
        {
          id: 202,
          status: "IN_PROGRESS",
          entry_time: "2026-08-04T08:00:00.000Z",
          promised_finish_time: "2026-08-04T12:00:00.000Z",
          vehicle: { license_plate: "29B-888.88", color: "White", model: { model_name: "Civic" } },
          tasks: [{ id: 1, status: "IN_PROGRESS", type: "REPAIR" }],
        },
      ];
      serviceHistoryAndTrackingService.getRepairProgress.mockResolvedValue(mockProgressData);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await controller.getRepairProgress(req, res);

      expect(serviceHistoryAndTrackingService.getRepairProgress).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: mockProgressData,
      });
    });

    it("UTCID07 - View Track Service Progress - should return 200 OK with empty list when no active service orders exist", async () => {
      serviceHistoryAndTrackingService.getRepairProgress.mockResolvedValue([]);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.getRepairProgress(req, res);

      expect(serviceHistoryAndTrackingService.getRepairProgress).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        data: [],
      });
    });

    it("UTCID08 - View Track Service Progress - should return 404 Not Found when customer record does not exist", async () => {
      const error = { status: 404, message: "Không tìm thấy thông tin khách hàng" };
      serviceHistoryAndTrackingService.getRepairProgress.mockRejectedValue(error);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 88 };

      await controller.getRepairProgress(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Không tìm thấy thông tin khách hàng",
      });
    });

    it("UTCID09 - View Track Service Progress - should return 403 Forbidden when customer account is deactivated", async () => {
      const error = { status: 403, message: "Tài khoản khách hàng đã bị tạm khóa" };
      serviceHistoryAndTrackingService.getRepairProgress.mockRejectedValue(error);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 77 };

      await controller.getRepairProgress(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "Tài khoản khách hàng đã bị tạm khóa",
      });
    });

    it("UTCID10 - View Track Service Progress - should return 500 Internal Server Error when database query fails", async () => {
      serviceHistoryAndTrackingService.getRepairProgress.mockRejectedValue(
        new Error("SequelizeDatabaseError: Relation does not exist")
      );

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await controller.getRepairProgress(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "SequelizeDatabaseError: Relation does not exist",
      });
    });
  });
});
