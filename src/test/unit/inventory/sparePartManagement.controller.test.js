const mockGetSpareParts = jest.fn();
const mockUpdateSparePart = jest.fn();

jest.mock("../../../service/inventory/sparePartManagement.service", () => ({
  getSpareParts: mockGetSpareParts,
  updateSparePart: mockUpdateSparePart,
}));

const controller = require("../../../controller/inventory/sparePartManagement.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("SparePart Management Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSpareParts", () => {
    it("should retrieve spare parts with default pagination", async () => {
      mockGetSpareParts.mockResolvedValue({
        data: [{ id: 1, name: "Bánh xe" }],
        pagination: { page: 1, limit: 9 },
      });
      const req = { query: {} };
      const res = createMockResponse();

      await controller.getSpareParts(req, res);

      expect(mockGetSpareParts).toHaveBeenCalledWith({
        search: undefined,
        brand: undefined,
        category_id: undefined,
        minPrice: undefined,
        maxPrice: undefined,
        page: 1,
        limit: 9,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Spare parts retrieved successfully",
        data: [{ id: 1, name: "Bánh xe" }],
        pagination: { page: 1, limit: 9 },
      });
    });

    it("should return 500 on service failure", async () => {
      mockGetSpareParts.mockRejectedValue(new Error("Failed to retrieve spare parts"));
      const req = { query: {} };
      const res = createMockResponse();

      await controller.getSpareParts(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Failed to retrieve spare parts",
      });
    });
  });

  describe("updateSparePart", () => {
    it("should return 400 when validation fails", async () => {
      const req = {
        params: { id: "1" },
        body: { name: "", brand: "", retail_price: "bad" },
      };
      const res = createMockResponse();

      await controller.updateSparePart(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: expect.any(String),
      });
      expect(mockUpdateSparePart).not.toHaveBeenCalled();
    });

    it("should update spare part successfully", async () => {
      const fakeData = { id: 1, name: "Bánh xe" };
      mockUpdateSparePart.mockResolvedValue(fakeData);
      const req = {
        params: { id: "1" },
        body: {
          name: "Bánh xe",
          brand: "Michelin",
          retail_price: 120000,
          warranty_period_months: 12,
          warranty_km_limit: 20000,
        },
      };
      const res = createMockResponse();

      await controller.updateSparePart(req, res);

      expect(mockUpdateSparePart).toHaveBeenCalledWith(
        "1",
        "Bánh xe",
        "Michelin",
        120000,
        12,
        20000,
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        message: "Cập nhật phụ tùng thành công",
        data: fakeData,
      });
    });
  });
});
