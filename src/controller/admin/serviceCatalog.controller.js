const { createServiceCatalogSchema, viewServiceCatalogSchema } = require("../../validation/admin/serviceCatalog.validation")
const serviceCatalog = require("../../service/admin/serviceCatalog.service");

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
        const { category_id, service_name, description, estimated_duration, is_active, labor_price, spare_part_id } = req.body;
        const validation = createServiceCatalogSchema.safeParse({ service_name });
        const result = await serviceCatalog.createServiceCatalog(category_id, service_name, description, estimated_duration, is_active, labor_price, spare_part_id);
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
        const { category_id, service_name, description, estimated_duration, is_active, labor_price, spare_part_id } = req.body;
        const validation = createServiceCatalogSchema.safeParse({ service_name });
        const result = await serviceCatalog.updateServiceCatalog(id, category_id, service_name, description, estimated_duration, is_active, labor_price, spare_part_id);
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