const { serviceCatalogPayloadSchema, viewServiceCatalogSchema } = require("../../validation/admin/serviceCatalog.validation")
const serviceCatalog = require("../../service/admin/serviceCatalog.service");
const manageSparePart = require("../../service/inventory/sparePartManagement.service");

module.exports.getServiceCategories = async (req, res) => {
    try {
        const result = await serviceCatalog.getServiceCategories();
        return res.status(200).json({
            data: result,
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Internal server error",
        });
    }
};

module.exports.createServiceCatalog = async (req, res) => {
    try {
        const validation = serviceCatalogPayloadSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: validation.error.issues[0]?.message || "Dữ liệu dịch vụ không hợp lệ" });
        }
        const { category_id, service_name, estimated_duration, is_active, labor_price, spare_part_id, is_default_inspection_service, requires_bay } = validation.data;
        const result = await serviceCatalog.createServiceCatalog(category_id, service_name, req.body.description, estimated_duration, is_active, labor_price, spare_part_id, is_default_inspection_service, requires_bay);
        return res.status(201).json({
            message: "Tạo mới dịch vụ thành công",
            data: result,
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Internal server error",
        });
    }
};

module.exports.previewImportServiceCatalog = async (req, res) => {
    try {
        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ message: "Vui lòng tải lên file Excel hoặc CSV" });
        }

        const result = await serviceCatalog.previewImportServiceCatalog(req.file.buffer);
        return res.status(200).json({
            message: "Đọc file thành công",
            data: result,
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Internal server error",
            errors: error.errors || [],
        });
    }
};

module.exports.confirmImportServiceCatalog = async (req, res) => {
    try {
        const { servicesList } = req.body;
        if (!servicesList || !Array.isArray(servicesList)) {
            return res.status(400).json({ message: "Dữ liệu không hợp lệ" });
        }
        
        const result = await serviceCatalog.confirmImportServiceCatalog(servicesList);
        return res.status(200).json({
            message: "Nhập danh sách dịch vụ thành công",
            data: result,
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Internal server error",
            errors: error.errors || [],
        });
    }
};

module.exports.getServiceCatalog = async (req, res) => {
    try {
        const validation = viewServiceCatalogSchema.safeParse(req.query);
        if (!validation.success) {
            return res.status(400).json({
                message: validation.error.errors[0].message || "Tham số không hợp lệ"
            });
        }
        const { q, category_id, is_active, page, limit, all } = validation.data;
        const result = await serviceCatalog.getServiceCatalog({
            q,
            category_id,
            is_active,
            page,
            limit,
            all,
        });
        return res.status(200).json({
            data: result,
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Internal server error",
        });
    }
};

module.exports.searchServiceCatalog = async (req, res) => {
    try {
        const { q, category_id, is_active } = req.query;
        const result = await serviceCatalog.getServiceCatalog({
            q,
            category_id,
            is_active,
        });
        return res.status(200).json({
            data: result,
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Internal server error",
        });
    }
};

module.exports.updateServiceCatalog = async (req, res) => {
    try {
        const { id } = req.params;
        const validation = serviceCatalogPayloadSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json({ message: validation.error.issues[0]?.message || "Dữ liệu dịch vụ không hợp lệ" });
        }
        const { category_id, service_name, estimated_duration, is_active, labor_price, spare_part_id } = validation.data;
        const result = await serviceCatalog.updateServiceCatalog(id, category_id, service_name, req.body.description, estimated_duration, is_active, labor_price, spare_part_id, req.body.is_default_inspection_service, req.body.requires_bay);
        return res.status(201).json({
            message: "Cập nhật dịch vụ thành công",
            data: result,
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Internal server error",
        });
    }
};

module.exports.setDefaultInspectionService = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await serviceCatalog.setDefaultInspectionService(id);
        return res.status(200).json({
            message: "Đã đặt làm dịch vụ kiểm tra mặc định",
            data: result,
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Internal server error",
        });
    }
};

module.exports.getSparePartsForAdmin = async (req, res) => {
    try {
        const { search, brand, category_id, minPrice, maxPrice, page, limit } = req.query;

        const parsedPage = Number(page);
        const safePage = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

        const parsedLimit = Number(limit);
        let safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1000;
        if (safeLimit > 1000) {
            safeLimit = 1000;
        }

        const result = await manageSparePart.getSpareParts({
            search,
            brand,
            category_id,
            minPrice,
            maxPrice,
            page: safePage,
            limit: safeLimit,
        });

        return res.status(200).json({
            success: true,
            message: result.data.length > 0
                ? "Retrieve spare parts for admin successfully"
                : "No spare parts found",
            data: result.data,
            pagination: result.pagination,
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            message: error.message || "Failed to retrieve spare parts for admin",
        });
    }
};