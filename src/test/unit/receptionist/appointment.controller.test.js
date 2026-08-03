const mockGetAppointment = jest.fn();
const mockGetCustomer = jest.fn();
const mockGetAppointmentByKey = jest.fn();
const mockReceiveAppointment = jest.fn();
const mockUpdateVehicleVin = jest.fn();
const mockCheckVehicleInfo = jest.fn();

jest.mock("../../../service/receptionist/appointment.service", () => ({
  getAppointment: mockGetAppointment,
  getCustomer: mockGetCustomer,
  getAppointmentByKey: mockGetAppointmentByKey,
  receiveAppointment: mockReceiveAppointment,
  updateVehicleVin: mockUpdateVehicleVin,
  checkVehicleInfo: mockCheckVehicleInfo,
}));

const controller = require("../../../controller/receptionist/appointment.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = { user: { id: 1 } };
  return res;
};

describe("Appointment Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAppointment", () => {
    it("should return 401 when user is not authenticated", async () => {
      const req = {};
      const res = createMockResponse();
      res.locals.user = null;

      await controller.getAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
      expect(mockGetAppointment).not.toHaveBeenCalled();
    });

    it("should return 200 and list appointments on success", async () => {
      const fakeData = [{ id: 1, key: "A001" }];
      mockGetAppointment.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getAppointment(req, res);

      expect(mockGetAppointment).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy danh sách tất cả lịch hẹn thành công",
        data: fakeData,
      });
    });
  });

  describe("getCustomer", () => {
    it("should return customer list using search query", async () => {
      const fakeData = [{ id: 2, name: "Nguyen Van A" }];
      mockGetCustomer.mockResolvedValue(fakeData);
      const req = { query: { search: "Nguyen" } };
      const res = createMockResponse();

      await controller.getCustomer(req, res);

      expect(mockGetCustomer).toHaveBeenCalledWith("Nguyen");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });

    it("should return error when service throws", async () => {
      const error = new Error("DB error");
      error.status = 500;
      mockGetCustomer.mockRejectedValue(error);

      const req = { query: { search: "Nguyen" } };
      const res = createMockResponse();

      await controller.getCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Lỗi Server",
        error: "DB error",
      });
    });
  });

  describe("getAppointmentByKey", () => {
    it("should return 401 when user is not authenticated", async () => {
      const req = { params: { key: "A001" } };
      const res = createMockResponse();
      res.locals.user = null;

      await controller.getAppointmentByKey(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("should return appointment detail on success", async () => {
      const fakeData = { id: 1, key: "A001" };
      mockGetAppointmentByKey.mockResolvedValue(fakeData);
      const req = { params: { key: "A001" } };
      const res = createMockResponse();

      await controller.getAppointmentByKey(req, res);

      expect(mockGetAppointmentByKey).toHaveBeenCalledWith("A001");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy chi tiết lịch hẹn thành công",
        data: fakeData,
      });
    });
  });

  describe("receiveAppointment", () => {
    it("should return 401 when user is not authenticated", async () => {
      const req = { params: { key: "A001" } };
      const res = createMockResponse();
      res.locals.user = null;

      await controller.receiveAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("should return 400 when key validation fails", async () => {
      const req = { params: { key: "" } };
      const res = createMockResponse();

      await controller.receiveAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.any(String),
      });
      expect(mockReceiveAppointment).not.toHaveBeenCalled();
    });

    it("should receive appointment successfully", async () => {
      const fakeData = { id: 1, status: "RECEIVED" };
      mockReceiveAppointment.mockResolvedValue(fakeData);
      const req = { params: { key: "A001" } };
      const res = createMockResponse();

      await controller.receiveAppointment(req, res);

      expect(mockReceiveAppointment).toHaveBeenCalledWith("A001");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Tiếp nhận lịch hẹn thành công",
        data: fakeData,
      });
    });
  });

  describe("updateVehicleVin", () => {
    it("should return 401 when user is not authenticated", async () => {
      const req = { params: { key: "A001" }, body: { vin_number: "VIN123" } };
      const res = createMockResponse();
      res.locals.user = null;

      await controller.updateVehicleVin(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("should return 400 when validation fails", async () => {
      const req = { params: { key: "" }, body: { vin_number: "" } };
      const res = createMockResponse();

      await controller.updateVehicleVin(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.any(String),
      });
      expect(mockUpdateVehicleVin).not.toHaveBeenCalled();
    });

    it("should update vin successfully", async () => {
      const fakeData = { id: 1, vin_number: "VIN123" };
      mockUpdateVehicleVin.mockResolvedValue(fakeData);
      const req = { params: { key: "A001" }, body: { vin_number: "VIN123" } };
      const res = createMockResponse();

      await controller.updateVehicleVin(req, res);

      expect(mockUpdateVehicleVin).toHaveBeenCalledWith("A001", "VIN123");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Cập nhật số khung thành công",
        data: fakeData,
      });
    });
  });

  describe("checkVehicleInfo", () => {
    it("should return 401 when user is not authenticated", async () => {
      const req = { params: { key: "A001" } };
      const res = createMockResponse();
      res.locals.user = null;

      await controller.checkVehicleInfo(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    });

    it("should return vehicle info on success", async () => {
      const fakeData = { id: 1, plate: "51G-12345" };
      mockCheckVehicleInfo.mockResolvedValue(fakeData);
      const req = { params: { key: "A001" } };
      const res = createMockResponse();

      await controller.checkVehicleInfo(req, res);

      expect(mockCheckVehicleInfo).toHaveBeenCalledWith("A001");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Kiểm tra thông tin xe thành công",
        data: fakeData,
      });
    });
  });
});
