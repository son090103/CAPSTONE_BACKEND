const mockImportSparePart = jest.fn();
const mockViewImportHistory = jest.fn();
const mockGetExportRequests = jest.fn();
const mockApproveExportRequest = jest.fn();
const mockRejectExportRequest = jest.fn();
const mockGetExportReceiptDetail = jest.fn();
const mockViewImportDetail = jest.fn();
const mockViewExportHistory = jest.fn();
const mockViewExportDetail = jest.fn();
const mockGetWaitingStockItems = jest.fn();
const mockGetRestockSuggestions = jest.fn();

jest.mock("../../../service/inventory/importAndExportManagement.service", () => ({
  importSparePart: mockImportSparePart,
  viewImportHistory: mockViewImportHistory,
  getExportRequests: mockGetExportRequests,
  approveExportRequest: mockApproveExportRequest,
  rejectExportRequest: mockRejectExportRequest,
  getExportReceiptDetail: mockGetExportReceiptDetail,
  viewImportDetail: mockViewImportDetail,
  viewExportHistory: mockViewExportHistory,
  viewExportDetail: mockViewExportDetail,
  getWaitingStockItems: mockGetWaitingStockItems,
  getRestockSuggestions: mockGetRestockSuggestions,
}));

jest.mock("jsonwebtoken");
jest.mock("../../../../models", () => ({
  User: { findOne: jest.fn() },
  Role: {},
}));

const jwt = require("jsonwebtoken");
const { authenticate, authorizeRoles } = require("../../../middleware/auth.middleware");
const controller = require("../../../controller/inventory/importAndExportManagement.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = { user: { id: 1 } };
  return res;
};

describe("ImportAndExportManagement Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    console.log.mockRestore();
  });

  // ==================== Authorization ====================
  describe("Authorization", () => {
    let req, res, next;

    beforeEach(() => {
      req = { headers: {} };
      res = createMockResponse();
      next = jest.fn();
    });

    it("should return 401 when no token provided", async () => {
      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Unauthorized - No token provided",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("should return 403 when token is invalid", async () => {
      jest.spyOn(console, "error").mockImplementation(() => {});
      req.headers.authorization = "Bearer invalid-token";
      const error = new Error("invalid signature");
      error.name = "JsonWebTokenError";
      jwt.verify.mockImplementation(() => { throw error; });

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Invalid token",
      });
      expect(next).not.toHaveBeenCalled();
      console.error.mockRestore();
    });

    it("should return 403 when user role is not ADMIN", () => {
      res.locals.user = { role: { roleCode: "CUSTOMER" } };
      const middleware = authorizeRoles("INVENTORY");

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Forbidden - You do not have permission",
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  // ==================== importSparePart ====================
  describe("importSparePart", () => {
    it("should return 400 when supplier_id is missing", async () => {
      const req = {
        body: {
          items: [{ quantity: 10, unit_price: 50000, part_id: 1 }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockImportSparePart).not.toHaveBeenCalled();
    });

    it("should return 400 when items is empty", async () => {
      const req = {
        body: {
          supplier_id: 1,
          items: [],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Phiếu phải có ít nhất một mặt hàng",
      });
      expect(mockImportSparePart).not.toHaveBeenCalled();
    });

    it("should return 400 when item quantity is missing", async () => {
      const req = {
        body: {
          supplier_id: 1,
          items: [{ unit_price: 50000, part_id: 1 }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockImportSparePart).not.toHaveBeenCalled();
    });

    it("should return 400 when item quantity is not a number", async () => {
      const req = {
        body: {
          supplier_id: 1,
          items: [{ quantity: "abc", unit_price: 50000, part_id: 1 }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockImportSparePart).not.toHaveBeenCalled();
    });

    it("should return 400 when item quantity is less than 1", async () => {
      const req = {
        body: {
          supplier_id: 1,
          items: [{ quantity: 0, unit_price: 50000, part_id: 1 }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Số lượng phải lớn hơn 0",
      });
      expect(mockImportSparePart).not.toHaveBeenCalled();
    });

    it("should return 400 when unit_price is negative", async () => {
      const req = {
        body: {
          supplier_id: 1,
          items: [{ quantity: 10, unit_price: -100, part_id: 1 }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Giá nhập không được âm",
      });
      expect(mockImportSparePart).not.toHaveBeenCalled();
    });

    it("should return 400 when creating new part without name", async () => {
      const req = {
        body: {
          supplier_id: 1,
          items: [{ quantity: 10, unit_price: 50000, category_id: 1 }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Tên phụ tùng là bắt buộc khi tạo mới",
      });
      expect(mockImportSparePart).not.toHaveBeenCalled();
    });

    it("should return 400 when creating new part without category_id", async () => {
      const req = {
        body: {
          supplier_id: 1,
          items: [{ quantity: 10, unit_price: 50000, name: "Lốp xe" }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockImportSparePart).not.toHaveBeenCalled();
    });

    it("should return 201 when import with existing part_id", async () => {
      const fakeResult = { id: 1 };
      mockImportSparePart.mockResolvedValue(fakeResult);
      const req = {
        body: {
          supplier_id: 1,
          items: [{ quantity: 10, unit_price: 50000, part_id: 1 }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(mockImportSparePart).toHaveBeenCalledWith(
        1, 1, [{ quantity: 10, unit_price: 50000, part_id: 1 }]
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Tạo phiếu nhập kho thành công",
        data: fakeResult,
      });
    });

    it("should return 201 when import with new part", async () => {
      const fakeResult = { id: 2 };
      mockImportSparePart.mockResolvedValue(fakeResult);
      const req = {
        body: {
          supplier_id: 1,
          items: [{
            quantity: 5,
            unit_price: 100000,
            name: "Lốp Michelin",
            brand: "Michelin",
            category_id: 1,
          }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(mockImportSparePart).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it("should return error when service throws", async () => {
      const error = new Error("Nhà cung cấp không tồn tại");
      error.status = 404;
      mockImportSparePart.mockRejectedValue(error);
      const req = {
        body: {
          supplier_id: 999,
          items: [{ quantity: 10, unit_price: 50000, part_id: 1 }],
        },
      };
      const res = createMockResponse();

      await controller.importSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        message: "Nhà cung cấp không tồn tại",
        part: undefined,
      });
    });
  });

  // ==================== viewImportHistory ====================
  describe("viewImportHistory", () => {
    it("should return 200 and import history", async () => {
      const fakeData = [{ id: 1, supplier_id: 1 }];
      mockViewImportHistory.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.viewImportHistory(req, res);

      expect(mockViewImportHistory).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });

    it("should return error when service throws", async () => {
      const error = new Error("DB error");
      error.status = 500;
      mockViewImportHistory.mockRejectedValue(error);
      const req = {};
      const res = createMockResponse();

      await controller.viewImportHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "DB error" });
    });
  });

  // ==================== getExportRequests ====================
  describe("getExportRequests", () => {
    it("should return 200 and export requests", async () => {
      const fakeData = [{ id: 1, status: "pending" }];
      mockGetExportRequests.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getExportRequests(req, res);

      expect(mockGetExportRequests).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });

    it("should return error when service throws", async () => {
      const error = new Error("DB error");
      error.status = 500;
      mockGetExportRequests.mockRejectedValue(error);
      const req = {};
      const res = createMockResponse();

      await controller.getExportRequests(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "DB error" });
    });
  });

  // ==================== approveExportRequest ====================
  describe("approveExportRequest", () => {
    it("should return 400 when detailIds is missing", async () => {
      const req = { body: {} };
      const res = createMockResponse();

      await controller.approveExportRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockApproveExportRequest).not.toHaveBeenCalled();
    });

    it("should return 200 when export request approved successfully", async () => {
      const fakeResult = { id: 1, status: "approved" };
      mockApproveExportRequest.mockResolvedValue(fakeResult);
      const req = { body: { detailIds: [1, 2] } };
      const res = createMockResponse();

      await controller.approveExportRequest(req, res);

      expect(mockApproveExportRequest).toHaveBeenCalledWith([1, 2], 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Xuất kho thành công",
        data: fakeResult,
      });
    });
  });

  // ==================== rejectExportRequest ====================
  describe("rejectExportRequest", () => {
    it("should return 400 when detailIds is missing", async () => {
      const req = { body: {} };
      const res = createMockResponse();

      await controller.rejectExportRequest(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockRejectExportRequest).not.toHaveBeenCalled();
    });

    it("should return 200 when reject export request succeeds", async () => {
      const fakeResult = { id: 1, status: "rejected" };
      mockRejectExportRequest.mockResolvedValue(fakeResult);
      const req = { body: { detailIds: [1], reason: "Không đủ hàng" } };
      const res = createMockResponse();

      await controller.rejectExportRequest(req, res);

      expect(mockRejectExportRequest).toHaveBeenCalledWith([1], "Không đủ hàng");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Đã từ chối yêu cầu xuất kho",
        data: fakeResult,
      });
    });
  });

  // ==================== getExportReceiptDetail ====================
  describe("getExportReceiptDetail", () => {
    it("should return 200 and export receipt detail", async () => {
      const fakeData = { id: 1, receiptCode: "RC-001" };
      mockGetExportReceiptDetail.mockResolvedValue(fakeData);
      const req = { params: { receiptCode: "RC-001" } };
      const res = createMockResponse();

      await controller.getExportReceiptDetail(req, res);

      expect(mockGetExportReceiptDetail).toHaveBeenCalledWith("RC-001");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: fakeData });
    });
  });

  // ==================== viewImportDetail ====================
  describe("viewImportDetail", () => {
    it("should return 200 and import detail", async () => {
      const fakeData = { id: 1, receiptCode: "RC-001" };
      mockViewImportDetail.mockResolvedValue(fakeData);
      const req = { params: { receiptCode: "RC-001" } };
      const res = createMockResponse();

      await controller.viewImportDetail(req, res);

      expect(mockViewImportDetail).toHaveBeenCalledWith("RC-001");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });
  });

  // ==================== viewExportDetail ====================
  describe("viewExportDetail", () => {
    it("should return 200 and export detail", async () => {
      const fakeData = { id: 1, receiptCode: "RC-001" };
      mockViewExportDetail.mockResolvedValue(fakeData);
      const req = { params: { receiptCode: "RC-001" } };
      const res = createMockResponse();

      await controller.viewExportDetail(req, res);

      expect(mockViewExportDetail).toHaveBeenCalledWith("RC-001");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });
  });

  // ==================== getWaitingStockItems ====================
  describe("getWaitingStockItems", () => {
    it("should return 200 and waiting stock items", async () => {
      const fakeData = [{ id: 1, part_id: 1, quantity: 3 }];
      mockGetWaitingStockItems.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getWaitingStockItems(req, res);

      expect(mockGetWaitingStockItems).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });
  });

  // ==================== getRestockSuggestions ====================
  describe("getRestockSuggestions", () => {
    it("should return 200 and restock suggestions", async () => {
      const fakeSuggestions = [{ spare_part_id: 1, recommended_quantity: 10 }];
      mockGetRestockSuggestions.mockResolvedValue(fakeSuggestions);
      const req = {};
      const res = createMockResponse();

      await controller.getRestockSuggestions(req, res);

      expect(mockGetRestockSuggestions).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeSuggestions });
    });

    it("should return error when service throws", async () => {
      const error = new Error("Restock recommendation failure");
      error.status = 500;
      mockGetRestockSuggestions.mockRejectedValue(error);
      const req = {};
      const res = createMockResponse();

      await controller.getRestockSuggestions(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Restock recommendation failure" });
    });
  });

  // ==================== viewExportHistory ====================
  describe("viewExportHistory", () => {
    it("should return 200 and export history", async () => {
      const fakeData = [{ id: 1, quotation_id: 1 }];
      mockViewExportHistory.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.viewExportHistory(req, res);

      expect(mockViewExportHistory).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });

    it("should return error when service throws", async () => {
      const error = new Error("DB error");
      error.status = 500;
      mockViewExportHistory.mockRejectedValue(error);
      const req = {};
      const res = createMockResponse();

      await controller.viewExportHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "DB error" });
    });
  });
});
