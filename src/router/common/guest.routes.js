const express = require("express");
const router = express.Router();
const guestController = require("../../controller/common/guest.controller.js");
const configController = require("../../controller/common/garageConfigurations.controller");
const vehicleMakeController = require("../../controller/customer/vehicleMake.controller.js");
const vehicleModelController = require("../../controller/customer/vehicleModel.controller.js");

router.get("/service-categories", guestController.getServiceCategories);
router.get("/service-catalogs", guestController.getServiceCatalog);
router.get("/service-combos", guestController.getServiceCombos);

router.post("/vehicle_make", vehicleMakeController.getVehicleMake);
router.post("/vehicle_model", vehicleModelController.getVehicleModel);

router.get("/garage-configurations", configController.getConfigurations);
router.get("/garage-configurations/:key", configController.getConfigurationByKey);

router.get("/availability", configController.getAvailability);


router.get("/check-license-plate", guestController.checkLicensePlate);

module.exports = router;
