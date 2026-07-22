const express = require("express");

const router = express.Router();
const taskAssignment = require("./../../controller/technician/taskAssignment.controller");
const notificationController = require("./../../controller/technician/notification.controller");
const techShiftController = require("./../../controller/technician/shift.controller")


router.get("/issues", taskAssignment.getIssuesReportHistory);
router.post("/issues", taskAssignment.createIssuesReport);
router.get("/component", taskAssignment.getAllComponents);
router.get("/task-assignments", taskAssignment.getTaskAssignment);
router.get("/service-orders/:id", taskAssignment.getServiceOrderDetail);
router.put("/task-assignments/start", taskAssignment.startTask);
router.patch("/task-assignments/complete", taskAssignment.completeTask);

router.get("/notifications", notificationController.getNotifications);
router.get("/notifications/unread-count", notificationController.getUnreadCount);
router.put("/notifications/read-all", notificationController.markAllAsRead);
router.put("/notifications/:id/read", notificationController.markAsRead);

//shift-slot 
router.get("/shifts", techShiftController.getMyShifts);
// API nhận và bắt đầu cứu hộ
router.patch("/rescue/start", taskAssignment.startRescueTask);
router.get("/rescue/my-active", taskAssignment.getMyActiveRescue);
module.exports = router;