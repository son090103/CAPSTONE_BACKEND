const express = require("express");
const router = express.Router();
const appointmentController = require("../../controller/receptionist/appointment.controller");
const serviceOrderController = require("../../controller/receptionist/serviceOrder.controller");
const notificationController = require("../../controller/receptionist/notification.controller");
const searchController = require("../../controller/receptionist/search.controller");
const quoteManagementController = require("./../../controller/receptionist/quoteManagement.controller");
const technicianController = require("../../controller/receptionist/technician.controller");
const chatController = require("../../controller/chat/chat.controller");
const feedbackController = require("../../controller/receptionist/feedback.controller");

router.get("/quote/service-order/:serviceOrderId/payment-summary",quoteManagementController.getPaymentSummary);
router.get("/quote", quoteManagementController.getQuoteHistory);
router.get("/quotation/:id", quoteManagementController.getQuotationById);
router.patch("/quotation/:id/approve", quoteManagementController.approveQuote);

router.get("/appointments", appointmentController.getAppointment);
router.post("/appointment", appointmentController.createAppointmentForCustomer);
router.post("/appointment/walk-in", appointmentController.createWalkInTicket);
router.get("/appointment/:key", appointmentController.getAppointmentByKey);
router.put("/appointment/:key/receive", appointmentController.receiveAppointment);
router.post("/appointment/:key/vin", appointmentController.updateVehicleVin);
router.get("/appointment/:key/vehicle-info", appointmentController.checkVehicleInfo);

router.post("/customer-info-by-phone", searchController.getCustomerInfoByPhone);
router.get("/customers", appointmentController.getCustomer);

router.get("/service-orders/complete", serviceOrderController.getCompleteServiceOrder)
router.get("/service-orders/awaiting-payment", serviceOrderController.getServiceOrdersAwaitingPayment)
router.post("/service-order", serviceOrderController.createServiceOrder)
router.get("/service-orders", serviceOrderController.getServiceOrders)
router.get("/service-order/:id", serviceOrderController.getServiceOrderById)
router.put("/service-order/:id/odo", serviceOrderController.updateServiceOrderOdo)
router.patch("/service-order/:id/close-early", serviceOrderController.closeServiceOrderEarly)

router.get("/notifications", notificationController.getNotification)
router.get("/notifications/unread-count", notificationController.getUnreadCount)
router.get("/notification/:id", notificationController.getNotificationById)
router.put("/notification/:id/read", notificationController.markAsRead)

// lấy ra toàn bộ technician làm hôm nay
router.get("/technicians/working-today", technicianController.getTechniciansWorkingToday);

// Phân công technician cho 1 yêu cầu cứu hộ
router.post("/rescue/assign", technicianController.assignRescueTechnician);
router.post("/rescue/create", technicianController.createRescueRequest);
router.patch("/rescue/:rescueId/cancel", technicianController.cancelRescueRequest);

router.get("/feedback", feedbackController.getAllFeedbacks);

router.get("/chat/conversations", chatController.getConversationsForReception);
router.get("/chat/conversations/:id", chatController.getConversationDetailForReception);
router.post("/chat/conversations/:id/claim", chatController.claimConversation);
router.post("/chat/conversations/:id/unclaim", chatController.unclaimConversation);
router.post("/chat/conversations/:id/message", chatController.sendMessageAsReceptionist);
router.get("/chat/unread-count", chatController.getUnreadCountForReception);

module.exports = router;
