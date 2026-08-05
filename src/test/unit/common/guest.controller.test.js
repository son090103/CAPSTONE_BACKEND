const guestService = require("../../../service/common/guest.service");

jest.mock("../../../service/common/guest.service", () => ({
  getServiceCategories: jest.fn(),
  getServiceCatalog: jest.fn(),
  searchServiceCatalog: jest.fn(),
  getServiceCatalogDetail: jest.fn(),
  getServiceCombos: jest.fn(),
  checkLicensePlate: jest.fn(),
}));

const controller = require("../../../controller/common/guest.controller");

const response = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
});

describe("Guest service-page controller", () => {
  beforeEach(() => jest.clearAllMocks());

  test("returns active service catalogs for legacy booking consumers", async () => {
    guestService.getServiceCatalog.mockResolvedValue([{ id: 1 }]);
    const req = { query: { lang: "en", category_id: "2" } };
    const res = response();

    await controller.getServiceCatalog(req, res);

    expect(guestService.getServiceCatalog).toHaveBeenCalledWith({
      lang: "en",
      categoryId: 2,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ id: 1 }] });
  });

  test("normalizes search filters and pagination", async () => {
    const data = {
      items: [{ id: 1 }],
      pagination: { page: 2, limit: 8, total: 9, totalPages: 2 },
    };
    guestService.searchServiceCatalog.mockResolvedValue(data);
    const req = {
      query: { q: "  bảo dưỡng  ", category_id: "3", page: "2", limit: "8" },
    };
    const res = response();

    await controller.searchServiceCatalog(req, res);

    expect(guestService.searchServiceCatalog).toHaveBeenCalledWith({
      lang: "vi",
      q: "bảo dưỡng",
      categoryId: 3,
      page: 2,
      limit: 8,
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Lấy danh sách dịch vụ thành công",
      data,
    });
  });

  test("rejects an invalid search limit", async () => {
    const req = { query: { limit: "101" } };
    const res = response();

    await controller.searchServiceCatalog(req, res);

    expect(guestService.searchServiceCatalog).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "limit phải nằm trong khoảng từ 1 đến 100",
    });
  });

  test("returns one service detail", async () => {
    guestService.getServiceCatalogDetail.mockResolvedValue({ id: 5 });
    const req = { params: { id: "5" }, query: {} };
    const res = response();

    await controller.getServiceCatalogDetail(req, res);

    expect(guestService.getServiceCatalogDetail).toHaveBeenCalledWith(5, "vi");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("forwards service not-found errors", async () => {
    const error = new Error("Dịch vụ không tồn tại hoặc đã ngừng cung cấp");
    error.status = 404;
    guestService.getServiceCatalogDetail.mockRejectedValue(error);
    const req = { params: { id: "5" }, query: {} };
    const res = response();

    await controller.getServiceCatalogDetail(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Dịch vụ không tồn tại hoặc đã ngừng cung cấp",
    });
  });
});
