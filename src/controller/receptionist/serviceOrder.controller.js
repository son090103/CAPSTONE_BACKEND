const serviceOrderService = require("../../service/receptionist/serviceOrder.service");
const { createServiceOrderSchema } = require("../../validation/receptionist/serviceOrder.validation");

module.exports.createServiceOrder = async (req, res) => {
    try {
        const receptionistId = res.locals.user.id;

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
        const result = await serviceOrderService.createServiceOrder(parsedBody.data, receptionistId);

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

module.exports.getServiceOrders = async (req, res) => {
    try {
        const result = await serviceOrderService.getServiceOrders();
        
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

module.exports.updateServiceOrderOdo = async (req, res) => {
    try {
        const { id } = req.params;
        const { current_odo } = req.body;

        if (current_odo === undefined || current_odo === null) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin số ODO (current_odo)"
            });
        }

        const result = await serviceOrderService.updateServiceOrderOdo(id, current_odo);
        
        return res.status(200).json({
            success: true,
            message: "Cập nhật số km tiếp nhận thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.getCompleteServiceOrder = async (req,res) => {
    try {
        const result = await serviceOrderService.getCompleteServiceOrder();
        return res.status(200).json({success: true, data: result});
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
}