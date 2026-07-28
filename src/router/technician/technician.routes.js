const express = require("express");

const router = express.Router();
const taskAssignment = require("./../../controller/technician/taskAssignment.controller");
const notificationController = require("./../../controller/technician/notification.controller");
const techShiftController = require("./../../controller/technician/shift.controller")

router.get("/vehicle-makes", taskAssignment.getMakes);
router.get("/vehicle-models", taskAssignment.getModels);

router.get("/issues", taskAssignment.getIssuesReportHistory);
router.post("/issues", taskAssignment.createIssuesReport);
router.post("/issues/additional", taskAssignment.reportAdditionalIssue);
router.get("/component", taskAssignment.getAllComponents);

router.get("/task-assignments", taskAssignment.getTaskAssignment);
router.get("/service-orders/:id", taskAssignment.getServiceOrderDetail);
router.put("/task-assignments/start", taskAssignment.startTask);
router.patch("/task-assignments/complete", taskAssignment.completeTask);
router.put("/task-assignments/pause", taskAssignment.pauseTask);
router.put("/task-assignments/resume", taskAssignment.resumeTask);

router.get("/diagnostics", taskAssignment.getAllDiagnostics);
router.get("/diagnostics/search", taskAssignment.searchDiagnostics);
router.get("/diagnostics/filter", taskAssignment.filterDiagnostics);
router.post("/diagnostics/ai-suggest", taskAssignment.aiSuggestCauses);

router.get("/repair-history", taskAssignment.getRepairHistory);
router.get("/repair-history/search", taskAssignment.searchRepairHistory);
router.get("/repair-history/filter", taskAssignment.filterRepairHistory);

router.get("/inspection-history", taskAssignment.getAllInspectionHistory);
router.get("/inspection-history/search", taskAssignment.searchInspectionHistory);
router.get("/inspection-history/filter", taskAssignment.filterInspectionHistory);

router.get("/completed-tasks", taskAssignment.getMyCompletedTasks);

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