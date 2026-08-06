const mockCreateServiceOrder = jest.fn();
const mockGetServiceOrders = jest.fn();
const mockGetServiceOrdersAwaitingPayment = jest.fn();
const mockGetServiceOrderById = jest.fn();
const mockUpdateServiceOrderOdo = jest.fn();
const mockGetCompleteServiceOrder = jest.fn();

jest.mock("../../../service/receptionist/serviceOrder.service", () => ({
  createServiceOrder: mockCreateServiceOrder,
  getServiceOrders: mockGetServiceOrders,
  getServiceOrdersAwaitingPayment: mockGetServiceOrdersAwaitingPayment,
  getServiceOrderById: mockGetServiceOrderById,
  updateServiceOrderOdo: mockUpdateServiceOrderOdo,
  getCompleteServiceOrder: mockGetCompleteServiceOrder,
}));

const controller = require("../../../controller/receptionist/serviceOrder.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = { user: { id: 9 } };
  return res;
};

describe("ServiceOrder Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createServiceOrder", () => {
    it("should return 400 when input validation fails", async () => {
      const req = { body: { vehicle_id: "bad" } };
      const res = createMockResponse();

      await controller.createServiceOrder(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: expect.any(Object),
      });
      expect(mockCreateServiceOrder).not.toHaveBeenCalled();
    });

    it("should create service order successfully", async () => {
      const fakeResult = { id: 100 };
      mockCreateServiceOrder.mockResolvedValue(fakeResult);
      const req = {
        body: {
          vehicle_id: 1,
          current_odo: 12000,
          symptoms: "Xe rung",
          estimated_finish_time: "2026-08-03T10:00:00.000Z",
          service_ids: [1],
        },
      };
      const res = createMockResponse();

      await controller.createServiceOrder(req, res);

      expect(mockCreateServiceOrder).toHaveBeenCalledTimes(1);
      expect(mockCreateServiceOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          vehicle_id: 1,
          current_odo: 12000,
          symptoms: "Xe rung",
          service_ids: [1],
        }),
        9,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Tạo lệnh sửa chữa thành công",
        data: fakeResult,
      });
    });
  });

  describe("getServiceOrders", () => {
    it("should return all service orders", async () => {
      const fakeData = [{ id: 1 }];
      mockGetServiceOrders.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getServiceOrders(req, res);

      expect(mockGetServiceOrders).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("getServiceOrdersAwaitingPayment", () => {
    it("should return service orders awaiting payment", async () => {
      const fakeData = [{ id: 1, status: "WAITING_FOR_PAYMENT" }];
      mockGetServiceOrdersAwaitingPayment.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getServiceOrdersAwaitingPayment(req, res);

      expect(mockGetServiceOrdersAwaitingPayment).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("getServiceOrderById", () => {
    it("should return service order detail", async () => {
      const fakeData = { id: 1, current_odo: 12000 };
      mockGetServiceOrderById.mockResolvedValue(fakeData);
      const req = { params: { id: "1" } };
      const res = createMockResponse();

      await controller.getServiceOrderById(req, res);

      expect(mockGetServiceOrderById).toHaveBeenCalledWith("1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("updateServiceOrderOdo", () => {
    it("should return 400 when current_odo missing", async () => {
      const req = { params: { id: "1" }, body: {} };
      const res = createMockResponse();

      await controller.updateServiceOrderOdo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Thiếu thông tin số ODO (current_odo)",
      });
      expect(mockUpdateServiceOrderOdo).not.toHaveBeenCalled();
    });

    it("should update odo successfully", async () => {
      const fakeResult = { id: 1, current_odo: 15000 };
      mockUpdateServiceOrderOdo.mockResolvedValue(fakeResult);
      const req = { params: { id: "1" }, body: { current_odo: 15000, symptoms: "Rung mạnh" } };
      const res = createMockResponse();

      await controller.updateServiceOrderOdo(req, res);

      expect(mockUpdateServiceOrderOdo).toHaveBeenCalledWith("1", 15000, "Rung mạnh");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Cập nhật số km tiếp nhận thành công",
        data: fakeResult,
      });
    });
  });

  describe("getCompleteServiceOrder", () => {
    it("should return complete service orders", async () => {
      const fakeData = [{ id: 1, status: "COMPLETED" }];
      mockGetCompleteServiceOrder.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getCompleteServiceOrder(req, res);

      expect(mockGetCompleteServiceOrder).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });
});
