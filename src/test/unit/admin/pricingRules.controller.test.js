const mockCreatePricingRule = jest.fn();
const mockGetAllPricingRules = jest.fn();
const mockGetPricingRuleById = jest.fn();
const mockUpdatePricingRule = jest.fn();
const mockDeletePricingRule = jest.fn();

jest.mock("../../../service/admin/pricingRules.service", () => ({
  createPricingRule: mockCreatePricingRule,
  getAllPricingRules: mockGetAllPricingRules,
  getPricingRuleById: mockGetPricingRuleById,
  updatePricingRule: mockUpdatePricingRule,
  deletePricingRule: mockDeletePricingRule,
}));

const controller = require("../../../controller/admin/pricingRules.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("PricingRules Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createPricingRules", () => {
    it("should return 400 when validation fails", async () => {
      const req = { body: { service_type: "" } };
      const res = createMockResponse();

      await controller.createPricingRules(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: expect.any(Array),
      });
      expect(mockCreatePricingRule).not.toHaveBeenCalled();
    });

    it("should create pricing rule successfully", async () => {
      const fakeData = { id: 1, category: "REPAIR" };
      mockCreatePricingRule.mockResolvedValue(fakeData);
      const req = {
        body: {
          category: "REPAIR",
          markup_rate: 10,
          discount_rate: 0,
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          is_active: true,
        },
      };
      const res = createMockResponse();

      await controller.createPricingRules(req, res);

      expect(mockCreatePricingRule).toHaveBeenCalledWith(expect.objectContaining({
        category: "REPAIR",
        markup_rate: 10,
        discount_rate: 0,
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Pricing rule created successfully",
        data: fakeData,
      });
    });
  });

  describe("getAllPricingRules", () => {
    it("should return list pricing rules", async () => {
      const fakeData = [{ id: 1 }];
      mockGetAllPricingRules.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getAllPricingRules(req, res);

      expect(mockGetAllPricingRules).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy danh sách quy tắc giá thành công",
        data: fakeData,
      });
    });
  });

  describe("getPricingRuleById", () => {
    it("should return 404 when rule is not found", async () => {
      mockGetPricingRuleById.mockResolvedValue(null);
      const req = { params: { id: "999" } };
      const res = createMockResponse();

      await controller.getPricingRuleById(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Không tìm thấy quy tắc giá",
      });
    });
  });

  describe("updatePricingRule", () => {
    it("should return 400 when validation fails", async () => {
      const req = { params: { id: "1" }, body: { markup_rate: "bad" } };
      const res = createMockResponse();

      await controller.updatePricingRule(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: expect.any(Array),
      });
      expect(mockUpdatePricingRule).not.toHaveBeenCalled();
    });

    it("should update pricing rule on success", async () => {
      const fakeData = { id: 1, category: "REPAIR" };
      mockUpdatePricingRule.mockResolvedValue(fakeData);
      const req = {
        params: { id: "1" },
        body: {
          category: "REPAIR",
          markup_rate: 15,
          discount_rate: 5,
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          is_active: true,
        },
      };
      const res = createMockResponse();

      await controller.updatePricingRule(req, res);

      expect(mockUpdatePricingRule).toHaveBeenCalledWith("1", expect.objectContaining({
        category: "REPAIR",
        markup_rate: 15,
        discount_rate: 5,
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Cập nhật quy tắc giá thành công",
        data: fakeData,
      });
    });
  });

  describe("deletePricingRule", () => {
    it("should return 404 when rule not found", async () => {
      mockDeletePricingRule.mockResolvedValue(null);
      const req = { params: { id: "999" } };
      const res = createMockResponse();

      await controller.deletePricingRule(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Không tìm thấy quy tắc giá hoặc đã bị xóa",
      });
    });
  });
});
