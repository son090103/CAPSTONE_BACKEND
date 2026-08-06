const mockUserFindOne = jest.fn();
const mockUserFindByPk = jest.fn();
const mockCustomersFindOne = jest.fn();
const mockVehiclesFindAll = jest.fn();

jest.mock("../../../../models", () => ({
  User: {
    findOne: mockUserFindOne,
    findByPk: mockUserFindByPk,
  },
  Role: {},
  Customers: {
    findOne: mockCustomersFindOne,
  },
  Vehicles: {
    findAll: mockVehiclesFindAll,
  },
  Vehicle_Models: {},
  Vehicle_Makes: {},
}));

jest.mock("../../../util/phone.util", () => ({
  normalizeVnPhone: jest.fn(),
}));

jest.mock("bcrypt", () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const profileService = require("../../../service/customer/profile.service");

describe("Customer Profile Service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getProfile", () => {
    it("should include vehicles in the profile response for the matched customer", async () => {
      const user = {
        id: 7,
        fullName: "Test User",
        email: "test@example.com",
        toJSON: () => ({ id: 7, fullName: "Test User", email: "test@example.com" }),
      };
      const vehicles = [
        {
          id: 1,
          license_plate: "51A-12345",
          model: { model_name: "City", make: { make_name: "Honda" } },
        },
      ];

      mockUserFindOne.mockResolvedValue(user);
      mockCustomersFindOne.mockResolvedValue({ id: 15 });
      mockVehiclesFindAll.mockResolvedValue(vehicles);

      const result = await profileService.getProfile(7);

      expect(mockUserFindOne).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 } }));
      expect(mockCustomersFindOne).toHaveBeenCalledWith(expect.objectContaining({
        where: { user_id: 7 },
        attributes: ["id"],
      }));
      expect(mockVehiclesFindAll).toHaveBeenCalledWith(expect.objectContaining({
        where: { customer_id: 15 },
      }));
      expect(result.vehicles).toEqual(vehicles);
    });

    it("should return an empty vehicles array when customer has no vehicles", async () => {
      const user = {
        id: 8,
        fullName: "No Vehicle User",
        toJSON: () => ({ id: 8, fullName: "No Vehicle User" }),
      };

      mockUserFindOne.mockResolvedValue(user);
      mockCustomersFindOne.mockResolvedValue({ id: 20 });
      mockVehiclesFindAll.mockResolvedValue([]);

      const result = await profileService.getProfile(8);

      expect(result.vehicles).toEqual([]);
      expect(mockVehiclesFindAll).toHaveBeenCalled();
    });

    it("should throw 404 when user does not exist", async () => {
      mockUserFindOne.mockResolvedValue(null);

      await expect(profileService.getProfile(99)).rejects.toEqual({
        status: 404,
        message: "Người dùng không tồn tại",
      });
    });
  });
});
