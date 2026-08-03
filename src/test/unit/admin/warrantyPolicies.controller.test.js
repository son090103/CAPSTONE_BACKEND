const mockListWarrantyPolicies = jest.fn();
const mockCreateWarrantyPolicy = jest.fn();
const mockUpdateWarrantyPolicy = jest.fn();

jest.mock("../../../service/admin/warrantyPolicies.service", () => ({
  listWarrantyPolicies: mockListWarrantyPolicies,
  createWarrantyPolicy: mockCreateWarrantyPolicy,
  updateWarrantyPolicy: mockUpdateWarrantyPolicy,
}));

jest.mock("../../../helper/uploadToCloudinary.helper", () => ({
  uploadToCloudinary: jest.fn().mockResolvedValue({ secure_url: "https://example.com/file" }),
}));

const controller = require("../../../controller/admin/warrantyPolicies.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("WarrantyPolicies Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getWarrantyPolicies", () => {
    it("should return warranty policies list", async () => {
      const fakeData = [{ id: 1, policy_name: "Bảo hành cơ bản" }];
      mockListWarrantyPolicies.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getWarrantyPolicies(req, res);

      expect(mockListWarrantyPolicies).toHaveBeenCalledTimes(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Lấy danh sách chính sách bảo hành thành công",
        data: fakeData,
      });
    });
  });

  describe("createWarrantyPolicy", () => {
    it("should return 400 when validation fails", async () => {
      const req = { body: { policy_code: "", policy_name: "" } };
      const res = createMockResponse();

      await controller.createWarrantyPolicy(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: expect.any(Array),
      });
      expect(mockCreateWarrantyPolicy).not.toHaveBeenCalled();
    });

    it("should create warranty policy successfully", async () => {
      const fakeData = { id: 1, policy_name: "Bảo hành cơ bản" };
      mockCreateWarrantyPolicy.mockResolvedValue(fakeData);
      const req = {
        body: {
          policy_code: "WP-001",
          policy_name: "Bảo hành cơ bản",
          description: "Mô tả",
          is_active: true,
        },
      };
      const res = createMockResponse();

      await controller.createWarrantyPolicy(req, res);

      expect(mockCreateWarrantyPolicy).toHaveBeenCalledWith(expect.objectContaining({
        policy_code: "WP-001",
        policy_name: "Bảo hành cơ bản",
      }));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Tạo chính sách bảo hành thành công",
        data: fakeData,
      });
    });
  });

  describe("updateWarrantyPolicy", () => {
    it("should return 400 when validation fails", async () => {
      const req = { params: { id: "1" }, body: { policy_code: "" } };
      const res = createMockResponse();

      await controller.updateWarrantyPolicy(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Dữ liệu không hợp lệ",
        errors: expect.any(Array),
      });
      expect(mockUpdateWarrantyPolicy).not.toHaveBeenCalled();
    });

    it("should update warranty policy successfully", async () => {
      const fakeData = { id: 1, policy_name: "Bảo hành cơ bản" };
      mockUpdateWarrantyPolicy.mockResolvedValue(fakeData);
      const req = {
        params: { id: "1" },
        body: {
          policy_code: "WP-001",
          policy_name: "Bảo hành cơ bản",
          description: "Mô tả cập nhật",
          is_active: false,
        },
      };
      const res = createMockResponse();

      await controller.updateWarrantyPolicy(req, res);

      expect(mockUpdateWarrantyPolicy).toHaveBeenCalledWith("1", expect.objectContaining({
        policy_code: "WP-001",
        policy_name: "Bảo hành cơ bản",
      }));
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Cập nhật chính sách bảo hành thành công",
        data: fakeData,
      });
    });
  });
});
