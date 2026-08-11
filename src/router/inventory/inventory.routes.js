const express = require("express");

const router = express.Router();
const upload = require("../../util/upload.util");
const uploadExcel = require("../../util/excelUpload.util");
const sparePartManagementController = require("../../controller/inventory/sparePartManagement.controller");
const sparePartCategoryManagementController = require("../../controller/inventory/sparePartCategoryManagement.controller");
const supplierManagementController = require("../../controller/inventory/supplierManagement.controller");
const importAndExportManagementController = require("../../controller/inventory/importAndExportManagement.controller");
const notificationController = require("../../controller/inventory/notification.controller");
const dashboardController = require("../../controller/inventory/dashboard.controller");

router.get("/dashboard", dashboardController.getInventoryDashboard);
router.post("/import/scan-invoice", upload.array("invoices"), importAndExportManagementController.scanInvoice);

router.get("/export-requests", importAndExportManagementController.getExportRequests);
router.post("/export-requests/approve", importAndExportManagementController.approveExportRequest);
router.post("/export-requests/reject", importAndExportManagementController.rejectExportRequest);
router.get("/export-requests/:receiptCode/receipt", importAndExportManagementController.getExportReceiptDetail);

router.get("/export", importAndExportManagementController.viewExportHistory);
router.get("/export/:receiptCode", importAndExportManagementController.viewExportDetail);

router.get("/part", sparePartManagementController.getSpareParts);
router.patch("/part/:id", sparePartManagementController.updateSparePart);

router.post("/import", importAndExportManagementController.importSparePart);
router.get("/import", importAndExportManagementController.viewImportHistory);
router.get("/import/:receiptCode", importAndExportManagementController.viewImportDetail);

router.post("/custom-part-orders/:id/confirm-arrival", importAndExportManagementController.confirmCustomPartArrival);
router.post("/custom-part-orders/:id/export", importAndExportManagementController.exportCustomPartOrder);

router.post("/restock-requests", importAndExportManagementController.createRestockRequest);
router.get("/restock-requests", importAndExportManagementController.getRestockRequests);
router.post("/restock-requests/:id/resolve", importAndExportManagementController.resolveRestockRequest);
router.get("/restock-requests/summary", importAndExportManagementController.getRestockRequestsSummary);
router.get("/restock-requests/history", importAndExportManagementController.getRestockRequestsHistory);
router.get("/restock-requests/export-excel", importAndExportManagementController.exportRestockRequestsExcel);
router.post(
  "/restock-requests/import-excel",
  uploadExcel.single("file"),
  importAndExportManagementController.previewImportRestockExcel,
);
router.post("/restock-requests/confirm-import", importAndExportManagementController.confirmRestockImport);

router.get("/part-category", sparePartCategoryManagementController.getPartCategory);
router.post("/part-category", sparePartCategoryManagementController.createPartCategory);
router.patch("/part-category/:id", sparePartCategoryManagementController.updatePartCategory);

router.get("/supplier", supplierManagementController.getSupplier);
router.post("/supplier", supplierManagementController.createSupplier);
router.patch("/supplier/:id", supplierManagementController.updateSupplier);

router.get("/inventory/waiting-stock", importAndExportManagementController.getWaitingStockItems);
router.get("/restock-suggestions", importAndExportManagementController.getRestockSuggestions);
router.post("/restock-proposals/ai-analyze", importAndExportManagementController.aiAnalyzeRestockSuggestions);
router.get("/restock-proposals", importAndExportManagementController.getRestockProposals);
router.get("/restock-proposals/:id", importAndExportManagementController.getRestockProposalDetail);

router.get("/notifications", notificationController.getNotifications);
router.get("/notifications/unread-count", notificationController.getUnreadCount);
router.put("/notifications/read-all", notificationController.markAllAsRead);
router.put("/notifications/:id/read", notificationController.markAsRead);

module.exports = router;