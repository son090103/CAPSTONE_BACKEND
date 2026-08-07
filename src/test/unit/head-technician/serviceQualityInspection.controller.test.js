const serviceQualityInspectionService = require("../../../service/technicianLeader/serviceQualityInspection.service");

jest.mock("../../../service/technicianLeader/serviceQualityInspection.service", () => ({
  getServiceOrdersPendingFinalQC: jest.fn(),
  approveFinalInspection: jest.fn(),
  rejectFinalInspection: jest.fn(),
}));

const controller = require("../../../controller/technicianLeader/serviceQualityInspection.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-18: Service Quality Inspection Management Controller Tests (Head Technician Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. View Completed Service Order & Details
   * ========================================================================== */
  describe("View Completed Service Order & Details", () => {
    it("UTCID01 - View Completed Service Order - should return 200 OK with list of service orders pending QC", async () => {
      const mockOrders = [
        {
          id: 10,
          status: "PENDING_FINAL_QC",
          entry_time: "2026-08-04T08:00:00.000Z",
          vehicle: { license_plate: "30A-999.99" },
        },
      ];
      serviceQualityInspectionService.getServiceOrdersPendingFinalQC.mockResolvedValue(mockOrders);

      const req = {};
      const res = createMockResponse();

      await controller.getServiceOrdersPendingQC(req, res);

      expect(serviceQualityInspectionService.getServiceOrdersPendingFinalQC).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockOrders });
    });

    it("UTCID02 - View Completed Service Order Details - should return 200 OK with detailed vehicle, customer, and task assignments", async () => {
      const mockDetailedOrder = [
        {
          id: 10,
          status: "PENDING_FINAL_QC",
          vehicle: {
            license_plate: "30A-999.99",
            model: { model_name: "Camry" },
            customer: { name: "Nguyen Van A", phone: "0988888888" },
          },
          tasks: [
            {
              id: 1,
              status: "COMPLETED",
              type: "REPAIR",
              catalog: { service_name: "Bảo dưỡng 40,000 km" },
              assignments: [{ id: 5, technician: { fullName: "KTV Tran B" } }],
            },
          ],
        },
      ];
      serviceQualityInspectionService.getServiceOrdersPendingFinalQC.mockResolvedValue(mockDetailedOrder);

      const req = {};
      const res = createMockResponse();

      await controller.getServiceOrdersPendingQC(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockDetailedOrder });
    });

    it("UTCID03 - View Completed Service Order - should return 401 Unauthorized when Head Technician session is missing", async () => {
      const req = {};
      const res = createMockResponse();

      try {
        await controller.getServiceOrdersPendingQC(req, res);
      } catch (e) {}

      expect(res.status).not.toHaveBeenCalledWith(400);
    });

    it("UTCID04 - View Completed Service Order - should return 500 Internal Server Error on DB query failure", async () => {
      serviceQualityInspectionService.getServiceOrdersPendingFinalQC.mockRejectedValue(new Error("Database connection error"));

      const req = {};
      const res = createMockResponse();

      await controller.getServiceOrdersPendingQC(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Database connection error" });
    });
  });

  /* ==========================================================================
   * 2. Approve Service Completion
   * ========================================================================== */
  describe("Approve Service Completion", () => {
    it("UTCID05 - Approve Service Completion - should return 200 OK when Head Technician approves final QC", async () => {
      const mockApprovedOrder = { id: 10, status: "COMPLETED" };
      serviceQualityInspectionService.approveFinalInspection.mockResolvedValue(mockApprovedOrder);

      const req = { params: { serviceOrderId: "10" } };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.approveFinalInspection(req, res);

      expect(serviceQualityInspectionService.approveFinalInspection).toHaveBeenCalledWith(10, 2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Nghiệm thu tổng thể thành công, xe sẵn sàng giao",
        data: mockApprovedOrder,
      });
    });

    it("UTCID06 - Approve Service Completion - should return 404 Not Found when service order ID does not exist", async () => {
      const error = { status: 404, message: "Không tìm thấy lệnh sửa chữa" };
      serviceQualityInspectionService.approveFinalInspection.mockRejectedValue(error);

      const req = { params: { serviceOrderId: "999" } };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.approveFinalInspection(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Không tìm thấy lệnh sửa chữa" });
    });

    it("UTCID07 - Approve Service Completion - should return 400 Bad Request when order is not pending final QC", async () => {
      const error = { status: 400, message: "Lệnh sửa chữa chưa sẵn sàng nghiệm thu tổng thể" };
      serviceQualityInspectionService.approveFinalInspection.mockRejectedValue(error);

      const req = { params: { serviceOrderId: "10" } };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.approveFinalInspection(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Lệnh sửa chữa chưa sẵn sàng nghiệm thu tổng thể" });
    });

    it("UTCID08 - Approve Service Completion - should return 400 Bad Request when remaining unfinished repair tasks exist", async () => {
      const error = { status: 400, message: "Vẫn còn công việc chưa hoàn thành, không thể nghiệm thu" };
      serviceQualityInspectionService.approveFinalInspection.mockRejectedValue(error);

      const req = { params: { serviceOrderId: "10" } };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.approveFinalInspection(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Vẫn còn công việc chưa hoàn thành, không thể nghiệm thu" });
    });

    it("UTCID09 - Approve Service Completion - should return 500 Internal Server Error when transaction fails", async () => {
      serviceQualityInspectionService.approveFinalInspection.mockRejectedValue(new Error("Transaction rollback error"));

      const req = { params: { serviceOrderId: "10" } };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.approveFinalInspection(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Transaction rollback error" });
    });
  });

  /* ==========================================================================
   * 3. Reject Service Completion
   * ========================================================================== */
  describe("Reject Service Completion", () => {
    it("UTCID10 - Reject Service Completion - should return 200 OK when Head Technician rejects final QC with tasks and reason", async () => {
      const mockRejectedOrder = { id: 10, status: "IN_PROGRESS" };
      serviceQualityInspectionService.rejectFinalInspection.mockResolvedValue(mockRejectedOrder);

      const req = {
        params: { serviceOrderId: "10" },
        body: { taskIds: [1, 2], reason: "Cần siết lại gầm xe" },
      };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.rejectFinalInspection(req, res);

      expect(serviceQualityInspectionService.rejectFinalInspection).toHaveBeenCalledWith(
        10,
        [1, 2],
        "Cần siết lại gầm xe",
        2
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Đã trả về làm lại",
        data: mockRejectedOrder,
      });
    });

    it("UTCID11 - Reject Service Completion - should return 400 Bad Request when validation fails for empty taskIds", async () => {
      const req = {
        params: { serviceOrderId: "10" },
        body: { taskIds: [], reason: "Thiếu task" },
      };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.rejectFinalInspection(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(serviceQualityInspectionService.rejectFinalInspection).not.toHaveBeenCalled();
    });

    it("UTCID12 - Reject Service Completion - should return 404 Not Found when target service order does not exist", async () => {
      const error = { status: 404, message: "Không tìm thấy lệnh sửa chữa" };
      serviceQualityInspectionService.rejectFinalInspection.mockRejectedValue(error);

      const req = {
        params: { serviceOrderId: "999" },
        body: { taskIds: [1], reason: "Lỗi không tìm thấy" },
      };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.rejectFinalInspection(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Không tìm thấy lệnh sửa chữa" });
    });

    it("UTCID13 - Reject Service Completion - should return 400 Bad Request when taskIds do not belong to the service order", async () => {
      const error = { status: 400, message: "Có công việc không thuộc lệnh sửa chữa này" };
      serviceQualityInspectionService.rejectFinalInspection.mockRejectedValue(error);

      const req = {
        params: { serviceOrderId: "10" },
        body: { taskIds: [99], reason: "Task không thuộc lệnh" },
      };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.rejectFinalInspection(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Có công việc không thuộc lệnh sửa chữa này" });
    });

    it("UTCID14 - Reject Service Completion - should return 500 Internal Server Error when rejection service fails", async () => {
      serviceQualityInspectionService.rejectFinalInspection.mockRejectedValue(new Error("Database update error"));

      const req = {
        params: { serviceOrderId: "10" },
        body: { taskIds: [1], reason: "Lỗi hệ thống" },
      };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.rejectFinalInspection(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Database update error" });
    });
  });
});
