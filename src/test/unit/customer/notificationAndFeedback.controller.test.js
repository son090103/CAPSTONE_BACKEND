const notificationService = require("../../../service/customer/notification.service");
const feedbackService = require("../../../service/customer/feedback.service");

jest.mock("../../../service/customer/notification.service", () => ({
  getNotifications: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  getUnreadCount: jest.fn(),
}));

jest.mock("../../../service/customer/feedback.service", () => ({
  submitFeedback: jest.fn(),
  getCustomerFeedbacks: jest.fn(),
}));

const notificationController = require("../../../controller/customer/notification.controller");
const feedbackController = require("../../../controller/customer/feedback.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-06: Notification & Feedback Controller Tests (Customer Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. View Notification
   * ========================================================================== */
  describe("View Notification", () => {
    it("UTCID01 - View Notification - should return 200 OK with customer notifications list", async () => {
      const mockNotifications = [
        { id: 1, title: "Lịch hẹn đã xác nhận", isRead: false, createdAt: "2026-08-04T10:00:00.000Z" },
      ];
      notificationService.getNotifications.mockResolvedValue(mockNotifications);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await notificationController.getNotifications(req, res);

      expect(notificationService.getNotifications).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockNotifications);
    });

    it("UTCID02 - View Notification - should return 200 OK with unread notification count", async () => {
      notificationService.getUnreadCount.mockResolvedValue(3);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await notificationController.getUnreadCount(req, res);

      expect(notificationService.getUnreadCount).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ count: 3 });
    });

    it("UTCID03 - View Notification - should return 200 OK when marking a notification as read", async () => {
      const mockUpdated = { id: 10, isRead: true };
      notificationService.markAsRead.mockResolvedValue(mockUpdated);

      const req = { params: { id: "10" } };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await notificationController.markAsRead(req, res);

      expect(notificationService.markAsRead).toHaveBeenCalledWith("10", 1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đã đánh dấu đọc",
        data: mockUpdated,
      });
    });

    it("UTCID04 - View Notification - should return 404 Not Found when notification ID does not exist", async () => {
      const error = { status: 404, message: "Thông báo không tồn tại" };
      notificationService.markAsRead.mockRejectedValue(error);

      const req = { params: { id: "999" } };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await notificationController.markAsRead(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Thông báo không tồn tại",
      });
    });

    it("UTCID05 - View Notification - should return 500 Internal Server Error when notification fetch fails", async () => {
      notificationService.getNotifications.mockRejectedValue(new Error("Notification database error"));

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await notificationController.getNotifications(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        message: "Notification database error",
      });
    });
  });

  /* ==========================================================================
   * 2. Submit Feedback
   * ========================================================================== */
  describe("Submit Feedback", () => {
    it("UTCID06 - Submit Feedback - should return 201 Created when valid feedback payload is provided", async () => {
      const mockFeedbackResult = {
        id: 5,
        service_order_id: 12,
        rating: 5,
        comment: "Chất lượng dịch vụ tuyệt vời!",
      };
      feedbackService.submitFeedback.mockResolvedValue(mockFeedbackResult);

      const req = {
        body: { service_order_id: 12, rating: 5, comment: "Chất lượng dịch vụ tuyệt vời!" },
      };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await feedbackController.submitFeedback(req, res);

      expect(feedbackService.submitFeedback).toHaveBeenCalledWith(2, 12, 5, "Chất lượng dịch vụ tuyệt vời!");
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        message: "Gửi phản hồi thành công",
        data: mockFeedbackResult,
      });
    });

    it("UTCID07 - Submit Feedback - should return 401 Unauthorized when user is unauthenticated", async () => {
      const req = { body: { service_order_id: 12, rating: 5, comment: "Dịch vụ tốt" } };
      const res = createMockResponse();

      await feedbackController.submitFeedback(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
      expect(feedbackService.submitFeedback).not.toHaveBeenCalled();
    });

    it("UTCID08 - Submit Feedback - should return 400 Bad Request when rating validation fails", async () => {
      const req = {
        body: { service_order_id: 12, rating: 6, comment: "Rating > 5" },
      };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await feedbackController.submitFeedback(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(feedbackService.submitFeedback).not.toHaveBeenCalled();
    });

    it("UTCID09 - Submit Feedback - should return 403 Forbidden when order is not completed or unowned", async () => {
      const error = { status: 403, message: "Không thể đánh giá đơn hàng này" };
      feedbackService.submitFeedback.mockRejectedValue(error);

      const req = {
        body: { service_order_id: 99, rating: 4, comment: "Phản hồi thử nghiệm" },
      };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await feedbackController.submitFeedback(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ message: "Không thể đánh giá đơn hàng này" });
    });

    it("UTCID10 - Submit Feedback - should return 500 Internal Server Error on database exception", async () => {
      feedbackService.submitFeedback.mockRejectedValue(new Error("Database write failure"));

      const req = {
        body: { service_order_id: 12, rating: 5, comment: "Dịch vụ ok" },
      };
      const res = createMockResponse();
      res.locals.user = { id: 2 };

      await feedbackController.submitFeedback(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Database write failure" });
    });
  });

  /* ==========================================================================
   * 3. View Feedback
   * ========================================================================== */
  describe("View Feedback", () => {
    it("UTCID11 - View Feedback - should return 200 OK with customer submitted feedback history", async () => {
      const mockFeedbacks = [
        { id: 1, service_order_id: 10, rating: 5, comment: "Nhiệt tình", createdAt: "2026-08-01T14:00:00.000Z" },
      ];
      feedbackService.getCustomerFeedbacks.mockResolvedValue(mockFeedbacks);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 3 };

      await feedbackController.getMyFeedbacks(req, res);

      expect(feedbackService.getCustomerFeedbacks).toHaveBeenCalledWith(3);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockFeedbacks });
    });

    it("UTCID12 - View Feedback - should return 401 Unauthorized when user session is missing", async () => {
      const req = {};
      const res = createMockResponse();

      await feedbackController.getMyFeedbacks(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
      expect(feedbackService.getCustomerFeedbacks).not.toHaveBeenCalled();
    });

    it("UTCID13 - View Feedback - should return 500 Internal Server Error on service exception", async () => {
      feedbackService.getCustomerFeedbacks.mockRejectedValue(new Error("Internal DB failure"));

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 3 };

      await feedbackController.getMyFeedbacks(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Internal DB failure" });
    });
  });
});
