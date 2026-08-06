const mockGetNotifications = jest.fn();
const mockGetNotificationById = jest.fn();
const mockMarkAsRead = jest.fn();
const mockGetUnreadCount = jest.fn();

jest.mock("../../../service/receptionist/notification.service", () => ({
  getNotifications: mockGetNotifications,
  getNotificationById: mockGetNotificationById,
  markAsRead: mockMarkAsRead,
  getUnreadCount: mockGetUnreadCount,
}));

const controller = require("../../../controller/receptionist/notification.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = { user: { id: 7 } };
  return res;
};

describe("Receptionist Notification Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getNotification", () => {
    it("should return notification list on success", async () => {
      const fakeData = [{ id: 1, title: "Thông báo" }];
      mockGetNotifications.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getNotification(req, res);

      expect(mockGetNotifications).toHaveBeenCalledWith(7);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(fakeData);
    });

    it("should return error when service throws", async () => {
      const error = new Error("DB error");
      error.status = 500;
      mockGetNotifications.mockRejectedValue(error);

      const req = {};
      const res = createMockResponse();

      await controller.getNotification(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "DB error",
      });
    });
  });

  describe("getNotificationById", () => {
    it("should return detail notification by id", async () => {
      const fakeData = { id: 1, title: "Thông báo" };
      mockGetNotificationById.mockResolvedValue(fakeData);
      const req = { params: { id: "1" } };
      const res = createMockResponse();

      await controller.getNotificationById(req, res);

      expect(mockGetNotificationById).toHaveBeenCalledWith("1", 7);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(fakeData);
    });
  });

  describe("markAsRead", () => {
    it("should mark notification as read", async () => {
      const fakeData = { id: 1, is_read: true };
      mockMarkAsRead.mockResolvedValue(fakeData);
      const req = { params: { id: "1" } };
      const res = createMockResponse();

      await controller.markAsRead(req, res);

      expect(mockMarkAsRead).toHaveBeenCalledWith("1", 7);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đã đánh dấu đọc",
        data: fakeData,
      });
    });
  });

  describe("getUnreadCount", () => {
    it("should return unread count", async () => {
      mockGetUnreadCount.mockResolvedValue(3);
      const req = {};
      const res = createMockResponse();

      await controller.getUnreadCount(req, res);

      expect(mockGetUnreadCount).toHaveBeenCalledWith(7);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ count: 3 });
    });
  });
});
