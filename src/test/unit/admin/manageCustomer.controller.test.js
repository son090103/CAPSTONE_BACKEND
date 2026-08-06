const mockGetCustomers = jest.fn();
const mockGetCustomerById = jest.fn();

jest.mock("../../../service/admin/manageCustomer.service", () => ({
  getCustomers: mockGetCustomers,
  getCustomerById: mockGetCustomerById,
}));

const controller = require("../../../controller/admin/manageCustomer.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("ManageCustomer Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getCustomer", () => {
    it("should return customer list on success", async () => {
      const fakeData = [{ id: 1, name: "Khách A" }];
      mockGetCustomers.mockResolvedValue(fakeData);
      const req = { query: { search: "A" } };
      const res = createMockResponse();

      await controller.getCustomer(req, res);

      expect(mockGetCustomers).toHaveBeenCalledWith("A");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(fakeData);
    });

    it("should return server error when service throws", async () => {
      const error = new Error("DB error");
      mockGetCustomers.mockRejectedValue(error);
      const req = { query: { search: "A" } };
      const res = createMockResponse();

      await controller.getCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Lỗi Server",
        error: "DB error",
      });
    });
  });

  describe("getCustomerDetail", () => {
    it("should return 400 when id is missing", async () => {
      const req = { params: {} };
      const res = createMockResponse();

      await controller.getCustomerDetail(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "ID không hợp lệ",
      });
      expect(mockGetCustomerById).not.toHaveBeenCalled();
    });

    it("should return customer detail on success", async () => {
      const fakeData = { id: 1, name: "Khách A" };
      mockGetCustomerById.mockResolvedValue(fakeData);
      const req = { params: { id: "1" } };
      const res = createMockResponse();

      await controller.getCustomerDetail(req, res);

      expect(mockGetCustomerById).toHaveBeenCalledWith("1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(fakeData);
    });
  });
});
