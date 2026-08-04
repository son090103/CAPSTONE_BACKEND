const taskAssignmentService = require("../../../service/technician/taskAssignment.service");

jest.mock("../../../service/technician/taskAssignment.service", () => ({
  createIssueReports: jest.fn(),
  reportAdditionalIssue: jest.fn(),
  getIssuesReportHistory: jest.fn(),
  getAllDiagnostics: jest.fn(),
  searchDiagnostics: jest.fn(),
  filterDiagnostics: jest.fn(),
  getRepairHistory: jest.fn(),
  searchRepairHistory: jest.fn(),
  getAllInspectionHistory: jest.fn(),
  searchInspectionHistory: jest.fn(),
  aiSuggestCauses: jest.fn(),
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

describe("FE-17: Issue Reports Management Controller Tests (Technician Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. Create Issue Report
   * ========================================================================== */
  describe("Create Issue Report", () => {
    it("UTCID01 - Create Issue Report - should return 201 Created when valid inspection issue report is submitted", async () => {
      const mockResult = { id: 1, task_id: 10, note: "Phát hiện lọt khí cổ hút" };
      taskAssignmentService.createIssueReports.mockResolvedValue(mockResult);

      const req = {
        body: {
          task_id: 10,
          note: "Phát hiện lọt khí cổ hút",
          issues: [{ component_id: 1, description: "Cổ hút nứt" }],
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.createIssuesReport(req, res);

      expect(taskAssignmentService.createIssueReports).toHaveBeenCalledWith(
        10,
        [{ component_id: 1, description: "Cổ hút nứt" }],
        "Phát hiện lọt khí cổ hút",
        5
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Tạo báo cáo kiểm tra thành công",
        data: mockResult,
      });
    });

    it("UTCID02 - Create Issue Report - should return 201 Created when reporting additional repair issue", async () => {
      const mockResult = { id: 2, task_id: 12, note: "Phát sinh mòn má phanh phụ" };
      taskAssignmentService.reportAdditionalIssue.mockResolvedValue(mockResult);

      const req = {
        body: {
          task_id: 12,
          note: "Phát sinh mòn má phanh phụ",
          issues: [{ component_id: 2, description: "Má phanh mòn" }],
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.reportAdditionalIssue(req, res);

      expect(taskAssignmentService.reportAdditionalIssue).toHaveBeenCalledWith(
        12,
        [{ component_id: 2, description: "Má phanh mòn" }],
        "Phát sinh mòn má phanh phụ",
        5
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Ghi nhận lỗi phát sinh thành công",
        data: mockResult,
      });
    });

    it("UTCID03 - Create Issue Report - should return 400 Bad Request when validation fails for empty issues payload", async () => {
      const req = {
        body: {
          task_id: null,
          note: "",
          issues: [],
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.createIssuesReport(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(taskAssignmentService.createIssueReports).not.toHaveBeenCalled();
    });

    it("UTCID04 - Create Issue Report - should return 500 Internal Server Error when issue creation service fails", async () => {
      taskAssignmentService.createIssueReports.mockRejectedValue(new Error("Database write failure"));

      const req = {
        body: {
          task_id: 10,
          note: "Ghi chú kiểm tra",
          issues: [{ component_id: 1, description: "Lỗi" }],
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.createIssuesReport(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Database write failure",
      });
    });
  });

  /* ==========================================================================
   * 2. View & Search Issue Report History
   * ========================================================================== */
  describe("View & Search Issue Report History", () => {
    it("UTCID05 - View Issue Report History - should return 200 OK with history submitted by technician", async () => {
      const mockHistory = [
        { id: 1, task_id: 10, note: "Báo cáo kiểm tra bánh xe", createdAt: "2026-08-04T10:00:00.000Z" },
      ];
      taskAssignmentService.getIssuesReportHistory.mockResolvedValue(mockHistory);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 5 };

      await controller.getIssuesReportHistory(req, res);

      expect(taskAssignmentService.getIssuesReportHistory).toHaveBeenCalledWith(5);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockHistory });
    });

    it("UTCID06 - Search Issue Report History - should return 200 OK with matching inspection history by keyword", async () => {
      const mockInspection = [{ id: 10, note: "Kiểm tra động cơ nổ rung" }];
      taskAssignmentService.searchInspectionHistory.mockResolvedValue(mockInspection);

      const req = { query: { keyword: "động cơ" } };
      const res = createMockResponse();

      await controller.searchInspectionHistory(req, res);

      expect(taskAssignmentService.searchInspectionHistory).toHaveBeenCalledWith("động cơ");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockInspection });
    });

    it("UTCID07 - Search Issue Report History - should return 200 OK with matching repair history by keyword", async () => {
      const mockRepair = [{ id: 20, note: "Sửa chữa hệ thống phanh ABS" }];
      taskAssignmentService.searchRepairHistory.mockResolvedValue(mockRepair);

      const req = { query: { keyword: "phanh" } };
      const res = createMockResponse();

      await controller.searchRepairHistory(req, res);

      expect(taskAssignmentService.searchRepairHistory).toHaveBeenCalledWith("phanh");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockRepair });
    });

    it("UTCID08 - Search Issue Report History - should return 500 Internal Server Error when history search fails", async () => {
      taskAssignmentService.searchInspectionHistory.mockRejectedValue(new Error("Query timeout error"));

      const req = { query: { keyword: "test" } };
      const res = createMockResponse();

      await controller.searchInspectionHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Query timeout error" });
    });
  });

  /* ==========================================================================
   * 3. View & Search Diagnostic References
   * ========================================================================== */
  describe("View & Search Diagnostic References", () => {
    it("UTCID09 - View Diagnostic References - should return 200 OK with all diagnostic reference data", async () => {
      const mockDiagnostics = [
        { id: 1, symptom: "Khói đen cổ bô", cause: "Thừa nhiên liệu", solution: "Vệ sinh kim phun" },
      ];
      taskAssignmentService.getAllDiagnostics.mockResolvedValue(mockDiagnostics);

      const req = {};
      const res = createMockResponse();

      await controller.getAllDiagnostics(req, res);

      expect(taskAssignmentService.getAllDiagnostics).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockDiagnostics });
    });

    it("UTCID10 - View Diagnostic References - should return 200 OK with diagnostics filtered by make/model", async () => {
      const mockFiltered = [{ id: 2, symptom: "Lỗi hộp số CVT", modelId: 5 }];
      taskAssignmentService.filterDiagnostics.mockResolvedValue(mockFiltered);

      const req = { query: { makeId: "1", modelId: "5" } };
      const res = createMockResponse();

      await controller.filterDiagnostics(req, res);

      expect(taskAssignmentService.filterDiagnostics).toHaveBeenCalledWith({ makeId: 1, modelId: 5 });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockFiltered });
    });

    it("UTCID11 - Search Diagnostic References - should return 200 OK with matching diagnostic items", async () => {
      const mockSearchResult = [{ id: 3, symptom: "Tiếng kêu cạch cạch ở bánh trước" }];
      taskAssignmentService.searchDiagnostics.mockResolvedValue(mockSearchResult);

      const req = { query: { keyword: "bánh trước" } };
      const res = createMockResponse();

      await controller.searchDiagnostics(req, res);

      expect(taskAssignmentService.searchDiagnostics).toHaveBeenCalledWith("bánh trước");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockSearchResult });
    });

    it("UTCID12 - Search Diagnostic References - should return 500 Internal Server Error when diagnostic search crashes", async () => {
      taskAssignmentService.searchDiagnostics.mockRejectedValue(new Error("Diagnostic DB error"));

      const req = { query: { keyword: "error" } };
      const res = createMockResponse();

      await controller.searchDiagnostics(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Diagnostic DB error" });
    });
  });

  /* ==========================================================================
   * 4. AI Issue Search
   * ========================================================================== */
  describe("AI Issue Search", () => {
    it("UTCID13 - AI Issue Search - should return 200 OK with AI suggested causes for car symptoms", async () => {
      const mockAiCauses = {
        possibleCauses: ["Bugi bị bẩn", "Lọc gió nghẹt", "Cảm biến MAP lỗi"],
        recommendation: "Kiểm tra bugi và cảm biến áp suất cổ hút",
      };
      taskAssignmentService.aiSuggestCauses.mockResolvedValue(mockAiCauses);

      const req = { body: { symptom: "Xe bị giật khi tăng tốc", modelName: "Toyota Vios" } };
      const res = createMockResponse();

      await controller.aiSuggestCauses(req, res);

      expect(taskAssignmentService.aiSuggestCauses).toHaveBeenCalledWith("Xe bị giật khi tăng tốc", "Toyota Vios");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockAiCauses });
    });

    it("UTCID14 - AI Issue Search - should return 500 Internal Server Error when AI service call fails", async () => {
      taskAssignmentService.aiSuggestCauses.mockRejectedValue(new Error("AI LLM API Timeout"));

      const req = { body: { symptom: "Rung lốc máy", modelName: "Camry" } };
      const res = createMockResponse();

      await controller.aiSuggestCauses(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "AI LLM API Timeout" });
    });
  });
});
