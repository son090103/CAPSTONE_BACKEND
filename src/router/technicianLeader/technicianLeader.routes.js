const express = require("express");
const taskAssignmentController = require("../../controller/technicianLeader/taskAssignmentManagement.controller")
const router = express.Router();
const serviceQualityInspectionController = require("../../controller/technicianLeader/serviceQualityInspection.controller");

router.get("/quality-inspection", serviceQualityInspectionController.getServiceOrdersPendingQC);
router.patch("/final-inspection/:serviceOrderId/approve", serviceQualityInspectionController.approveFinalInspection);
router.patch("/final-inspection/:serviceOrderId/reject", serviceQualityInspectionController.rejectFinalInspection);
router.get("/tasks", taskAssignmentController.getAllTasks);
router.post("/assign", taskAssignmentController.assignTask);
router.get("/assignments", taskAssignmentController.getAssignmentHistory);
router.patch("/assignments/:assignmentId", taskAssignmentController.updateAssignment);
router.get("/technicians", taskAssignmentController.getAllTechnician);

module.exports = router;