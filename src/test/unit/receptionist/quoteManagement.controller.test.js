const mockGetIssueReports = jest.fn();
const mockGetAdditionalIssueReports = jest.fn();
const mockGetPaymentSummaryByServiceOrder = jest.fn();
const mockGetSpareParts = jest.fn();
const mockGetAllService = jest.fn();
const mockCreateQuotation = jest.fn();
const mockUpdateQuotation = jest.fn();
const mockGetQuoteHistory = jest.fn();
const mockGetQuotationById = jest.fn();
const mockApproveQuotationByOTP = jest.fn();

jest.mock("../../../service/receptionist/quoteManagement.service", () => ({
  getIssuesReports: mockGetIssueReports,
  getAdditionalIssuesReports: mockGetAdditionalIssueReports,
  getPaymentSummaryByServiceOrder: mockGetPaymentSummaryByServiceOrder,
  getSpareParts: mockGetSpareParts,
  getAllService: mockGetAllService,
  createQuotation: mockCreateQuotation,
  updateQuotation: mockUpdateQuotation,
  getQuoteHistory: mockGetQuoteHistory,
  getQuotationById: mockGetQuotationById,
  approveQuotationByOTP: mockApproveQuotationByOTP,
}));

const controller = require("../../../controller/receptionist/quoteManagement.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = { user: { id: 1 } };
  return res;
};

describe("QuoteManagement Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getIssueReports", () => {
    it("should return issue reports", async () => {
      const fakeData = [{ id: 1, issue_name: "Lỗi phanh" }];
      mockGetIssueReports.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getIssueReports(req, res);

      expect(mockGetIssueReports).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("getAdditionalIssueReports", () => {
    it("should return additional issue reports", async () => {
      const fakeData = [{ id: 1, issue_name: "Lỗi thêm" }];
      mockGetAdditionalIssueReports.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getAdditionalIssueReports(req, res);

      expect(mockGetAdditionalIssueReports).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("getPaymentSummary", () => {
    it("should return payment summary", async () => {
      const fakeData = { total: 100000 };
      mockGetPaymentSummaryByServiceOrder.mockResolvedValue(fakeData);
      const req = { params: { serviceOrderId: "5" } };
      const res = createMockResponse();

      await controller.getPaymentSummary(req, res);

      expect(mockGetPaymentSummaryByServiceOrder).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("getSpareParts", () => {
    it("should return spare parts", async () => {
      const fakeData = [{ id: 1, name: "Lốp" }];
      mockGetSpareParts.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getSpareParts(req, res);

      expect(mockGetSpareParts).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });
  });

  describe("getAllService", () => {
    it("should return all services", async () => {
      const fakeData = [{ id: 1, service_name: "Thay dầu" }];
      mockGetAllService.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getAllService(req, res);

      expect(mockGetAllService).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("createQuotation", () => {
    it("should return 400 when validation fails", async () => {
      const req = { body: { task_id: "abc" } };
      const res = createMockResponse();

      await controller.createQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: expect.any(String) });
      expect(mockCreateQuotation).not.toHaveBeenCalled();
    });

    it("should create quotation successfully", async () => {
      const fakeData = { id: 1 };
      mockCreateQuotation.mockResolvedValue(fakeData);
      const req = {
        body: {
          task_id: 5,
          note: "Ghi chú",
          deposit_amount: 100000,
          items: [
            {
              spare_part_id: 1,
              quantity: 2,
              unit_price: 50000,
            },
          ],
        },
      };
      const res = createMockResponse();

      await controller.createQuotation(req, res);

      expect(mockCreateQuotation).toHaveBeenCalledWith(
        expect.objectContaining({ task_id: 5, deposit_amount: 100000 }),
        1,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Tạo báo giá thành công",
        data: fakeData,
      });
    });
  });

  describe("updateQuotation", () => {
    it("should return 400 when validation fails", async () => {
      const req = { params: { id: "1" }, body: { items: [] } };
      const res = createMockResponse();

      await controller.updateQuotation(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: expect.any(String) });
      expect(mockUpdateQuotation).not.toHaveBeenCalled();
    });

    it("should update quotation successfully", async () => {
      const fakeData = { id: 1 };
      mockUpdateQuotation.mockResolvedValue(fakeData);
      const req = {
        params: { id: "1" },
        body: {
          items: [
            {
              spare_part_id: 1,
              quantity: 2,
              unit_price: 50000,
            },
          ],
          note: "Cập nhật",
        },
      };
      const res = createMockResponse();

      await controller.updateQuotation(req, res);

      expect(mockUpdateQuotation).toHaveBeenCalledWith(
        "1",
        expect.objectContaining({ note: "Cập nhật" }),
        1,
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Cập nhật báo giá thành công",
        data: fakeData,
      });
    });
  });

  describe("getQuoteHistory", () => {
    it("should return quote history", async () => {
      const fakeData = [{ id: 1 }];
      mockGetQuoteHistory.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getQuoteHistory(req, res);

      expect(mockGetQuoteHistory).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });
  });

  describe("getQuotationById", () => {
    it("should return quotation by id", async () => {
      const fakeData = { id: 1 };
      mockGetQuotationById.mockResolvedValue(fakeData);
      const req = { params: { id: "1" } };
      const res = createMockResponse();

      await controller.getQuotationById(req, res);

      expect(mockGetQuotationById).toHaveBeenCalledWith("1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  describe("approveQuoteByOTP", () => {
    it("should return 400 when idToken is missing", async () => {
      const req = { params: { id: "1" }, body: {} };
      const res = createMockResponse();

      await controller.approveQuoteByOTP(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Thiếu mã xác thực OTP" });
      expect(mockApproveQuotationByOTP).not.toHaveBeenCalled();
    });

    it("should approve quotation by otp", async () => {
      mockApproveQuotationByOTP.mockResolvedValue(undefined);
      const req = { params: { id: "1" }, body: { idToken: "OTP-123" } };
      const res = createMockResponse();

      await controller.approveQuoteByOTP(req, res);

      expect(mockApproveQuotationByOTP).toHaveBeenCalledWith("1", "OTP-123");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Duyệt báo giá qua OTP thành công" });
    });
  });
});
