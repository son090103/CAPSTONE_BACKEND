const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockProcessRefreshToken = jest.fn();

jest.mock("../../../service/auth/auth.service", () => ({
  login: mockLogin,
  register: mockRegister,
  processRefreshToken: mockProcessRefreshToken
}));

const controller = require("../../../controller/auth/auth.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// Auth Controller - register
describe("register", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Validation", () => {
    it("should return 400 when required fields are missing", async () => {
      const req = {
        body: {},
      };
      const res = createMockResponse();
      await controller.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockRegister).not.toHaveBeenCalled();
    });

    it("should return 400 when fullname is invalid", async () => {
      const req = {
        body: {
          fullName: "",
          password: "123456",
        },
      };
      const res = createMockResponse();
      await controller.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockRegister).not.toHaveBeenCalled();
    });
    it("should return 400 when password is invalid", async () => {
      const req = {
        body: {
          fullName: "Nguyen Van A",
          password: "123",
        },
      };
      const res = createMockResponse();
      await controller.register(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mockRegister).not.toHaveBeenCalled();
    });
    it("should return 201 when register successfully", async () => {
      const fakeData = {
        id: 1,
        fullName: "Nguyen Van A",
      };
      mockRegister.mockResolvedValue(fakeData);
      const req = {
        body: {
          idToken: "valid-firebase-token",
          fullName: "Nguyen Van A",
          password: "123456",
          confirmPassword: "123456",
        },
      };
      const res = createMockResponse();
      await controller.register(req, res);
      expect(mockRegister).toHaveBeenCalledWith(
        "valid-firebase-token",
        "Nguyen Van A",
        "123456",
        "123456"
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

  });
});

describe("refreshToken", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should return 200 and new tokens", async () => {
    const fakeResult = {
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    };
    mockProcessRefreshToken.mockResolvedValue(fakeResult);
    const req = {
      body: {
        refreshToken: "old-refresh-token",
      },
    };
    const res = createMockResponse();
    await controller.refreshToken(req, res);
    expect(mockProcessRefreshToken).toHaveBeenCalledWith("old-refresh-token");
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      state: 200,
      message: "Success",
      accessToken: "new-access-token",
      refreshToken: "new-refresh-token",
    });
  });

  it("should return 401 when refresh token is invalid", async () => {
    jest.spyOn(console, "error").mockImplementation(() => { });

    mockProcessRefreshToken.mockRejectedValue(
      new Error("Invalid refresh token")
    );
    const req = {
      body: {
        refreshToken: "invalid-token",
      },
    };
    const res = createMockResponse();
    await controller.refreshToken(req, res);
    expect(mockProcessRefreshToken).toHaveBeenCalledWith("invalid-token");
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      state: 401,
      message: "Unauthorized",
    });

    console.error.mockRestore();
  });
});