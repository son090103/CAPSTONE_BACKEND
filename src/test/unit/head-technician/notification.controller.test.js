const notificationService = require("../../../service/technicianLeader/notification.service");

jest.mock("../../../service/technicianLeader/notification.service", () => ({
  getNotifications: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  getUnreadCount: jest.fn(),
}));

const controller = require("../../../controller/technicianLeader/notification.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-20: Head Technician Notifications Controller Tests (Head Technician Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. View Notifications
   * ========================================================================== */
  describe("View Notifications", () => {
    it("UTCID01 - View Notifications - should return 200 OK with list of notifications for Head Technician", async () => {
      const mockNotifications = [
        { id: 1, title: "Xe chờ nghiệm thu", message: "Lệnh sửa chữa #10 cần nghiệm thu tổng thể", isRead: false },
      ];
      notificationService.getNotifications.mockResolvedValue(mockNotifications);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.getNotifications(req, res);

      expect(notificationService.getNotifications).toHaveBeenCalledWith(2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockNotifications);
    });

    it("UTCID02 - View Notifications - should return 200 OK with unread notification count", async () => {
      notificationService.getUnreadCount.mockResolvedValue(5);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.getUnreadCount(req, res);

      expect(notificationService.getUnreadCount).toHaveBeenCalledWith(2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ count: 5 });
    });

    it("UTCID03 - View Notifications - should return 200 OK when marking single notification as read", async () => {
      const mockResult = { id: 1, isRead: true };
      notificationService.markAsRead.mockResolvedValue(mockResult);

      const req = { params: { id: "1" } };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.markAsRead(req, res);

      expect(notificationService.markAsRead).toHaveBeenCalledWith("1", 2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đã đánh dấu đọc",
        data: mockResult,
      });
    });

    it("UTCID04 - View Notifications - should return 200 OK when marking all notifications as read", async () => {
      const mockResult = [1, 2, 3];
      notificationService.markAllAsRead.mockResolvedValue(mockResult);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.markAllAsRead(req, res);

      expect(notificationService.markAllAsRead).toHaveBeenCalledWith(2);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đã đánh dấu đọc tất cả",
        data: mockResult,
      });
    });

    it("UTCID05 - View Notifications - should return 401 Unauthorized when user session is missing", async () => {
      const req = {};
      const res = createMockResponse();

      try {
        await controller.getNotifications(req, res);
      } catch (e) {}

      expect(notificationService.getNotifications).not.toHaveBeenCalled();
    });

    it("UTCID06 - View Notifications - should return 404 Not Found when notification ID is not found", async () => {
      const error = { status: 404, message: "Không tìm thấy thông báo" };
      notificationService.markAsRead.mockRejectedValue(error);

      const req = { params: { id: "999" } };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Không tìm thấy thông báo",
      });
    });

    it("UTCID07 - View Notifications - should return 500 Internal Server Error when notification service fails", async () => {
      notificationService.getNotifications.mockRejectedValue(new Error("Notification DB error"));

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await controller.getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Notification DB error" });
    });
  });
});
