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
const technicalDocumentController = require("../../controller/admin/technicalDocument.controller");
const technicalDocumentUpload = require("../../util/technicalDocumentUpload.util");
const excelUpload = require("../../util/excelUpload.util");
const upload = require("../../util/upload.util");
const manageCustomer = require("./../../controller/admin/manageCustomer.controller");
const shiftController = require('../../controller/admin/shift.controller');
const statisticsController = require("../../controller/admin/statistics.controller");
const aiAnalysisHistoryController = require("../../controller/admin/aiAnalysisHistory.controller");
const garageConfigurationsController = require("../../controller/common/garageConfigurations.controller");

router.get("/role", staffController.getRoles);
router.get("/staff", staffController.getStaffList);
router.get("/staff/performance", staffController.getStaffPerformance);
router.get("/staff/:userId/feedbacks", staffController.getStaffFeedbacks);
router.post("/staff/upload-avatar", upload.single("avatar"), staffController.uploadAvatar);
router.post("/staff", staffController.createStaff);
router.put("/staff/:userId", staffController.updateStaff);

router.get("/service-categories", serviceCatalogController.getServiceCategories);
router.post("/service-catalog", serviceCatalogController.createServiceCatalog);
router.post("/service-catalog/import/preview", excelUpload.single("file"), serviceCatalogController.previewImportServiceCatalog);
router.post("/service-catalog/import/confirm", serviceCatalogController.confirmImportServiceCatalog);
router.get("/service-catalog", serviceCatalogController.getServiceCatalog);
router.get("/service-catalog/search", serviceCatalogController.searchServiceCatalog);
router.patch("/service-catalog/:id", serviceCatalogController.updateServiceCatalog);
router.patch("/service-catalog/:id/set-default-inspection", serviceCatalogController.setDefaultInspectionService);
router.get("/spare-parts", serviceCatalogController.getSparePartsForAdmin);

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

router.get("/vehicle-makes", technicalDocumentController.listVehicleMakes);
router.get("/technical-documents", technicalDocumentController.list);
router.post("/technical-document", technicalDocumentUpload.fields([{ name: "pdf_document", maxCount: 1 }]), technicalDocumentController.create);
router.delete("/technical-document/:id", technicalDocumentController.remove);
router.get("/technical-document/:id/view-url", technicalDocumentController.getViewUrl);

router.get("/customer", manageCustomer.getCustomer);
router.post("/customer/upload-avatar", upload.single("avatar"), manageCustomer.uploadAvatar);
router.post("/customer", manageCustomer.createCustomer);
router.put("/customer/:id", manageCustomer.updateCustomer);
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
router.get("/ai-analysis/history", aiAnalysisHistoryController.getHistories);
router.get("/ai-analysis/history/:id", aiAnalysisHistoryController.getHistoryById);
router.delete("/ai-analysis/history/:id", aiAnalysisHistoryController.deleteHistory);

// Cấu hình chung của garage (vd RESTOCK_DAYS dùng cho đề xuất nhập hàng thông minh)
router.put("/garage-configurations/:key", garageConfigurationsController.updateConfiguration);

module.exports = router;
