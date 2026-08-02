const express = require("express");
const router = express.Router();
const pricingRulesController = require("../../controller/admin/pricingRules.controller");
const controllerCategory = require("../../controller/admin/serviceCategories.controller");
const serviceCatalogController = require("../../controller/admin/serviceCatalog.controller");
const serviceCombosController = require("../../controller/admin/serviceCombos.controller");
const staffController = require("../../controller/admin/manageStaff.controller");
const controllerServiceBays = require("../../controller/admin/serviceBays.controller");
const warrantyController = require("../../controller/admin/warrantyPolicies.controller");
const warrantyUpload = require("../../util/warrantyUpload.util");
const manageCustomer = require("./../../controller/admin/manageCustomer.controller");
const shiftController = require('../../controller/admin/shift.controller');
const statisticsController = require("../../controller/admin/statistics.controller");

router.get("/role", staffController.getRoles);
router.get("/staff", staffController.getStaffList);
router.post("/staff", staffController.createStaff);
router.put("/staff/:userId", staffController.updateStaff);

router.get("/service-categories", serviceCatalogController.getServiceCategories);
router.post("/service-catalog", serviceCatalogController.createServiceCatalog);
router.get("/service-catalog", serviceCatalogController.getServiceCatalog);
router.get("/service-catalog/search", serviceCatalogController.searchServiceCatalog);
router.patch("/service-catalog/:id", serviceCatalogController.updateServiceCatalog);

router.get("/service-combos", serviceCombosController.getServiceCombos);
router.get("/service-combos/search", serviceCombosController.searchServiceCombos);
router.post("/service-combos", serviceCombosController.createServiceCombo);
router.put("/service-combos/:id", serviceCombosController.updateServiceCombo);

router.get("/pricing-rules", pricingRulesController.getAllPricingRules);
router.post("/pricing-rules", pricingRulesController.createPricingRules);
router.get("/pricing-rules/:id", pricingRulesController.getPricingRuleById);
router.put("/pricing-rules/:id", pricingRulesController.updatePricingRule);
router.delete("/pricing-rules/:id", pricingRulesController.deletePricingRule);

router.get("/service-category", controllerCategory.listServiceCategories);
router.get("/service-category/search", controllerCategory.searchServiceCategories);
router.post("/service-category", controllerCategory.createServiceCategories);
router.put("/service-category/:id", controllerCategory.updateServiceCategories);
router.delete("/service-category/:id", controllerCategory.removeServiceCategories);

router.get("/service-bay", controllerServiceBays.listServiceBays);
router.post("/service-bay", controllerServiceBays.createServiceBay);
router.put("/service-bay/:id", controllerServiceBays.updateServiceBay);
router.delete("/service-bay/:id", controllerServiceBays.removeServiceBay);

router.get("/warranty-policies", warrantyController.getWarrantyPolicies);
router.post("/warranty-policy", warrantyUpload.fields([{ name: "image_cover", maxCount: 1 }, { name: "pdf_document", maxCount: 1 }]), warrantyController.createWarrantyPolicy);
router.put("/warranty-policy/:id", warrantyUpload.fields([{ name: "image_cover", maxCount: 1 }, { name: "pdf_document", maxCount: 1 }]), warrantyController.updateWarrantyPolicy);

router.get("/customer", manageCustomer.getCustomer);
router.get("/customer/:id", manageCustomer.getCustomerDetail);

// Lấy danh sách khung ca
router.get('/shift/slots', shiftController.getAllShiftSlots);
router.post('/shift/slots', shiftController.createShiftSlot);
router.put('/shift/slots/:id', shiftController.updateShiftSlot);

// Xếp ca làm việc
router.get("/shift/templates", shiftController.getShiftTemplates);
router.post("/shift/templates/assign", shiftController.assignShift);
router.post("/shift/templates/auto-generate", shiftController.autoGenerateSchedule);
router.post("/shift/templates/confirm", shiftController.confirmSchedule);

// Thống kê báo cáo doanh thu
router.get("/statistics/advanced", statisticsController.getAdvancedStats);
router.get("/statistics", statisticsController.getDashboardStats);

module.exports = router;
