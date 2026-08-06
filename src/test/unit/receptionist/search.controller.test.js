const mockGetCustomerInfoByPhone = jest.fn();

jest.mock("../../../service/receptionist/search.service", () => ({
  getCustomerInfoByPhone: mockGetCustomerInfoByPhone,
}));

const controller = require("../../../controller/receptionist/search.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = { user: { id: 4 } };
  return res;
};

describe("Receptionist Search Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 401 when user is not authenticated", async () => {
    const req = { body: { phone: "0909" } };
    const res = createMockResponse();
    res.locals.user = null;

    await controller.getCustomerInfoByPhone(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    expect(mockGetCustomerInfoByPhone).not.toHaveBeenCalled();
  });

  it("should return 400 when phone is missing", async () => {
    const req = { body: {} };
    const res = createMockResponse();

    await controller.getCustomerInfoByPhone(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Vui lòng cung cấp số điện thoại",
    });
    expect(mockGetCustomerInfoByPhone).not.toHaveBeenCalled();
  });

  it("should return customer info on success", async () => {
    const fakeData = { id: 10, phone: "0909" };
    mockGetCustomerInfoByPhone.mockResolvedValue(fakeData);
    const req = { body: { phone: "0909" } };
    const res = createMockResponse();

    await controller.getCustomerInfoByPhone(req, res);

    expect(mockGetCustomerInfoByPhone).toHaveBeenCalledWith("0909");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "Lấy thông tin khách hàng thành công",
      data: fakeData,
    });
  });

  it("should return error when service throws", async () => {
    const error = new Error("Not found");
    error.status = 404;
    mockGetCustomerInfoByPhone.mockRejectedValue(error);

    const req = { body: { phone: "0909" } };
    const res = createMockResponse();

    await controller.getCustomerInfoByPhone(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Not found",
    });
  });
});
