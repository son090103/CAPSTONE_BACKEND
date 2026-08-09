const appointmentService = require("../../service/technicianLeader/appointment.service");

module.exports.getReceivedAppointments = async (req, res) => {
    try {
        const requestUser = res.locals.user;
        if (!requestUser) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const result = await appointmentService.getReceivedAppointments();
        return res.status(200).json({
            success: true,
            message: "Lấy danh sách lịch hẹn đã tiếp nhận thành công",
            data: result
        });
    } catch (error) {
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Internal server error"
        });
    }
};
