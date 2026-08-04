const paymentService = require("../../../service/payment/payment.service");
const appointmentService = require("../../../service/customer/appointment.service");
const serviceHistoryAndTrackingService = require("../../../service/customer/serviceHistoryAndTracking.service");

jest.mock("../../../service/payment/payment.service", () => ({
  initPayment: jest.fn(),
  checkPaymentStatus: jest.fn(),
  confirmPayment: jest.fn(),
  handleSepayTransaction: jest.fn(),
}));

jest.mock("../../../service/customer/appointment.service", () => ({
  createAppointment: jest.fn(),
}));

jest.mock("../../../service/customer/serviceHistoryAndTracking.service", () => ({
  getRepairProgress: jest.fn(),
  getServiceHistory: jest.fn(),
}));

const paymentController = require("../../../controller/payment/payment.controller");
const appointmentController = require("../../../controller/customer/appointment.controller");
const trackingController = require("../../../controller/customer/serviceHistoryAndTracking.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-09: Rescue & Payment Controller Tests (Customer Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. Rescue Request
   * ========================================================================== */
  describe("Rescue Request", () => {
    it("UTCID01 - Rescue Request - should return 201 Created when customer submits valid emergency rescue request", async () => {
      const mockRescueAppointment = {
        id: 50,
        booking_type: "CUSTOMER_REPAIR",
        notes: "Cứu hộ chết máy tại 45 Lê Văn Lương",
        status: "CONFIRMED",
      };
      appointmentService.createAppointment.mockResolvedValue(mockRescueAppointment);

      const req = {
        body: {
          vehicle_plate: "30A-888.88",
          booking_type: "CUSTOMER_REPAIR",
          scheduled_time: "2026-08-04T15:00:00.000Z",
          notes: "Cứu hộ chết máy tại 45 Lê Văn Lương",
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.createAppointment(req, res);

      expect(appointmentService.createAppointment).toHaveBeenCalledWith(1, expect.any(Object));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: "Đặt lịch hẹn thành công",
        data: mockRescueAppointment,
      });
    });

    it("UTCID02 - Rescue Request - should return 400 Bad Request when rescue details fail validation", async () => {
      const req = {
        body: {
          booking_type: "INVALID_RESCUE_TYPE",
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(appointmentService.createAppointment).not.toHaveBeenCalled();
    });

    it("UTCID03 - Rescue Request - should return 401 Unauthorized when user is unauthenticated", async () => {
      const req = {
        body: {
          vehicle_plate: "30A-888.88",
          booking_type: "CUSTOMER_REPAIR",
          scheduled_time: "2026-08-04T15:00:00.000Z",
        },
      };
      const res = createMockResponse();

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
      expect(appointmentService.createAppointment).not.toHaveBeenCalled();
    });

    it("UTCID04 - Rescue Request - should return 500 Internal Server Error when rescue dispatch fails", async () => {
      appointmentService.createAppointment.mockRejectedValue(new Error("Rescue dispatch service failure"));

      const req = {
        body: {
          vehicle_plate: "30A-888.88",
          booking_type: "CUSTOMER_REPAIR",
          scheduled_time: "2026-08-04T15:00:00.000Z",
        },
      };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await appointmentController.createAppointment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Rescue dispatch service failure",
      });
    });
  });

  /* ==========================================================================
   * 2. Rescue Tracking
   * ========================================================================== */
  describe("Rescue Tracking", () => {
    it("UTCID05 - Rescue Tracking - should return 200 OK with live tracking status for ongoing rescue", async () => {
      const mockTrackingData = [
        {
          id: 50,
          status: "IN_PROGRESS",
          entry_time: "2026-08-04T15:00:00.000Z",
          vehicle: { license_plate: "30A-888.88" },
          tasks: [{ id: 1, type: "REPAIR", status: "IN_PROGRESS" }],
        },
      ];
      serviceHistoryAndTrackingService.getRepairProgress.mockResolvedValue(mockTrackingData);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await trackingController.getRepairProgress(req, res);

      expect(serviceHistoryAndTrackingService.getRepairProgress).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ data: mockTrackingData });
    });

    it("UTCID06 - Rescue Tracking - should return 404 Not Found when customer has no active rescue request", async () => {
      const error = { status: 404, message: "Không tìm thấy thông tin cứu hộ" };
      serviceHistoryAndTrackingService.getRepairProgress.mockRejectedValue(error);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 99 };

      await trackingController.getRepairProgress(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: "Không tìm thấy thông tin cứu hộ" });
    });

    it("UTCID07 - Rescue Tracking - should return 500 Internal Server Error on tracking service exception", async () => {
      serviceHistoryAndTrackingService.getRepairProgress.mockRejectedValue(new Error("Tracking service connection lost"));

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await trackingController.getRepairProgress(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: "Tracking service connection lost" });
    });
  });

  /* ==========================================================================
   * 3. Process Payment
   * ========================================================================== */
  describe("Process Payment", () => {
    it("UTCID08 - Process Payment - should return 200 OK with VietQR payment data on init", async () => {
      const mockPaymentData = {
        orderId: 10,
        amount: 500000,
        qrCodeUrl: "https://qr.sepay.vn/img?acc=123&bank=MB",
      };
      paymentService.initPayment.mockResolvedValue(mockPaymentData);

      const req = { body: { orderId: 10, amount: 500000 } };
      const res = createMockResponse();

      await paymentController.initPayment(req, res);

      expect(paymentService.initPayment).toHaveBeenCalledWith(10, 500000);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockPaymentData });
    });

    it("UTCID09 - Process Payment - should return 200 OK with isPaid true when checking payment status", async () => {
      paymentService.checkPaymentStatus.mockResolvedValue({ isPaid: true });

      const req = { query: { bookingCode: "ORD10" } };
      const res = createMockResponse();

      await paymentController.checkPaymentStatus(req, res);

      expect(paymentService.checkPaymentStatus).toHaveBeenCalledWith("ORD10");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, isPaid: true });
    });

    it("UTCID10 - Process Payment - should return 400 Bad Request when orderId is missing during initPayment", async () => {
      const req = { body: { amount: 500000 } };
      const res = createMockResponse();

      await paymentController.initPayment(req, res);

      expect(paymentService.initPayment).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Missing orderId" });
    });

    it("UTCID11 - Process Payment - should return 400 Bad Request when bookingCode is missing during checkPaymentStatus", async () => {
      const req = { query: {} };
      const res = createMockResponse();

      await paymentController.checkPaymentStatus(req, res);

      expect(paymentService.checkPaymentStatus).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Missing bookingCode" });
    });

    it("UTCID12 - Process Payment - should return 500 Internal Server Error when payment gateway throws error", async () => {
      paymentService.initPayment.mockRejectedValue(new Error("Sepay Gateway Connection Error"));

      const req = { body: { orderId: 10, amount: 500000 } };
      const res = createMockResponse();

      await paymentController.initPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Internal server error" });
    });
  });

  /* ==========================================================================
   * 4. View Payment Invoice
   * ========================================================================== */
  describe("View Payment Invoice", () => {
    it("UTCID13 - View Payment Invoice - should return 200 OK with completed payment invoice details", async () => {
      const mockInvoiceData = [
        {
          id: 10,
          status: "DELIVERED",
          payment: { id: 1, payment_status: "PAID", amount: 1500000, payment_method: "VIETQR" },
        },
      ];
      serviceHistoryAndTrackingService.getServiceHistory.mockResolvedValue(mockInvoiceData);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await trackingController.getServiceHistory(req, res);

      expect(serviceHistoryAndTrackingService.getServiceHistory).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockInvoiceData });
    });

    it("UTCID14 - View Payment Invoice - should return 404 Not Found when customer has no invoice history", async () => {
      const error = { status: 404, message: "Không tìm thấy hóa đơn thanh toán" };
      serviceHistoryAndTrackingService.getServiceHistory.mockRejectedValue(error);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 99 };

      await trackingController.getServiceHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Không tìm thấy hóa đơn thanh toán" });
    });

    it("UTCID15 - View Payment Invoice - should return 500 Internal Server Error when invoice query fails", async () => {
      serviceHistoryAndTrackingService.getServiceHistory.mockRejectedValue(new Error("Invoice service DB error"));

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await trackingController.getServiceHistory(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: "Invoice service DB error" });
    });
  });
});
