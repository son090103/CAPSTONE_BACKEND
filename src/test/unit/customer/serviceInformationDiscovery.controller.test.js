const guestService = require("../../../service/common/guest.service");
const configService = require("../../../service/common/garage_configurations.service");

jest.mock("../../../service/common/guest.service", () => ({
  getServiceCategories: jest.fn(),
  getServiceCatalog: jest.fn(),
  searchServiceCatalog: jest.fn(),
  getServiceCatalogDetail: jest.fn(),
  getServiceCombos: jest.fn(),
}));

jest.mock("../../../service/common/garage_configurations.service", () => ({
  getConfigurations: jest.fn(),
  getAvailability: jest.fn(),
  getConfigurationByKey: jest.fn(),
}));

const guestController = require("../../../controller/common/guest.controller");
const configController = require("../../../controller/common/garageConfigurations.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-03: Service Information & Discovery Controller Tests (Customer Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. View Garage Information
   * ========================================================================== */
  describe("View Garage Information", () => {
    it("UTCID01 - View Garage Information - should return 200 OK with garage configurations list", async () => {
      const mockConfigData = [
        { key: "operating_hours", value: "08:00 - 18:00" },
        { key: "garage_address", value: "123 Main Street" },
      ];
      configService.getConfigurations.mockResolvedValue(mockConfigData);

      const req = {};
      const res = createMockResponse();

      await configController.getConfigurations(req, res);

      expect(configService.getConfigurations).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy danh sách cấu hình thành công",
        data: mockConfigData,
      });
    });

    it("UTCID02 - View Garage Information - should return 200 OK for garage availability schedule", async () => {
      const mockAvailability = {
        date: "2026-08-05",
        shifts: [{ shift_id: 1, available_slots: 5 }],
      };
      configService.getAvailability.mockResolvedValue(mockAvailability);

      const req = { query: { date: "2026-08-05" } };
      const res = createMockResponse();

      await configController.getAvailability(req, res);

      expect(configService.getAvailability).toHaveBeenCalledWith("2026-08-05");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy thông tin ca làm việc và sức chứa thành công",
        data: mockAvailability,
      });
    });

    it("UTCID03 - View Garage Information - should return 500 Internal Server Error on database failure", async () => {
      configService.getConfigurations.mockRejectedValue(new Error("Database connection lost"));

      const req = {};
      const res = createMockResponse();

      await configController.getConfigurations(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Database connection lost",
      });
    });
  });

  /* ==========================================================================
   * 2. View Service List
   * ========================================================================== */
  describe("View Service List", () => {
    it("UTCID04 - View Service List - should return 200 OK with full active service catalog", async () => {
      const mockServices = [
        { id: 1, service_name: "Oil Change", labor_price: 150000 },
        { id: 2, service_name: "Brake Inspection", labor_price: 200000 },
      ];
      guestService.getServiceCatalog.mockResolvedValue(mockServices);

      const req = { query: { lang: "en", category_id: "1" } };
      const res = createMockResponse();

      await guestController.getServiceCatalog(req, res);

      expect(guestService.getServiceCatalog).toHaveBeenCalledWith({
        lang: "en",
        categoryId: 1,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockServices,
      });
    });

    it("UTCID05 - View Service List - should return 200 OK with service categories", async () => {
      const mockCategories = [
        { id: 1, category_name: "Maintenance" },
        { id: 2, category_name: "Repair" },
      ];
      guestService.getServiceCategories.mockResolvedValue(mockCategories);

      const req = { query: { lang: "vi" } };
      const res = createMockResponse();

      await guestController.getServiceCategories(req, res);

      expect(guestService.getServiceCategories).toHaveBeenCalledWith("vi");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockCategories,
      });
    });
  });

  /* ==========================================================================
   * 3. Search Service
   * ========================================================================== */
  describe("Search Service", () => {
    it("UTCID06 - Search Service - should return 200 OK with filtered and paginated service list", async () => {
      const mockSearchResult = {
        items: [{ id: 1, service_name: "Engine Maintenance" }],
        pagination: { page: 1, limit: 8, total: 1, totalPages: 1 },
      };
      guestService.searchServiceCatalog.mockResolvedValue(mockSearchResult);

      const req = {
        query: { q: "Engine", category_id: "1", page: "1", limit: "8", lang: "en" },
      };
      const res = createMockResponse();

      await guestController.searchServiceCatalog(req, res);

      expect(guestService.searchServiceCatalog).toHaveBeenCalledWith({
        lang: "en",
        q: "Engine",
        categoryId: 1,
        page: 1,
        limit: 8,
      });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy danh sách dịch vụ thành công",
        data: mockSearchResult,
      });
    });

    it("UTCID07 - Search Service - should return 400 Bad Request when limit parameter exceeds maximum 100", async () => {
      const req = { query: { limit: "150" } };
      const res = createMockResponse();

      await guestController.searchServiceCatalog(req, res);

      expect(guestService.searchServiceCatalog).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "limit phải nằm trong khoảng từ 1 đến 100",
      });
    });

    it("UTCID08 - Search Service - should return 400 Bad Request when page parameter is invalid non-numeric", async () => {
      const req = { query: { page: "abc" } };
      const res = createMockResponse();

      await guestController.searchServiceCatalog(req, res);

      expect(guestService.searchServiceCatalog).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "page phải là số nguyên dương",
      });
    });
  });

  /* ==========================================================================
   * 4. View Service Details
   * ========================================================================== */
  describe("View Service Details", () => {
    it("UTCID09 - View Service Details - should return 200 OK with detail data for valid service ID", async () => {
      const mockServiceDetail = {
        id: 5,
        service_name: "Full Synthetic Oil Change",
        description: "Includes oil filter replacement",
        estimated_duration: 30,
        labor_price: 250000,
      };
      guestService.getServiceCatalogDetail.mockResolvedValue(mockServiceDetail);

      const req = { params: { id: "5" }, query: { lang: "en" } };
      const res = createMockResponse();

      await guestController.getServiceCatalogDetail(req, res);

      expect(guestService.getServiceCatalogDetail).toHaveBeenCalledWith(5, "en");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy chi tiết dịch vụ thành công",
        data: mockServiceDetail,
      });
    });

    it("UTCID10 - View Service Details - should return 404 Not Found when service ID does not exist", async () => {
      const error = new Error("Dịch vụ không tồn tại hoặc đã ngừng cung cấp");
      error.status = 404;
      guestService.getServiceCatalogDetail.mockRejectedValue(error);

      const req = { params: { id: "999" }, query: {} };
      const res = createMockResponse();

      await guestController.getServiceCatalogDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Dịch vụ không tồn tại hoặc đã ngừng cung cấp",
      });
    });

    it("UTCID11 - View Service Details - should return 400 Bad Request when service ID is non-integer", async () => {
      const req = { params: { id: "invalid-id" }, query: {} };
      const res = createMockResponse();

      await guestController.getServiceCatalogDetail(req, res);

      expect(guestService.getServiceCatalogDetail).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "id phải là số nguyên dương",
      });
    });
  });

  /* ==========================================================================
   * 5. View Service Combo List
   * ========================================================================== */
  describe("View Service Combo List", () => {
    it("UTCID12 - View Service Combo List - should return 200 OK with list of service combos", async () => {
      const mockCombos = [
        {
          id: 1,
          combo_name: "Basic Care Combo",
          description: "Oil change and tire rotation",
          total_price: 350000,
          catalogs: [
            { id: 1, service_name: "Oil Change" },
            { id: 2, service_name: "Tire Rotation" },
          ],
        },
      ];
      guestService.getServiceCombos.mockResolvedValue(mockCombos);

      const req = { query: { lang: "en" } };
      const res = createMockResponse();

      await guestController.getServiceCombos(req, res);

      expect(guestService.getServiceCombos).toHaveBeenCalledWith("en");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockCombos,
      });
    });
  });

  /* ==========================================================================
   * 6. Search Service Combo
   * ========================================================================== */
  describe("Search Service Combo", () => {
    it("UTCID13 - Search Service Combo - should return 200 OK with matching service combos when searching by keyword", async () => {
      const allCombos = [
        { id: 1, combo_name: "Basic Maintenance Combo", description: "Standard checkup" },
        { id: 2, combo_name: "Full Premium Overhaul", description: "Complete service" },
      ];
      guestService.getServiceCombos.mockResolvedValue(allCombos);

      const req = { query: { q: "Maintenance", lang: "en" } };
      const res = createMockResponse();

      await guestController.getServiceCombos(req, res);

      expect(guestService.getServiceCombos).toHaveBeenCalledWith("en");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: allCombos,
      });
    });
  });

  /* ==========================================================================
   * 7. View Service Combo Details
   * ========================================================================== */
  describe("View Service Combo Details", () => {
    it("UTCID14 - View Service Combo Details - should return 200 OK with specific combo detail when requested", async () => {
      const mockComboDetail = {
        id: 1,
        combo_name: "Full Maintenance Package",
        description: "Includes oil change, filter replacement, and multi-point inspection",
        total_price: 500000,
        catalogs: [
          { id: 1, service_name: "Oil Change", total_price: 200000 },
          { id: 2, service_name: "Air Filter", total_price: 300000 },
        ],
      };
      guestService.getServiceCombos.mockResolvedValue([mockComboDetail]);

      const req = { query: { lang: "en" } };
      const res = createMockResponse();

      await guestController.getServiceCombos(req, res);

      expect(guestService.getServiceCombos).toHaveBeenCalledWith("en");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: [mockComboDetail],
      });
    });
  });
});
