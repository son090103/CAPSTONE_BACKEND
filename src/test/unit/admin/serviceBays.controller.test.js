const mockListServiceBays = jest.fn();
const mockCreateServiceBay = jest.fn();
const mockUpdateServiceBay = jest.fn();
const mockRemoveServiceBay = jest.fn();

jest.mock("../../../service/admin/serviceBay.service", () => ({
  listServiceBays: mockListServiceBays,
  createServiceBay: mockCreateServiceBay,
  updateServiceBay: mockUpdateServiceBay,
  removeServiceBay: mockRemoveServiceBay,
}));

const controller = require("../../../controller/admin/serviceBays.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("ServiceBays Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("listServiceBays", () => {
    it("should return list of service bays", async () => {
      const fakeData = [{ id: 1, bay_name: "Bay 1" }];
      mockListServiceBays.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.listServiceBays(req, res);

      expect(mockListServiceBays).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy danh sách cầu sửa chữa thành công",
        data: fakeData,
      });
    });
  });

  describe("createServiceBay", () => {
    it("should return 400 when validation fails", async () => {
      const req = { body: { bay_name: "" } };
      const res = createMockResponse();

      await controller.createServiceBay(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: expect.any(Array),
      });
      expect(mockCreateServiceBay).not.toHaveBeenCalled();
    });

    it("should create service bay successfully", async () => {
      const fakeData = { id: 1, bay_name: "Bay 1" };
      mockCreateServiceBay.mockResolvedValue(fakeData);
      const req = { body: { bay_name: "Bay 1", is_active: true } };
      const res = createMockResponse();

      await controller.createServiceBay(req, res);

      expect(mockCreateServiceBay).toHaveBeenCalledWith(expect.objectContaining({ bay_name: "Bay 1" }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Tạo cầu sửa chữa thành công",
        data: fakeData,
      });
    });
  });

  describe("updateServiceBay", () => {
    it("should return 400 when validation fails", async () => {
      const req = { params: { id: "1" }, body: { bay_name: "" } };
      const res = createMockResponse();

      await controller.updateServiceBay(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: expect.any(Array),
      });
      expect(mockUpdateServiceBay).not.toHaveBeenCalled();
    });
  });

  describe("removeServiceBay", () => {
    it("should remove service bay successfully", async () => {
      mockRemoveServiceBay.mockResolvedValue(undefined);
      const req = { params: { id: "1" } };
      const res = createMockResponse();

      await controller.removeServiceBay(req, res);

      expect(mockRemoveServiceBay).toHaveBeenCalledWith("1");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Xóa cầu sửa chữa thành công",
      });
    });
  });
});
