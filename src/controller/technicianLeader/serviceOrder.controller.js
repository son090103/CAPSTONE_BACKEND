const serviceOrderService = require("../../service/receptionist/serviceOrder.service");
const { createServiceOrderSchema } = require("../../validation/receptionist/serviceOrder.validation");

module.exports.createServiceOrder = async (req, res) => {
    try {
        const leaderId = res.locals.user.id;

        // 1. Validate payload
        const parsedBody = createServiceOrderSchema.safeParse(req.body);
        if (!parsedBody.success) {
            return res.status(400).json({
                success: false,
                message: "Dữ liệu không hợp lệ",
                errors: parsedBody.error.format()
            });
        }

        // 2. Call service
        const result = await serviceOrderService.createServiceOrder(parsedBody.data, leaderId);

        // 3. Return response
        return res.status(201).json({
            success: true,
            message: "Tạo lệnh sửa chữa thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.getServiceOrderById = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await serviceOrderService.getServiceOrderById(id);
        
        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.closeServiceOrderEarly = async (req, res) => {
    try {
        const { id } = req.params;
        const leaderId = res.locals.user.id;
        const { completedQuotationItemIds, reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: "Vui lòng nhập lý do đóng sớm lệnh sửa chữa"
            });
        }

        const result = await serviceOrderService.closeServiceOrderEarly(
            id,
            completedQuotationItemIds,
            reason.trim(),
            leaderId
        );

        return res.status(200).json({
            success: true,
            message: "Đóng sớm lệnh sửa chữa thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};
