const appointmentService = require("../../service/receptionist/appointment.service");
const { receiveAppointmentSchema, updateVehicleVinSchema } = require("../../validation/receptionist/appointment.validation");

module.exports.getAppointment = async (req, res) => {
    try {
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const result = await appointmentService.getAppointment();
        return res.status(200).json({
            success: true,
            message: "Lấy danh sách tất cả lịch hẹn thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.getCustomer = async (req, res) => {
    try {
        const { search } = req.query;
        const result = await appointmentService.getCustomer(search);
        
        return res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Lỗi Server", error: error.message });
    }
};

module.exports.getAppointmentByKey = async (req, res) => {
    try {
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { key } = req.params;
        const result = await appointmentService.getAppointmentByKey(key);
        return res.status(200).json({
            success: true,
            message: "Lấy chi tiết lịch hẹn thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.receiveAppointment = async (req, res) => {
    try {
        console.log("chạy vào tiêp nhận xe")
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { key } = req.params;
        const validation = receiveAppointmentSchema.safeParse({ key });
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                message: validation.error.issues[0].message
            });
        }

        const result = await appointmentService.receiveAppointment(key);
        return res.status(200).json({
            success: true,
            message: "Tiếp nhận lịch hẹn thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.updateVehicleVin = async (req, res) => {
    try {
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { key } = req.params;
        const { vin_number } = req.body;

        const validation = updateVehicleVinSchema.safeParse({ key, vin_number });
        if (!validation.success) {
            return res.status(400).json({
                success: false,
                message: validation.error.issues[0].message
            });
        }

        const result = await appointmentService.updateVehicleVin(key, vin_number);
        return res.status(200).json({
            success: true,
            message: "Cập nhật số khung thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

module.exports.checkVehicleInfo = async (req, res) => {
    try {
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { key } = req.params;
        const result = await appointmentService.checkVehicleInfo(key);
        return res.status(200).json({
            success: true,
            message: "Kiểm tra thông tin xe thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};

