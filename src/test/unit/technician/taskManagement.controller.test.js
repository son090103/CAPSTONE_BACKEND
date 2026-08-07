const taskAssignmentService = require("../../../service/technician/taskAssignment.service");

jest.mock("../../../service/technician/taskAssignment.service", () => ({
  getTaskAssignment: jest.fn(),
  getServiceOrderDetail: jest.fn(),
  startTask: jest.fn(),
  completeTask: jest.fn(),
  pauseTask: jest.fn(),
  resumeTask: jest.fn(),
  getCompletedTasks: jest.fn(),
  getRequestablePartsForServiceOrder: jest.fn(),
  requestExportParts: jest.fn(),
}));

const controller = require("../../../controller/technician/taskAssignment.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-16: Technician Task Management Controller Tests (Technician Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. View Task Assignments
   * ========================================================================== */
  describe("View Task Assignments", () => {
    it("UTCID01 - View Task Assignments - should return 200 OK with active assigned task list", async () => {
      const mockAssignments = [
        { id: 1, task_id: 10, status: "ASSIGNED", bay_id: 2, role_in_task: "LEAD" },
      ];
      taskAssignmentService.getTaskAssignment.mockResolvedValue(mockAssignments);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.getTaskAssignment(req, res);

      expect(taskAssignmentService.getTaskAssignment).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockAssignments);
    });

    it("UTCID02 - View Task Assignments - should return 200 OK with technician completed tasks list", async () => {
      const mockCompleted = [
        { id: 2, task_id: 11, status: "COMPLETED", role_in_task: "LEAD" },
      ];
      taskAssignmentService.getCompletedTasks.mockResolvedValue(mockCompleted);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.getMyCompletedTasks(req, res);

      expect(taskAssignmentService.getCompletedTasks).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockCompleted });
    });

    it("UTCID03 - View Task Assignments - should return 401 Unauthorized when technician session is missing", async () => {
      const req = {};
      const res = createMockResponse();

      try {
        await controller.getTaskAssignment(req, res);
      } catch (e) {}

      expect(taskAssignmentService.getTaskAssignment).not.toHaveBeenCalled();
    });

    it("UTCID04 - View Task Assignments - should return 500 Internal Server Error when database fails", async () => {
      taskAssignmentService.getTaskAssignment.mockRejectedValue(new Error("Database connection error"));

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.getTaskAssignment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Database connection error",
      });
    });
  });

  /* ==========================================================================
   * 2. View Task Assignments Detail
   * ========================================================================== */
  describe("View Task Assignments Detail", () => {
    it("UTCID05 - View Task Assignments Detail - should return 200 OK with detailed service order data", async () => {
      const mockOrderDetail = {
        id: 10,
        status: "IN_PROGRESS",
        vehicle: { license_plate: "30A-123.45" },
        tasks: [{ id: 101, type: "REPAIR", status: "IN_PROGRESS" }],
      };
      taskAssignmentService.getServiceOrderDetail.mockResolvedValue(mockOrderDetail);

      const req = { params: { id: "10" } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.getServiceOrderDetail(req, res);

      expect(taskAssignmentService.getServiceOrderDetail).toHaveBeenCalledWith("10", 5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockOrderDetail);
    });

    it("UTCID06 - View Task Assignments Detail - should return 404 Not Found when order ID does not exist", async () => {
      const error = { status: 404, message: "Lệnh sửa chữa không tồn tại" };
      taskAssignmentService.getServiceOrderDetail.mockRejectedValue(error);

      const req = { params: { id: "999" } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.getServiceOrderDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Lệnh sửa chữa không tồn tại",
      });
    });

    it("UTCID07 - View Task Assignments Detail - should return 500 Internal Server Error when detail query fails", async () => {
      taskAssignmentService.getServiceOrderDetail.mockRejectedValue(new Error("Internal service error"));

      const req = { params: { id: "10" } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.getServiceOrderDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Internal service error",
      });
    });
  });

  /* ==========================================================================
   * 3. Update Progress Status
   * ========================================================================== */
  describe("Update Progress Status", () => {
    it("UTCID08 - Update Progress Status - should return 200 OK when starting task assignment", async () => {
      const mockResult = { id: 1, status: "IN_PROGRESS" };
      taskAssignmentService.startTask.mockResolvedValue(mockResult);

      const req = { body: { taskAssignmentId: 1 } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.startTask(req, res);

      expect(taskAssignmentService.startTask).toHaveBeenCalledWith(1, 5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đã bắt đầu công việc thành công.",
        data: mockResult,
      });
    });

    it("UTCID09 - Update Progress Status - should return 200 OK when completing task assignment with note", async () => {
      const mockResult = { id: 1, status: "COMPLETED" };
      taskAssignmentService.completeTask.mockResolvedValue(mockResult);

      const req = { body: { taskAssignmentId: 1, content: "Hoàn thành thay nhớt" } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.completeTask(req, res);

      expect(taskAssignmentService.completeTask).toHaveBeenCalledWith(1, 5, "Hoàn thành thay nhớt");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đã hoàn thành công việc thành công.",
        data: mockResult,
      });
    });

    it("UTCID10 - Update Progress Status - should return 200 OK when pausing task assignment", async () => {
      const mockResult = { id: 1, status: "PAUSED" };
      taskAssignmentService.pauseTask.mockResolvedValue(mockResult);

      const req = { body: { taskAssignmentId: 1, reason: "Chờ phụ tùng", status: "PAUSED" } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.pauseTask(req, res);

      expect(taskAssignmentService.pauseTask).toHaveBeenCalledWith(1, 5, "Chờ phụ tùng", "PAUSED");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Đã tạm dừng công việc.",
        data: mockResult,
      });
    });

    it("UTCID11 - Update Progress Status - should return 200 OK when resuming paused task assignment", async () => {
      const mockResult = { id: 1, status: "IN_PROGRESS" };
      taskAssignmentService.resumeTask.mockResolvedValue(mockResult);

      const req = { body: { taskAssignmentId: 1 } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.resumeTask(req, res);

      expect(taskAssignmentService.resumeTask).toHaveBeenCalledWith(1, 5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Đã tiếp tục công việc.",
        data: mockResult,
      });
    });

    it("UTCID12 - Update Progress Status - should return 400 Bad Request when taskAssignmentId is missing", async () => {
      const req = { body: {} };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.startTask(req, res);

      expect(taskAssignmentService.startTask).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Vui lòng truyền taskAssignmentId vào body.",
      });
    });

    it("UTCID13 - Update Progress Status - should return 403 Forbidden when technician is not assigned to the task", async () => {
      const error = { status: 403, message: "Bạn không được phân công nhiệm vụ này" };
      taskAssignmentService.startTask.mockRejectedValue(error);

      const req = { body: { taskAssignmentId: 99 } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.startTask(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Bạn không được phân công nhiệm vụ này",
      });
    });

    it("UTCID14 - Update Progress Status - should return 400 Bad Request when starting an already completed task", async () => {
      const error = { status: 400, message: "Công việc đã hoàn thành, không thể thay đổi trạng thái" };
      taskAssignmentService.startTask.mockRejectedValue(error);

      const req = { body: { taskAssignmentId: 1 } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.startTask(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Công việc đã hoàn thành, không thể thay đổi trạng thái",
      });
    });
  });

  /* ==========================================================================
   * 4. Request Parts Export
   * ========================================================================== */
  describe("Request Parts Export", () => {
    it("UTCID15 - Request Parts Export - should return 200 OK when requesting spare parts export", async () => {
      const mockResult = { exportTicketId: 100, status: "PENDING" };
      taskAssignmentService.requestExportParts.mockResolvedValue(mockResult);

      const req = { params: { serviceOrderId: "10" }, body: { detailIds: [1, 2] } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.requestExportParts(req, res);

      expect(taskAssignmentService.requestExportParts).toHaveBeenCalledWith("10", 5, [1, 2]);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đã gửi yêu cầu xuất kho",
        data: mockResult,
      });
    });

    it("UTCID16 - Request Parts Export - should return 200 OK with requestable spare parts list", async () => {
      const mockParts = [
        { id: 1, spare_part_name: "Lọc dầu", quantity: 1, isRequested: false },
      ];
      taskAssignmentService.getRequestablePartsForServiceOrder.mockResolvedValue(mockParts);

      const req = { params: { serviceOrderId: "10" } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.getRequestableParts(req, res);

      expect(taskAssignmentService.getRequestablePartsForServiceOrder).toHaveBeenCalledWith("10", 5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockParts,
      });
    });

    it("UTCID17 - Request Parts Export - should return 400 Bad Request when detailIds array is empty", async () => {
      const req = { params: { serviceOrderId: "10" }, body: { detailIds: [] } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.requestExportParts(req, res);

      expect(taskAssignmentService.requestExportParts).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Vui lòng chọn ít nhất 1 phụ tùng cần xuất.",
      });
    });

    it("UTCID18 - Request Parts Export - should return 404 Not Found when service order is not found", async () => {
      const error = { status: 404, message: "Lệnh sửa chữa không tồn tại" };
      taskAssignmentService.requestExportParts.mockRejectedValue(error);

      const req = { params: { serviceOrderId: "999" }, body: { detailIds: [1] } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.requestExportParts(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Lệnh sửa chữa không tồn tại",
      });
    });

    it("UTCID19 - Request Parts Export - should return 500 Internal Server Error on inventory service failure", async () => {
      taskAssignmentService.requestExportParts.mockRejectedValue(new Error("Inventory service failure"));

      const req = { params: { serviceOrderId: "10" }, body: { detailIds: [1] } };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.requestExportParts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Inventory service failure",
      });
    });
  });
});
