const mockGetNotifications = jest.fn();
const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockGetUnreadCount = jest.fn();

jest.mock("../../../service/inventory/notification.service", () => ({
  getNotifications: mockGetNotifications,
  markAsRead: mockMarkAsRead,
  markAllAsRead: mockMarkAllAsRead,
  getUnreadCount: mockGetUnreadCount,
}));

const controller = require("../../../controller/inventory/notification.controller");

const createMockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = { user: { id: 11 } };
  return res;
};

describe("Inventory Notification Controller", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getNotifications", () => {
    it("should return notifications on success", async () => {
      const fakeData = [{ id: 1, title: "Inventory alert" }];
      mockGetNotifications.mockResolvedValue(fakeData);
      const req = {};
      const res = createMockResponse();

      await controller.getNotifications(req, res);

      expect(mockGetNotifications).toHaveBeenCalledWith(11);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(fakeData);
    });
  });

  describe("markAsRead", () => {
    it("should mark notification as read", async () => {
      const fakeResult = { id: 1, is_read: true };
      mockMarkAsRead.mockResolvedValue(fakeResult);
      const req = { params: { id: "1" } };
      const res = createMockResponse();

      await controller.markAsRead(req, res);

      expect(mockMarkAsRead).toHaveBeenCalledWith("1", 11);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đã đánh dấu đọc",
        data: fakeResult,
      });
    });
  });

  describe("markAllAsRead", () => {
    it("should mark all notifications as read", async () => {
      const fakeResult = [{ id: 1, is_read: true }];
      mockMarkAllAsRead.mockResolvedValue(fakeResult);
      const req = {};
      const res = createMockResponse();

      await controller.markAllAsRead(req, res);

      expect(mockMarkAllAsRead).toHaveBeenCalledWith(11);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đã đánh dấu đọc tất cả",
        data: fakeResult,
      });
    });
  });

  describe("getUnreadCount", () => {
    it("should return unread count", async () => {
      mockGetUnreadCount.mockResolvedValue(2);
      const req = {};
      const res = createMockResponse();

      await controller.getUnreadCount(req, res);

      expect(mockGetUnreadCount).toHaveBeenCalledWith(11);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ count: 2 });
    });
  });
});
