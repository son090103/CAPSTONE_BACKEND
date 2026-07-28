const express = require("express");

const router = express.Router();
const upload = require("../../util/upload.util");
const profileController = require("../../controller/customer/profile.controller");
const appointmentController = require("../../controller/customer/appointment.controller");
const vehicleController = require("../../controller/customer/vehicle.controller");
const feedbackController = require("../../controller/customer/feedback.controller");
const waitingTimeController = require("../../controller/customer/waiting-time.controller");
const serviceHistoryAndTrackingController = require("../../controller/customer/serviceHistoryAndTracking.controller");

router.get("/repair-progress", serviceHistoryAndTrackingController.getRepairProgress);

router.get("/profile", profileController.getProfile);
router.put("/profile", upload.single("avatar"), profileController.updateProfile);
router.put("/change-password", profileController.changePassword);
router.patch("/location", profileController.updateLocation);

router.get("/appointment", appointmentController.getAppointment);
router.post("/appointment", appointmentController.createAppointment);
router.delete("/appointment", appointmentController.deleteAppointment);
router.put("/appointment", appointmentController.cancelAppointment);
router.post("/analyze-car-color", upload.array("images", 3), appointmentController.analyzeCarColor);

router.get("/vehicle", vehicleController.getVehicleByCustomer);

router.post("/feedback", feedbackController.submitFeedback);
router.get("/feedback", feedbackController.getMyFeedbacks);

router.get("/waiting-time", waitingTimeController.getWaitingTime)
router.get("/appointment-vehicle", appointmentController.getAppointmentVehicle);

module.exports = router;