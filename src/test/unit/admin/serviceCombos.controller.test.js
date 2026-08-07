const mockListServiceCombos = jest.fn();
const mockCreateServiceCombo = jest.fn();
const mockUpdateServiceCombo = jest.fn();

jest.mock("../../../service/admin/serviceCombos.service", () => ({
  listServiceCombos: mockListServiceCombos,
  createServiceCombo: mockCreateServiceCombo,
  updateServiceCombo: mockUpdateServiceCombo,
}));

const mockCreateServiceComboSchema = { safeParse: jest.fn() };
const mockUpdateServiceComboSchema = { safeParse: jest.fn() };
const mockViewServiceComboSchema = { safeParse: jest.fn().mockReturnValue({ success: true, data: {} }) };

jest.mock("../../../validation/admin/serviceCombos.validation", () => ({
  createServiceComboSchema: mockCreateServiceComboSchema,
  updateServiceComboSchema: mockUpdateServiceComboSchema,
  viewServiceComboSchema: mockViewServiceComboSchema,
}));

const controller = require("../../../controller/admin/serviceCombos.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("ServiceCombos Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getServiceCombos", () => {
    it("should return list of service combos on success", async () => {
      const fakeData = [
        {
          id: 1,
          combo_name: "Combo A",
          description: "Description A",
          is_active: true,
        },
        {
          id: 2,
          combo_name: "Combo B",
          description: "Description B",
          is_active: true,
        },
      ];
      mockListServiceCombos.mockResolvedValue(fakeData);

      const req = { query: {} };
      const res = createMockResponse();

      await controller.getServiceCombos(req, res);

      expect(mockListServiceCombos).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });

    it("should handle service errors", async () => {
      const error = new Error("Database error");
      error.status = 500;
      mockListServiceCombos.mockRejectedValue(error);

      const req = { query: {} };
      const res = createMockResponse();

      await controller.getServiceCombos(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Database error" });
    });

    it("should forward query params (q, is_active) to service", async () => {
      const fakeData = [{ id: 1, combo_name: "Combo X" }];
      mockListServiceCombos.mockResolvedValue(fakeData);

      const req = { query: { q: "search-term", is_active: "true" } };
      const res = createMockResponse();

      await controller.getServiceCombos(req, res);

      expect(mockListServiceCombos).toHaveBeenCalledWith({
        q: undefined,
        is_active: undefined,
        page: undefined,
        limit: undefined,
        all: undefined,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });
  });

  describe("createServiceCombo", () => {
    it("should return 400 when combo_name is missing", async () => {
      const req = {
        body: {
          description: "Desc",
          serviceCatalogIds: [1, 2],
          is_active: true,
        },
      };
      const res = createMockResponse();

      mockCreateServiceComboSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Tên combo là bắt buộc" }] },
      });

      await controller.createServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Tên combo là bắt buộc" });
      expect(mockCreateServiceCombo).not.toHaveBeenCalled();
    });

    it("should return 400 when combo_name length < 2", async () => {
      const req = {
        body: {
          combo_name: "A",
          description: "Desc",
          serviceCatalogIds: [1, 2],
        },
      };
      const res = createMockResponse();

      mockCreateServiceComboSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Tên combo phải có ít nhất 2 ký tự" }] },
      });

      await controller.createServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Tên combo phải có ít nhất 2 ký tự" });
    });

    it("should return 400 when serviceCatalogIds is not array", async () => {
      const req = {
        body: {
          combo_name: "Combo A",
          description: "Desc",
          serviceCatalogIds: "not-array",
        },
      };
      const res = createMockResponse();

      mockCreateServiceComboSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Danh sách dịch vụ không hợp lệ" }] },
      });

      await controller.createServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Danh sách dịch vụ không hợp lệ" });
    });

    it("should return 400 when serviceCatalogIds has less than 2 items", async () => {
      const req = {
        body: {
          combo_name: "Combo A",
          description: "Desc",
          serviceCatalogIds: [1],
        },
      };
      const res = createMockResponse();

      mockCreateServiceComboSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Phải chọn ít nhất 2 dịch vụ" }] },
      });

      await controller.createServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Phải chọn ít nhất 2 dịch vụ" });
    });

    it("should successfully create service combo", async () => {
      const req = {
        body: {
          combo_name: "Premium Combo",
          description: "Premium service combo",
          serviceCatalogIds: [1, 2, 3],
          is_active: true,
        },
      };
      const res = createMockResponse();
      const createdCombo = {
        id: 5,
        combo_name: "Premium Combo",
        description: "Premium service combo",
        is_active: true,
      };

      mockCreateServiceComboSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          combo_name: "Premium Combo",
          description: "Premium service combo",
          serviceCatalogIds: [1, 2, 3],
          is_active: true,
        },
      });
      mockCreateServiceCombo.mockResolvedValue(createdCombo);

      await controller.createServiceCombo(req, res);

      expect(mockCreateServiceCombo).toHaveBeenCalledWith(
        "Premium Combo",
        "Premium service combo",
        [1, 2, 3],
        true
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Tạo gói dịch vụ thành công",
        data: createdCombo,
      });
    });

    it("should handle service error when combo name already exists", async () => {
      const req = {
        body: {
          combo_name: "Existing Combo",
          description: "Desc",
          serviceCatalogIds: [1, 2],
        },
      };
      const res = createMockResponse();
      const error = new Error("Tên combo dịch vụ đã tồn tại");
      error.status = 400;

      mockCreateServiceComboSchema.safeParse.mockReturnValue({
        success: true,
        data: expect.any(Object),
      });
      mockCreateServiceCombo.mockRejectedValue(error);

      await controller.createServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Tên combo dịch vụ đã tồn tại" });
    });

    it("should handle service error when services are invalid", async () => {
      const req = {
        body: {
          combo_name: "New Combo",
          description: "Desc",
          serviceCatalogIds: [999, 1000],
        },
      };
      const res = createMockResponse();
      const error = new Error("Một hoặc nhiều dịch vụ được chọn không tồn tại hoặc không hoạt động");
      error.status = 400;

      mockCreateServiceComboSchema.safeParse.mockReturnValue({
        success: true,
        data: expect.any(Object),
      });
      mockCreateServiceCombo.mockRejectedValue(error);

      await controller.createServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Một hoặc nhiều dịch vụ được chọn không tồn tại hoặc không hoạt động",
      });
    });
  });

  describe("updateServiceCombo", () => {
    it("should return 400 when combo_name is missing", async () => {
      const req = {
        body: {
          description: "Updated desc",
          serviceCatalogIds: [1, 2],
          is_active: true,
        },
        params: { id: 5 },
      };
      const res = createMockResponse();

      mockUpdateServiceComboSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Tên combo là bắt buộc" }] },
      });

      await controller.updateServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Tên combo là bắt buộc" });
      expect(mockUpdateServiceCombo).not.toHaveBeenCalled();
    });

    it("should return 400 when combo_name is too short", async () => {
      const req = {
        body: {
          combo_name: "X",
          serviceCatalogIds: [1],
          is_active: true,
        },
        params: { id: 5 },
      };
      const res = createMockResponse();

      mockUpdateServiceComboSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Tên combo phải có ít nhất 2 ký tự" }] },
      });

      await controller.updateServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Tên combo phải có ít nhất 2 ký tự" });
    });

    it("should return 400 when serviceCatalogIds has less than 1 item", async () => {
      const req = {
        body: {
          combo_name: "Updated Combo",
          serviceCatalogIds: [],
          is_active: true,
        },
        params: { id: 5 },
      };
      const res = createMockResponse();

      mockUpdateServiceComboSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Phải chọn ít nhất 1 dịch vụ" }] },
      });

      await controller.updateServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Phải chọn ít nhất 1 dịch vụ" });
    });

    it("should return 400 when is_active is missing", async () => {
      const req = {
        body: {
          combo_name: "Updated Combo",
          serviceCatalogIds: [1, 2],
        },
        params: { id: 5 },
      };
      const res = createMockResponse();

      mockUpdateServiceComboSchema.safeParse.mockReturnValue({
        success: false,
        error: { issues: [{ message: "Trạng thái combo là bắt buộc" }] },
      });

      await controller.updateServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Trạng thái combo là bắt buộc" });
    });

    it("should successfully update service combo", async () => {
      const req = {
        body: {
          combo_name: "Updated Combo",
          description: "Updated description",
          serviceCatalogIds: [1, 2, 3],
          is_active: false,
        },
        params: { id: "5" },
      };
      const res = createMockResponse();
      const updatedCombo = {
        id: 5,
        combo_name: "Updated Combo",
        description: "Updated description",
        is_active: false,
      };

      mockUpdateServiceComboSchema.safeParse.mockReturnValue({
        success: true,
        data: {
          combo_name: "Updated Combo",
          description: "Updated description",
          serviceCatalogIds: [1, 2, 3],
          is_active: false,
        },
      });
      mockUpdateServiceCombo.mockResolvedValue(updatedCombo);

      await controller.updateServiceCombo(req, res);

      expect(mockUpdateServiceCombo).toHaveBeenCalledWith(
        "5",
        "Updated Combo",
        "Updated description",
        [1, 2, 3],
        false
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Cập nhật gói dịch vụ thành công",
        data: updatedCombo,
      });
    });

    it("should handle service error when combo not found", async () => {
      const req = {
        body: {
          combo_name: "Updated Combo",
          serviceCatalogIds: [1, 2],
          is_active: true,
        },
        params: { id: 999 },
      };
      const res = createMockResponse();
      const error = new Error("Service combo không tồn tại");
      error.status = 404;

      mockUpdateServiceComboSchema.safeParse.mockReturnValue({
        success: true,
        data: expect.any(Object),
      });
      mockUpdateServiceCombo.mockRejectedValue(error);

      await controller.updateServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Service combo không tồn tại" });
    });

    it("should handle service error when combo name already exists", async () => {
      const req = {
        body: {
          combo_name: "Existing Combo",
          serviceCatalogIds: [1, 2],
          is_active: true,
        },
        params: { id: 5 },
      };
      const res = createMockResponse();
      const error = new Error("Tên combo dịch vụ đã tồn tại");
      error.status = 400;

      mockUpdateServiceComboSchema.safeParse.mockReturnValue({
        success: true,
        data: expect.any(Object),
      });
      mockUpdateServiceCombo.mockRejectedValue(error);

      await controller.updateServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: "Tên combo dịch vụ đã tồn tại" });
    });

    it("should handle service error when services are invalid", async () => {
      const req = {
        body: {
          combo_name: "Updated Combo",
          serviceCatalogIds: [999],
          is_active: true,
        },
        params: { id: 5 },
      };
      const res = createMockResponse();
      const error = new Error("Một hoặc nhiều dịch vụ được chọn không tồn tại hoặc không hoạt động");
      error.status = 400;

      mockUpdateServiceComboSchema.safeParse.mockReturnValue({
        success: true,
        data: expect.any(Object),
      });
      mockUpdateServiceCombo.mockRejectedValue(error);

      await controller.updateServiceCombo(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: "Một hoặc nhiều dịch vụ được chọn không tồn tại hoặc không hoạt động",
      });
    });
  });
});
