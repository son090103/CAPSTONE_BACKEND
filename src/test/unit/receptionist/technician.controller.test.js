const mockGetTechniciansWorkingToday = jest.fn();
const mockAssignRescueTechnician = jest.fn();

jest.mock("../../../service/receptionist/technician.service", () => ({
  getTechniciansWorkingToday: mockGetTechniciansWorkingToday,
  assignRescueTechnician: mockAssignRescueTechnician,
}));

const controller = require("../../../controller/receptionist/technician.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Receptionist Technician Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getTechniciansWorkingToday", () => {
    it("should return technicians list on success", async () => {
      const fakeData = [{ id: 1, name: "Tech A" }];
      mockGetTechniciansWorkingToday.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getTechniciansWorkingToday(req, res);

      expect(mockGetTechniciansWorkingToday).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });

    it("should return error when service throws", async () => {
      const error = new Error("DB error");
      mockGetTechniciansWorkingToday.mockRejectedValue(error);
      const req = {};
      const res = createMockResponse();

      await controller.getTechniciansWorkingToday(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "DB error" });
    });
  });

  describe("assignRescueTechnician", () => {
    it("should return 400 when customerId or technicianId is missing", async () => {
      const req = { body: { customerId: 1 } };
      const res = createMockResponse();

      await controller.assignRescueTechnician(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Thiếu customerId hoặc technicianId",
      });
      expect(mockAssignRescueTechnician).not.toHaveBeenCalled();
    });

    it("should assign rescue technician successfully", async () => {
      const fakeRescue = { id: 12, customerId: 1, technicianId: 5 };
      mockAssignRescueTechnician.mockResolvedValue(fakeRescue);
      const req = {
        body: {
          customerId: 1,
          technicianId: 5,
          customerLat: 10.1,
          customerLng: 106.6,
        },
      };
      const res = createMockResponse();

      await controller.assignRescueTechnician(req, res);

      expect(mockAssignRescueTechnician).toHaveBeenCalledWith(1, 5, 10.1, 106.6);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: fakeRescue,
        message: "Phân công kỹ thuật viên thành công",
      });
    });
  });
});
