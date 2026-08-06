const mockCreateSupplier = jest.fn();
const mockGetSupplier = jest.fn();
const mockUpdateSupplier = jest.fn();

jest.mock("../../../service/inventory/supplierManagement.service", () => ({
  createSupplier: mockCreateSupplier,
  getSupplier: mockGetSupplier,
  updateSupplier: mockUpdateSupplier,
}));

const controller = require("../../../controller/inventory/supplierManagement.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("Supplier Management Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createSupplier", () => {
    it("should return 400 when validation fails", async () => {
      const req = { body: { name: "" } };
      const res = createMockResponse();

      await controller.createSupplier(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: expect.any(String),
      });
      expect(mockCreateSupplier).not.toHaveBeenCalled();
    });

    it("should create supplier successfully", async () => {
      const fakeData = { id: 1, name: "NC1" };
      mockCreateSupplier.mockResolvedValue(fakeData);
      const req = {
        body: {
          name: "NC1",
          phone: "0901234567",
          address: "123 Nguyen Hue Street HCM",
          is_active: true,
        },
      };
      const res = createMockResponse();

      await controller.createSupplier(req, res);

      expect(mockCreateSupplier).toHaveBeenCalledWith("NC1", "0901234567", "123 Nguyen Hue Street HCM", true);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Tạo nhà cung thành công",
        data: fakeData,
      });
    });
  });

  describe("getSupplier", () => {
    it("should return supplier list", async () => {
      const fakeData = [{ id: 1, name: "NC1" }];
      mockGetSupplier.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getSupplier(req, res);

      expect(mockGetSupplier).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: fakeData });
    });
  });

  describe("updateSupplier", () => {
    it("should return 400 when validation fails", async () => {
      const req = { params: { id: "1" }, body: { name: "" } };
      const res = createMockResponse();

      await controller.updateSupplier(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        message: expect.any(String),
      });
      expect(mockUpdateSupplier).not.toHaveBeenCalled();
    });
  });
});
