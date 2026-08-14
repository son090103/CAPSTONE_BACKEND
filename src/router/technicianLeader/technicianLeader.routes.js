const express = require("express");
const taskAssignmentController = require("../../controller/technicianLeader/taskAssignmentManagement.controller")
const router = express.Router();
const notificationController = require("../../controller/technicianLeader/notification.controller");
const appointmentController = require("../../controller/technicianLeader/appointment.controller");
const serviceOrderController = require("../../controller/technicianLeader/serviceOrder.controller");
const quoteManagementController = require("../../controller/technicianLeader/quoteManagement.controller");

router.get("/components", quoteManagementController.getAllComponents);
router.get("/issue-report/tasks", quoteManagementController.getActiveTasksForIssueReport);
router.post("/issue-report", quoteManagementController.createIssuesReport);
router.post("/issue-report/standalone", quoteManagementController.createStandaloneIssueReport);
router.get("/issues", quoteManagementController.getIssueReports);
router.post("/quote", quoteManagementController.createQuotation);
router.patch("/quote/:id", quoteManagementController.updateQuotation);
router.get("/quote", quoteManagementController.getQuoteHistory);
router.get("/quote/service-order/:serviceOrderId/payment-summary", quoteManagementController.getPaymentSummary);
router.get("/spare-parts", quoteManagementController.getSpareParts);
router.get("/services", quoteManagementController.getAllService);
router.get("/quotation/:id", quoteManagementController.getQuotationById);
router.patch("/quotation/:id/approve", quoteManagementController.approveQuote);
router.post("/restock-requests", quoteManagementController.createRestockRequest);

router.post("/service-order", serviceOrderController.createServiceOrder);
router.get("/service-order/:id", serviceOrderController.getServiceOrderById);
router.patch("/service-order/:id/close-early", serviceOrderController.closeServiceOrderEarly);
router.get("/appointments", appointmentController.getReceivedAppointments);
router.get("/tasks", taskAssignmentController.getAllTasks);
router.get("/issues-report-history", taskAssignmentController.getIssuesReportHistoryForLeader);
router.post("/assign", taskAssignmentController.assignTask);
router.get("/assignments", taskAssignmentController.getAssignmentHistory);
router.patch("/assignments/:assignmentId", taskAssignmentController.updateAssignment);
router.patch("/assignments/:assignmentId/complete", taskAssignmentController.completeTaskByLeader);
router.get("/task-tracking", taskAssignmentController.getServiceOrdersWithTasks);
router.get("/technicians", taskAssignmentController.getAllTechnician);
router.get("/notifications", notificationController.getNotifications);
router.get("/notifications/unread-count", notificationController.getUnreadCount);
router.put("/notifications/read-all", notificationController.markAllAsRead);
router.put("/notifications/:id/read", notificationController.markAsRead);

module.exports = router;