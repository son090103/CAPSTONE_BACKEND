const mockGetAllShiftSlots = jest.fn();
const mockCreateShiftSlot = jest.fn();
const mockUpdateShiftSlot = jest.fn();
const mockGetShiftTemplates = jest.fn();
const mockAssignShift = jest.fn();
const mockAutoGenerateSchedule = jest.fn();
const mockConfirmSchedule = jest.fn();

jest.mock("../../../service/admin/shift.service", () => ({
  getAllShiftSlots: mockGetAllShiftSlots,
  createShiftSlot: mockCreateShiftSlot,
  updateShiftSlot: mockUpdateShiftSlot,
  getShiftTemplates: mockGetShiftTemplates,
  assignShift: mockAssignShift,
  autoGenerateSchedule: mockAutoGenerateSchedule,
  confirmSchedule: mockConfirmSchedule,
}));

const controller = require("../../../controller/admin/shift.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Shift Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getAllShiftSlots", () => {
    it("should return shift slots", async () => {
      const fakeData = [{ id: 1 }];
      mockGetAllShiftSlots.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getAllShiftSlots(req, res);

      expect(mockGetAllShiftSlots).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("createShiftSlot", () => {
    it("should return 400 when validation fails", async () => {
      const req = { body: {} };
      const res = createMockResponse();

      await controller.createShiftSlot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.any(String),
      });
      expect(mockCreateShiftSlot).not.toHaveBeenCalled();
    });
  });

  describe("updateShiftSlot", () => {
    it("should return 400 when validation fails", async () => {
      const req = { params: { id: "1" }, body: { start_time: "bad" } };
      const res = createMockResponse();

      await controller.updateShiftSlot(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: expect.any(String),
      });
      expect(mockUpdateShiftSlot).not.toHaveBeenCalled();
    });
  });

  describe("getShiftTemplates", () => {
    it("should return templates on valid date query", async () => {
      const fakeData = [{ id: 1 }];
      mockGetShiftTemplates.mockResolvedValue(fakeData);
      const req = { query: { startDate: "2026-08-03", endDate: "2026-08-09" } };
      const res = createMockResponse();

      await controller.getShiftTemplates(req, res);

      expect(mockGetShiftTemplates).toHaveBeenCalledWith("2026-08-03", "2026-08-09");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("assignShift", () => {
    it("should assign shift on valid payload", async () => {
      const fakeResult = { id: 1 };
      mockAssignShift.mockResolvedValue(fakeResult);
      const req = {
        body: {
          userId: 1,
          slotIds: [1, 2],
          workDate: "2026-08-03",
        },
      };
      const res = createMockResponse();

      await controller.assignShift(req, res);

      expect(mockAssignShift).toHaveBeenCalledWith(1, [1, 2], "2026-08-03");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: fakeResult,
        message: "Đã cập nhật lịch làm việc",
      });
    });
  });

  describe("autoGenerateSchedule", () => {
    it("should return schedule generation summary", async () => {
      const fakeResult = { message: "Generated", totalGenerated: 10 };
      mockAutoGenerateSchedule.mockResolvedValue(fakeResult);
      const req = {
        body: { startDate: "2026-08-03", endDate: "2026-08-09" },
      };
      const res = createMockResponse();

      await controller.autoGenerateSchedule(req, res);

      expect(mockAutoGenerateSchedule).toHaveBeenCalledWith("2026-08-03", "2026-08-09");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Generated",
        totalGenerated: 10,
      });
    });
  });

  describe("confirmSchedule", () => {
    it("should confirm schedule successfully", async () => {
      mockConfirmSchedule.mockResolvedValue(undefined);
      const req = {
        body: { startDate: "2026-08-03", endDate: "2026-08-09" },
      };
      const res = createMockResponse();

      await controller.confirmSchedule(req, res);

      expect(mockConfirmSchedule).toHaveBeenCalledWith("2026-08-03", "2026-08-09");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Chốt lịch thành công! Nhân viên có thể thấy lịch này.",
      });
    });
  });
});
