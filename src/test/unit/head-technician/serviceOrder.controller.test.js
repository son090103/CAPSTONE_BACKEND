const mockCreateServiceOrder = jest.fn();
const mockGetServiceOrderById = jest.fn();

jest.mock("../../../service/receptionist/serviceOrder.service", () => ({
  createServiceOrder: mockCreateServiceOrder,
  getServiceOrderById: mockGetServiceOrderById,
}));

jest.mock("../../../validation/receptionist/serviceOrder.validation", () => ({
  createServiceOrderSchema: { safeParse: jest.fn() },
}));

const controller = require("../../../controller/technicianLeader/serviceOrder.controller");
const validationMocks = require("../../../validation/receptionist/serviceOrder.validation");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = { user: { id: 101 } };
  return res;
};

describe("Technician Leader ServiceOrder Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createServiceOrder", () => {
    it("should return 400 when validation fails", async () => {
      const req = { body: { vehicle_id: "bad" } };
      const res = createMockResponse();

      validationMocks.createServiceOrderSchema.safeParse.mockReturnValue({
        success: false,
        error: { format: jest.fn(() => ({ vehicle_id: { _errors: ["Invalid vehicle_id"] } })) },
      });

      await controller.createServiceOrder(req, res);

      expect(validationMocks.createServiceOrderSchema.safeParse).toHaveBeenCalledWith({ vehicle_id: "bad" });
      expect(mockCreateServiceOrder).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: expect.any(Object),
      });
    });

    it("should create service order successfully", async () => {
      const fakeResult = { id: 200, status: "PENDING" };
      validationMocks.createServiceOrderSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          vehicle_id: 1,
          current_odo: 12000,
          symptoms: "Rung nhẹ",
          estimated_finish_time: "2026-08-15T10:00:00.000Z",
          service_ids: [1, 2],
        },
      });
      mockCreateServiceOrder.mockResolvedValue(fakeResult);

      const req = {
        body: {
          vehicle_id: 1,
          current_odo: 12000,
          symptoms: "Rung nhẹ",
          estimated_finish_time: "2026-08-15T10:00:00.000Z",
          service_ids: [1, 2],
        },
      };
      const res = createMockResponse();

      await controller.createServiceOrder(req, res);

      expect(mockCreateServiceOrder).toHaveBeenCalledWith(
        {
          vehicle_id: 1,
          current_odo: 12000,
          symptoms: "Rung nhẹ",
          estimated_finish_time: "2026-08-15T10:00:00.000Z",
          service_ids: [1, 2],
        },
        101,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Tạo lệnh sửa chữa thành công",
        data: fakeResult,
      });
    });
  });

  describe("getServiceOrderById", () => {
    it("should return 200 with service order details", async () => {
      const fakeResult = { id: 300, vehicle_id: 5, current_odo: 20000 };
      mockGetServiceOrderById.mockResolvedValue(fakeResult);

      const req = { params: { id: "300" } };
      const res = createMockResponse();

      await controller.getServiceOrderById(req, res);

      expect(mockGetServiceOrderById).toHaveBeenCalledWith("300");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeResult });
    });

    it("should return 500 when service throws an error", async () => {
      const error = new Error("Service unavailable");
      error.status = 503;
      mockGetServiceOrderById.mockRejectedValue(error);

      const req = { params: { id: "300" } };
      const res = createMockResponse();

      await controller.getServiceOrderById(req, res);

      expect(mockGetServiceOrderById).toHaveBeenCalledWith("300");
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Service unavailable",
      });
    });
  });
});
