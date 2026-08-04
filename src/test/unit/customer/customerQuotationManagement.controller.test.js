const quoteManagementService = require("../../../service/customer/quoteManagement.service");

jest.mock("../../../service/customer/quoteManagement.service", () => ({
  getPendingQuotations: jest.fn(),
  getQuotationHistory: jest.fn(),
  getQuotationById: jest.fn(),
  approveQuotation: jest.fn(),
  rejectQuotation: jest.fn(),
}));

const controller = require("../../../controller/customer/quoteManagement.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-07: Customer Quotation Management Controller Tests (Customer Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. View Quotation
   * ========================================================================== */
  describe("View Quotation", () => {
    it("UTCID01 - View Quotation - should return 200 OK with list of pending quotations", async () => {
      const mockQuotations = [
        { id: 1, total_amount: 500000, deposit_amount: 100000, status: "PENDING" },
      ];
      quoteManagementService.getPendingQuotations.mockResolvedValue(mockQuotations);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.getPendingQuotations(req, res);

      expect(quoteManagementService.getPendingQuotations).toHaveBeenCalledWith(10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockQuotations });
    });

    it("UTCID02 - View Quotation - should return 200 OK with quotation history (approved/rejected)", async () => {
      const mockHistory = [
        { id: 2, total_amount: 1200000, status: "APPROVED" },
        { id: 3, total_amount: 300000, status: "REJECTED" },
      ];
      quoteManagementService.getQuotationHistory.mockResolvedValue(mockHistory);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.getQuotationHistory(req, res);

      expect(quoteManagementService.getQuotationHistory).toHaveBeenCalledWith(10);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockHistory });
    });

    it("UTCID03 - View Quotation - should return 404 Not Found when customer profile is not found", async () => {
      const error = { status: 404, message: "Không tìm thấy thông tin khách hàng" };
      quoteManagementService.getPendingQuotations.mockRejectedValue(error);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 99 };

      await controller.getPendingQuotations(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Không tìm thấy thông tin khách hàng" });
    });

    it("UTCID04 - View Quotation - should return 500 Internal Server Error when database fails", async () => {
      quoteManagementService.getPendingQuotations.mockRejectedValue(new Error("Database connection error"));

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.getPendingQuotations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Database connection error" });
    });
  });

  /* ==========================================================================
   * 2. View Quotation Detail
   * ========================================================================== */
  describe("View Quotation Detail", () => {
    it("UTCID05 - View Quotation Detail - should return 200 OK with detailed quotation data", async () => {
      const mockDetail = {
        id: 1,
        total_amount: 500000,
        status: "PENDING",
        items: [{ id: 101, custom_item_name: "Thay dầu nhớt", amount: 200000 }],
      };
      quoteManagementService.getQuotationById.mockResolvedValue(mockDetail);

      const req = { params: { id: "1" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.getQuotationById(req, res);

      expect(quoteManagementService.getQuotationById).toHaveBeenCalledWith(10, "1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockDetail });
    });

    it("UTCID06 - View Quotation Detail - should return 404 Not Found when quotation ID does not exist", async () => {
      const error = { status: 404, message: "Báo giá không tồn tại" };
      quoteManagementService.getQuotationById.mockRejectedValue(error);

      const req = { params: { id: "999" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Báo giá không tồn tại" });
    });

    it("UTCID07 - View Quotation Detail - should return 500 Internal Server Error on database exception", async () => {
      quoteManagementService.getQuotationById.mockRejectedValue(new Error("Unexpected DB failure"));

      const req = { params: { id: "1" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Unexpected DB failure" });
    });
  });

  /* ==========================================================================
   * 3. Approve Quotation
   * ========================================================================== */
  describe("Approve Quotation", () => {
    it("UTCID08 - Approve Quotation - should return 200 OK when quotation is successfully approved", async () => {
      quoteManagementService.approveQuotation.mockResolvedValue({});

      const req = { params: { id: "1" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.approveQuotation(req, res);

      expect(quoteManagementService.approveQuotation).toHaveBeenCalledWith(10, "1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Duyệt báo giá thành công" });
    });

    it("UTCID09 - Approve Quotation - should return 403 Forbidden when customer does not own the quotation", async () => {
      const error = { status: 403, message: "Bạn không có quyền duyệt báo giá này" };
      quoteManagementService.approveQuotation.mockRejectedValue(error);

      const req = { params: { id: "1" } };
      const res = createMockResponse();
      res.locals.user = { id: 88 };

      await controller.approveQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Bạn không có quyền duyệt báo giá này" });
    });

    it("UTCID10 - Approve Quotation - should return 400 Bad Request when quotation has already been processed", async () => {
      const error = { status: 400, message: "Báo giá đã được xử lý, không thể thay đổi" };
      quoteManagementService.approveQuotation.mockRejectedValue(error);

      const req = { params: { id: "1" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.approveQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Báo giá đã được xử lý, không thể thay đổi" });
    });

    it("UTCID11 - Approve Quotation - should return 404 Not Found when quotation ID does not exist", async () => {
      const error = { status: 404, message: "Báo giá không tồn tại" };
      quoteManagementService.approveQuotation.mockRejectedValue(error);

      const req = { params: { id: "999" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.approveQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Báo giá không tồn tại" });
    });
  });

  /* ==========================================================================
   * 4. Reject Quotation
   * ========================================================================== */
  describe("Reject Quotation", () => {
    it("UTCID12 - Reject Quotation - should return 200 OK when rejection reason is valid", async () => {
      quoteManagementService.rejectQuotation.mockResolvedValue({});

      const req = { params: { id: "1" }, body: { reason: "Giá quá cao" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.rejectQuotation(req, res);

      expect(quoteManagementService.rejectQuotation).toHaveBeenCalledWith(10, "1", "Giá quá cao");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Từ chối báo giá thành công" });
    });

    it("UTCID13 - Reject Quotation - should return 400 Bad Request when rejection reason is missing or empty", async () => {
      const error = { status: 400, message: "Vui lòng nhập lý do từ chối báo giá" };
      quoteManagementService.rejectQuotation.mockRejectedValue(error);

      const req = { params: { id: "1" }, body: { reason: "" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.rejectQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Vui lòng nhập lý do từ chối báo giá" });
    });

    it("UTCID14 - Reject Quotation - should return 403 Forbidden when user is not authorized to reject quotation", async () => {
      const error = { status: 403, message: "Bạn không có quyền từ chối báo giá này" };
      quoteManagementService.rejectQuotation.mockRejectedValue(error);

      const req = { params: { id: "1" }, body: { reason: "Không phù hợp" } };
      const res = createMockResponse();
      res.locals.user = { id: 77 };

      await controller.rejectQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Bạn không có quyền từ chối báo giá này" });
    });

    it("UTCID15 - Reject Quotation - should return 400 Bad Request when quotation status is no longer PENDING", async () => {
      const error = { status: 400, message: "Báo giá đã được xử lý, không thể thay đổi" };
      quoteManagementService.rejectQuotation.mockRejectedValue(error);

      const req = { params: { id: "1" }, body: { reason: "Hủy bỏ" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.rejectQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Báo giá đã được xử lý, không thể thay đổi" });
    });
  });

  /* ==========================================================================
   * 5. View Quotation PDF
   * ========================================================================== */
  describe("View Quotation PDF", () => {
    it("UTCID16 - View Quotation PDF - should return 200 OK with quotation PDF data", async () => {
      const mockPdfData = {
        id: 1,
        pdfUrl: "/pdf/quotation-1.pdf",
        total_amount: 500000,
      };
      quoteManagementService.getQuotationById.mockResolvedValue(mockPdfData);

      const req = { params: { id: "1" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockPdfData });
    });

    it("UTCID17 - View Quotation PDF - should return 404 Not Found when PDF document target does not exist", async () => {
      const error = { status: 404, message: "Báo giá không tồn tại" };
      quoteManagementService.getQuotationById.mockRejectedValue(error);

      const req = { params: { id: "999" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Báo giá không tồn tại" });
    });

    it("UTCID18 - View Quotation PDF - should return 500 Internal Server Error when PDF generation crashes", async () => {
      quoteManagementService.getQuotationById.mockRejectedValue(new Error("PDF generation stream failure"));

      const req = { params: { id: "1" } };
      const res = createMockResponse();
      res.locals.user = { id: 10 };

      await controller.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "PDF generation stream failure" });
    });
  });
});
