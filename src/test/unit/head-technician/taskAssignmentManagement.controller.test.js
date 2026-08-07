const taskAssignmentService = require("../../../service/technicianLeader/taskAssignmentManagement.service");

jest.mock("../../../service/technicianLeader/taskAssignmentManagement.service", () => ({
  getAllTasks: jest.fn(),
  assignTask: jest.fn(),
  getAssignmentHistory: jest.fn(),
  updateAssignment: jest.fn(),
  getAllTechnician: jest.fn(),
}));

const controller = require("../../../controller/technicianLeader/taskAssignmentManagement.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-19: Head Technician Task Assignment Management Controller Tests (Head Technician Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. Assign Task
   * ========================================================================== */
  describe("Assign Task", () => {
    it("UTCID01 - Assign Task - should return 201 Created when Head Technician successfully assigns task", async () => {
      const mockResult = { id: 10, task_ids: [1], technician_id: 5, status: "ASSIGNED" };
      taskAssignmentService.assignTask.mockResolvedValue(mockResult);

      const req = {
        body: {
          task_ids: [1],
          technician_id: 5,
        },
      };
      const res = createMockResponse();

      await controller.assignTask(req, res);

      expect(taskAssignmentService.assignTask).toHaveBeenCalledWith({
        task_ids: [1],
        technician_id: 5,
      });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Phân công thành công",
        data: mockResult,
      });
    });

    it("UTCID02 - Assign Task - should return 400 Bad Request when validation fails for missing technician or task payload", async () => {
      const req = {
        body: {
          task_ids: [],
          technician_id: null,
        },
      };
      const res = createMockResponse();

      await controller.assignTask(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(taskAssignmentService.assignTask).not.toHaveBeenCalled();
    });

    it("UTCID03 - Assign Task - should return 500 Internal Server Error when assignment service fails", async () => {
      taskAssignmentService.assignTask.mockRejectedValue(new Error("Database transaction error"));

      const req = {
        body: {
          task_ids: [1],
          technician_id: 5,
        },
      };
      const res = createMockResponse();

      await controller.assignTask(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Database transaction error" });
    });
  });

  /* ==========================================================================
   * 2. View Staffs
   * ========================================================================== */
  describe("View Staffs", () => {
    it("UTCID04 - View Staffs - should return 200 OK with list of all technicians/staff", async () => {
      const mockTechnicians = [
        { id: 5, fullName: "Nguyen Van KTV", role: "TECHNICIAN", is_available: true },
        { id: 6, fullName: "Tran Van B", role: "TECHNICIAN", is_available: false },
      ];
      taskAssignmentService.getAllTechnician.mockResolvedValue(mockTechnicians);

      const req = {};
      const res = createMockResponse();

      await controller.getAllTechnician(req, res);

      expect(taskAssignmentService.getAllTechnician).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockTechnicians });
    });

    it("UTCID05 - View Staffs - should return 500 Internal Server Error when staff query fails", async () => {
      taskAssignmentService.getAllTechnician.mockRejectedValue(new Error("User service error"));

      const req = {};
      const res = createMockResponse();

      await controller.getAllTechnician(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "User service error" });
    });
  });

  /* ==========================================================================
   * 3. View Task History
   * ========================================================================== */
  describe("View Task History", () => {
    it("UTCID06 - View Task History - should return 200 OK with assignment history logs", async () => {
      const mockHistory = [
        { id: 1, task_id: 10, technician: { fullName: "Nguyen Van A" }, assignedAt: "2026-08-04T09:00:00.000Z" },
      ];
      taskAssignmentService.getAssignmentHistory.mockResolvedValue(mockHistory);

      const req = {};
      const res = createMockResponse();

      await controller.getAssignmentHistory(req, res);

      expect(taskAssignmentService.getAssignmentHistory).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockHistory });
    });

    it("UTCID07 - View Task History - should return 200 OK with list of all service order tasks", async () => {
      const mockTasks = [
        { id: 10, type: "REPAIR", status: "IN_PROGRESS", service_order_id: 2 },
      ];
      taskAssignmentService.getAllTasks.mockResolvedValue(mockTasks);

      const req = {};
      const res = createMockResponse();

      await controller.getAllTasks(req, res);

      expect(taskAssignmentService.getAllTasks).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockTasks });
    });

    it("UTCID08 - View Task History - should return 500 Internal Server Error when history query crashes", async () => {
      taskAssignmentService.getAssignmentHistory.mockRejectedValue(new Error("History DB query error"));

      const req = {};
      const res = createMockResponse();

      await controller.getAssignmentHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "History DB query error" });
    });
  });

  /* ==========================================================================
   * 4. Update Assigned Task
   * ========================================================================== */
  describe("Update Assigned Task", () => {
    it("UTCID09 - Update Assigned Task - should return 200 OK when Head Technician reassigns task to new technician", async () => {
      const mockUpdated = { id: 10, technician_id: 6, status: "REASSIGNED" };
      taskAssignmentService.updateAssignment.mockResolvedValue(mockUpdated);

      const req = { params: { assignmentId: "10" }, body: { technician_id: 6 } };
      const res = createMockResponse();

      await controller.updateAssignment(req, res);

      expect(taskAssignmentService.updateAssignment).toHaveBeenCalledWith(10, 6);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Đổi kỹ thuật viên thành công",
        data: mockUpdated,
      });
    });

    it("UTCID10 - Update Assigned Task - should return 400 Bad Request when technician_id is missing", async () => {
      const req = { params: { assignmentId: "10" }, body: {} };
      const res = createMockResponse();

      await controller.updateAssignment(req, res);

      expect(taskAssignmentService.updateAssignment).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Vui lòng chọn kỹ thuật viên" });
    });

    it("UTCID11 - Update Assigned Task - should return 404 Not Found when target assignment ID does not exist", async () => {
      const error = { status: 404, message: "Không tìm thấy phân công công việc" };
      taskAssignmentService.updateAssignment.mockRejectedValue(error);

      const req = { params: { assignmentId: "999" }, body: { technician_id: 6 } };
      const res = createMockResponse();

      await controller.updateAssignment(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Không tìm thấy phân công công việc" });
    });

    it("UTCID12 - Update Assigned Task - should return 500 Internal Server Error when update operation fails", async () => {
      taskAssignmentService.updateAssignment.mockRejectedValue(new Error("Update assignment service failure"));

      const req = { params: { assignmentId: "10" }, body: { technician_id: 6 } };
      const res = createMockResponse();

      await controller.updateAssignment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Update assignment service failure" });
    });
  });
});
