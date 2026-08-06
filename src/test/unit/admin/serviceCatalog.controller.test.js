const mockGetServiceCatalog = jest.fn();

jest.mock("../../../service/admin/serviceCatalog.service", () => ({
  getServiceCatalog: mockGetServiceCatalog,
}));

const controller = require("../../../controller/admin/serviceCatalog.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("ServiceCatalog Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getServiceCatalog", () => {
    it("should forward q, category_id, is_active to service and return data", async () => {
      const fakeData = [{ id: 1, service_name: "Service A" }];
      mockGetServiceCatalog.mockResolvedValue(fakeData);

      const req = { query: { q: "bao dưỡng", category_id: "2", is_active: "true" } };
      const res = createMockResponse();

      await controller.getServiceCatalog(req, res);

      expect(mockGetServiceCatalog).toHaveBeenCalledWith({
        q: "bao dưỡng",
        category_id: undefined,
        is_active: undefined,
        page: undefined,
        limit: undefined,
        all: false,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });

    it("should handle service errors", async () => {
      const error = new Error("DB error");
      error.status = 500;
      mockGetServiceCatalog.mockRejectedValue(error);

      const req = { query: {} };
      const res = createMockResponse();

      await controller.getServiceCatalog(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "DB error" });
    });
  });
});
