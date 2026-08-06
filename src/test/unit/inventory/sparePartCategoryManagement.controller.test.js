const mockCreatePartCategory = jest.fn();
const mockGetPartCategory = jest.fn();
const mockUpdatePartCategory = jest.fn();

jest.mock("../../../service/inventory/sparePartCategoryManagement.service", () => ({
  createPartCategory: mockCreatePartCategory,
  getPartCategory: mockGetPartCategory,
  updatePartCategory: mockUpdatePartCategory,
}));

const controller = require("../../../controller/inventory/sparePartCategoryManagement.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("SparePartCategory Management Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createPartCategory", () => {
    it("should return 400 when validation fails", async () => {
      const req = { body: { category_name: "" } };
      const res = createMockResponse();

      await controller.createPartCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: expect.any(String),
      });
      expect(mockCreatePartCategory).not.toHaveBeenCalled();
    });

    it("should create part category successfully", async () => {
      const fakeData = { id: 1, category_name: "Lốp" };
      mockCreatePartCategory.mockResolvedValue(fakeData);
      const req = { body: { category_name: "Lốp", description: "Lốp xe", is_active: true } };
      const res = createMockResponse();

      await controller.createPartCategory(req, res);

      expect(mockCreatePartCategory).toHaveBeenCalledWith("Lốp", "Lốp xe", true);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Tạo danh mục thành công",
        data: fakeData,
      });
    });
  });

  describe("getPartCategory", () => {
    it("should return categories list", async () => {
      const fakeData = [{ id: 1, category_name: "Lốp" }];
      mockGetPartCategory.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getPartCategory(req, res);

      expect(mockGetPartCategory).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });
  });

  describe("updatePartCategory", () => {
    it("should return 400 when validation fails", async () => {
      const req = { params: { id: "1" }, body: { category_name: "" } };
      const res = createMockResponse();

      await controller.updatePartCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: expect.any(String),
      });
      expect(mockUpdatePartCategory).not.toHaveBeenCalled();
    });
  });
});
