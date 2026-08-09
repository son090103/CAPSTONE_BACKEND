const serviceOrderService = require("../../service/receptionist/serviceOrder.service");
const { createServiceOrderSchema } = require("../../validation/receptionist/serviceOrder.validation");
const { notifyRole } = require("../../util/notification.util");

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

        // Khách đến trực tiếp không có appointment trước đó: báo realtime sau khi tạo phiếu.
        // Lịch hẹn có sẵn đã được báo ở endpoint /appointment/:key/receive để tránh phát hai lần.
        if (!parsedBody.data.appointment_id) await notifyRole(
            "TECHNICIAN_LEADER",
            {
                title: "Có khách hàng vừa được tiếp nhận",
                content: `Lễ tân vừa tạo phiếu tiếp nhận SO-${result.id}. Vui lòng kiểm tra và phân công.`,
                notificationType: "SERVICE_ORDER",
                referenceId: result.id,
                link: "/leader/appointments",
                priority: "HIGH"
            },
            "new_notification",
            {
                type: "CUSTOMER_RECEIVED",
                serviceOrderId: result.id,
                message: `Có khách hàng mới vừa được lễ tân tiếp nhận (SO-${result.id}).`
            }
        );
        if (!parsedBody.data.appointment_id && global._io) {
            global._io.emit("customer_received", {
                type: "CUSTOMER_RECEIVED",
                serviceOrderId: result.id,
                message: `Có khách hàng mới vừa được lễ tân tiếp nhận (SO-${result.id}).`
            });
        }

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

module.exports.getServiceOrdersAwaitingPayment = async (req, res) => {
    try {
        const result = await serviceOrderService.getServiceOrdersAwaitingPayment();

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
        const { current_odo, symptoms } = req.body;

        if (current_odo === undefined || current_odo === null) {
            return res.status(400).json({
                success: false,
                message: "Thiếu thông tin số ODO (current_odo)"
            });
        }

        const result = await serviceOrderService.updateServiceOrderOdo(id, current_odo, symptoms);
        
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

module.exports.closeServiceOrderEarly = async (req, res) => {
    try {
        const { id } = req.params;
        const receptionistId = res.locals.user.id;
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
            receptionistId
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
