const express = require("express");
const router = express.Router();
const appointmentController = require("../../controller/receptionist/appointment.controller");
const serviceOrderController = require("../../controller/receptionist/serviceOrder.controller");
const notificationController = require("../../controller/receptionist/notification.controller");
const searchController = require("../../controller/receptionist/search.controller");
const quoteManagementController = require("./../../controller/receptionist/quoteManagement.controller");
const technicianController = require("../../controller/receptionist/technician.controller");
const chatController = require("../../controller/chat/chat.controller");

router.get("/issues", quoteManagementController.getIssueReports);
router.get("/issues/additional", quoteManagementController.getAdditionalIssueReports);
router.post("/quote", quoteManagementController.createQuotation);
router.patch("/quote/:id", quoteManagementController.updateQuotation);
router.get("/quote", quoteManagementController.getQuoteHistory);
router.get("/quote/service-order/:serviceOrderId/payment-summary",quoteManagementController.getPaymentSummary);
router.get("/spare-parts", quoteManagementController.getSpareParts);
router.get("/services", quoteManagementController.getAllService);

router.get("/appointments", appointmentController.getAppointment);
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

router.get("/notifications", notificationController.getNotification)
router.get("/notifications/unread-count", notificationController.getUnreadCount)
router.get("/notification/:id", notificationController.getNotificationById)
router.put("/notification/:id/read", notificationController.markAsRead)

router.get("/quotation/:id", quoteManagementController.getQuotationById);
router.patch("/quotation/:id/approve-otp", quoteManagementController.approveQuoteByOTP);
// lấy ra toàn bộ technician làm hôm nay 
router.get("/technicians/working-today", technicianController.getTechniciansWorkingToday);

// Phân công technician cho 1 yêu cầu cứu hộ
router.post("/rescue/assign", technicianController.assignRescueTechnician);

router.get("/chat/conversations", chatController.getConversationsForReception);
router.get("/chat/conversations/:id", chatController.getConversationDetailForReception);
router.post("/chat/conversations/:id/claim", chatController.claimConversation);
router.post("/chat/conversations/:id/unclaim", chatController.unclaimConversation);
router.post("/chat/conversations/:id/message", chatController.sendMessageAsReceptionist);
router.get("/chat/unread-count", chatController.getUnreadCountForReception);

module.exports = router;
