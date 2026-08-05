const express = require("express");
const taskAssignmentController = require("../../controller/technicianLeader/taskAssignmentManagement.controller")
const router = express.Router();
const serviceQualityInspectionController = require("../../controller/technicianLeader/serviceQualityInspection.controller");
const notificationController = require("../../controller/technicianLeader/notification.controller");

router.get("/quality-inspection", serviceQualityInspectionController.getServiceOrdersPendingQC);
router.patch("/final-inspection/:serviceOrderId/approve", serviceQualityInspectionController.approveFinalInspection);
router.patch("/final-inspection/:serviceOrderId/reject", serviceQualityInspectionController.rejectFinalInspection);
router.get("/tasks", taskAssignmentController.getAllTasks);
router.post("/assign", taskAssignmentController.assignTask);
router.get("/assignments", taskAssignmentController.getAssignmentHistory);
router.patch("/assignments/:assignmentId", taskAssignmentController.updateAssignment);
router.get("/technicians", taskAssignmentController.getAllTechnician);
router.get("/notifications", notificationController.getNotifications);
router.get("/notifications/unread-count", notificationController.getUnreadCount);
router.put("/notifications/read-all", notificationController.markAllAsRead);
router.put("/notifications/:id/read", notificationController.markAsRead);

module.exports = router;