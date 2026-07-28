const express = require("express");

const router = express.Router();
const upload = require("../../util/upload.util");
const sparePartManagementController = require("../../controller/inventory/sparePartManagement.controller");
const sparePartCategoryManagementController = require("../../controller/inventory/sparePartCategoryManagement.controller");
const supplierManagementController = require("../../controller/inventory/supplierManagement.controller");
const importAndExportManagementController = require("../../controller/inventory/importAndExportManagement.controller");


router.post("/import/scan-invoice", upload.array("invoices"), importAndExportManagementController.scanInvoice);
router.get("/approved-quote", importAndExportManagementController.getApprovedQuotesWithParts);
router.post("/export/:quotationId/approve", importAndExportManagementController.approveExportByQuotation);
router.get("/export", importAndExportManagementController.viewExportHistory);
router.get("/export/:receiptCode", importAndExportManagementController.viewExportDetail);

router.get("/part", sparePartManagementController.getSpareParts);
router.patch("/part/:id", sparePartManagementController.updateSparePart);

router.post("/import", importAndExportManagementController.importSparePart);
router.get("/import", importAndExportManagementController.viewImportHistory);
router.get("/import/:receiptCode", importAndExportManagementController.viewImportDetail);
router.post("/import/order-item", importAndExportManagementController.importSparePartForOrderItem);

router.get("/part-category", sparePartCategoryManagementController.getPartCategory);
router.post("/part-category", sparePartCategoryManagementController.createPartCategory);
router.patch("/part-category/:id", sparePartCategoryManagementController.updatePartCategory);

router.get("/supplier", supplierManagementController.getSupplier);
router.post("/supplier", supplierManagementController.createSupplier);
router.patch("/supplier/:id", supplierManagementController.updateSupplier);

router.get("/inventory/waiting-stock", importAndExportManagementController.getWaitingStockItems);

module.exports = router;