jest.mock("../../../service/technicianLeader/quoteManagement.service", () => ({
  createQuotation: jest.fn(),
  updateQuotation: jest.fn(),
  getQuoteHistory: jest.fn(),
  getQuotationById: jest.fn(),
  createIssueReports: jest.fn(),
  getIssuesReports: jest.fn(),
}));

jest.mock("../../../validation/receptionist/quoteManagement.validation", () => ({
  createQuotationSchema: { safeParse: jest.fn() },
  updateQuotationSchema: { safeParse: jest.fn() },
}));

jest.mock("../../../validation/technicianLeader/issueReport.validation", () => ({
  createIssueReportSchema: { safeParse: jest.fn() },
}));

const quoteManagementService = require("../../../service/technicianLeader/quoteManagement.service");
const validationMocks = require("../../../validation/receptionist/quoteManagement.validation");
const issueReportValidationMocks = require("../../../validation/technicianLeader/issueReport.validation");
const controller = require("../../../controller/technicianLeader/quoteManagement.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = { user: { id: 100 } };
  return res;
};

describe("FE-22: Leader Quotation Management Controller Tests (Technician Leader Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createQuotation", () => {
    it("UTCID01 - Create Quotation - should return 400 when validation fails", async () => {
      const req = { body: { task_id: "bad" } };
      const res = createMockResponse();

      validationMocks.createQuotationSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Dữ liệu báo giá không hợp lệ" }] },
      });

      await controller.createQuotation(req, res);

      expect(validationMocks.createQuotationSchema.safeParse).toHaveBeenCalledWith({
        task_id: "bad",
        items: undefined,
        note: undefined,
        deposit_amount: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Dữ liệu báo giá không hợp lệ" });
      expect(quoteManagementService.createQuotation).not.toHaveBeenCalled();
    });

    it("UTCID02 - Create Quotation - should return 201 when quotation is created successfully", async () => {
      const req = {
        body: {
          task_id: 20,
          items: [{ spare_part_id: 5, quantity: 2, unit_price: 75000 }],
          note: "Yêu cầu thêm phụ tùng",
          deposit_amount: 150000,
        },
      };
      const res = createMockResponse();
      const fakeQuotation = { id: 77, total_amount: 300000 };

      validationMocks.createQuotationSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          task_id: 20,
          items: [{ spare_part_id: 5, quantity: 2, unit_price: 75000 }],
          note: "Yêu cầu thêm phụ tùng",
          deposit_amount: 150000,
        },
      });
      quoteManagementService.createQuotation.mockResolvedValue(fakeQuotation);

      await controller.createQuotation(req, res);

      expect(quoteManagementService.createQuotation).toHaveBeenCalledWith(
        {
          task_id: 20,
          items: [{ spare_part_id: 5, quantity: 2, unit_price: 75000 }],
          note: "Yêu cầu thêm phụ tùng",
          deposit_amount: 150000,
        },
        100,
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: "Tạo báo giá thành công", data: fakeQuotation });
    });
  });

  describe("updateQuotation", () => {
    it("UTCID03 - Update Quotation - should return 400 when validation fails", async () => {
      const req = { params: { id: "10" }, body: { items: [] } };
      const res = createMockResponse();

      validationMocks.updateQuotationSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Dữ liệu cập nhật báo giá không hợp lệ" }] },
      });

      await controller.updateQuotation(req, res);

      expect(quoteManagementService.updateQuotation).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Dữ liệu cập nhật báo giá không hợp lệ" });
    });

    it("UTCID04 - Update Quotation - should return 200 when quotation update succeeds", async () => {
      const req = {
        params: { id: "10" },
        body: {
          items: [{ spare_part_id: 5, quantity: 3, unit_price: 80000 }],
          note: "Điều chỉnh chi tiết",
        },
      };
      const res = createMockResponse();
      const fakeQuotation = { id: 10, status: "PENDING" };

      validationMocks.updateQuotationSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          items: [{ spare_part_id: 5, quantity: 3, unit_price: 80000 }],
          note: "Điều chỉnh chi tiết",
        },
      });
      quoteManagementService.updateQuotation.mockResolvedValue(fakeQuotation);

      await controller.updateQuotation(req, res);

      expect(quoteManagementService.updateQuotation).toHaveBeenCalledWith(
        "10",
        {
          items: [{ spare_part_id: 5, quantity: 3, unit_price: 80000 }],
          note: "Điều chỉnh chi tiết",
        },
        100,
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: "Cập nhật báo giá thành công", data: fakeQuotation });
    });
  });

  describe("getQuoteHistory", () => {
    it("UTCID05 - View Quotation History - should return 200 with history list", async () => {
      const fakeHistory = [{ id: 11, total_amount: 250000, status: "PENDING" }];
      quoteManagementService.getQuoteHistory.mockResolvedValue(fakeHistory);
      const req = {};
      const res = createMockResponse();

      await controller.getQuoteHistory(req, res);

      expect(quoteManagementService.getQuoteHistory).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeHistory });
    });

    it("UTCID06 - View Quotation History - should return 500 when service throws", async () => {
      const error = new Error("Quotation history failed");
      error.status = 500;
      quoteManagementService.getQuoteHistory.mockRejectedValue(error);
      const req = {};
      const res = createMockResponse();

      await controller.getQuoteHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Quotation history failed" });
    });
  });

  describe("createIssuesReport", () => {
    it("UTCID09 - Create Issue Report - should return 400 when validation fails", async () => {
      const req = { body: { task_id: 1, note: "Ghi lỗi", issues: [] } };
      const res = createMockResponse();

      issueReportValidationMocks.createIssueReportSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Phải có ít nhất một lỗi" }] },
      });

      await controller.createIssuesReport(req, res);

      expect(issueReportValidationMocks.createIssueReportSchema.safeParse).toHaveBeenCalledWith({
        task_id: 1,
        issues: [],
        note: "Ghi lỗi",
      });
      expect(quoteManagementService.createIssueReports).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Phải có ít nhất một lỗi" });
    });

    it("UTCID10 - Create Issue Report - should return 201 when issue report is created", async () => {
      const req = {
        body: {
          task_id: 7,
          note: "Lỗi cần sửa",
          issues: [{ component_id: 12, description: "Ống nước rò rỉ" }],
        },
      };
      const res = createMockResponse();
      const fakeResult = [{ id: 1, component_id: 12, error_description: "Ống nước rò rỉ" }];

      issueReportValidationMocks.createIssueReportSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          task_id: 7,
          note: "Lỗi cần sửa",
          issues: [{ component_id: 12, description: "Ống nước rò rỉ" }],
        },
      });
      quoteManagementService.createIssueReports.mockResolvedValue(fakeResult);

      await controller.createIssuesReport(req, res);

      expect(quoteManagementService.createIssueReports).toHaveBeenCalledWith(
        7,
        [{ component_id: 12, description: "Ống nước rò rỉ" }],
        "Lỗi cần sửa",
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Ghi nhận lỗi thành công",
        data: fakeResult,
      });
    });
  });

  describe("getIssueReports", () => {
    it("UTCID11 - View Issue Reports - should return 200 with report list", async () => {
      const fakeReports = [{ id: 21, note: "Lỗi ống", error_description: "Ống nước rò rỉ" }];
      quoteManagementService.getIssuesReports.mockResolvedValue(fakeReports);
      const req = {};
      const res = createMockResponse();

      await controller.getIssueReports(req, res);

      expect(quoteManagementService.getIssuesReports).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeReports });
    });

    it("UTCID12 - View Issue Reports - should return 500 when service throws", async () => {
      const error = new Error("Issue report fetch failed");
      error.status = 500;
      quoteManagementService.getIssuesReports.mockRejectedValue(error);
      const req = {};
      const res = createMockResponse();

      await controller.getIssueReports(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Issue report fetch failed" });
    });
  });

  describe("getQuotationById", () => {
    it("UTCID07 - View Quotation Detail - should return 200 with quotation detail", async () => {
      const fakeQuotation = { id: 10, total_amount: 250000, status: "PENDING" };
      quoteManagementService.getQuotationById.mockResolvedValue(fakeQuotation);
      const req = { params: { id: "10" } };
      const res = createMockResponse();

      await controller.getQuotationById(req, res);

      expect(quoteManagementService.getQuotationById).toHaveBeenCalledWith("10");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeQuotation });
    });

    it("UTCID08 - View Quotation Detail - should return 500 when service throws", async () => {
      const error = new Error("Quotation fetch failed");
      error.status = 500;
      quoteManagementService.getQuotationById.mockRejectedValue(error);
      const req = { params: { id: "10" } };
      const res = createMockResponse();

      await controller.getQuotationById(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Quotation fetch failed" });
    });
  });
});