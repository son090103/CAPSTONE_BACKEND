const technicianService = require("../../service/receptionist/technician.service");

module.exports.getTechniciansWorkingToday = async (req, res) => {
    try {
        const technicians = await technicianService.getTechniciansWorkingToday();
        res.status(200).json({ success: true, data: technicians });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};
module.exports.assignRescueTechnician = async (req, res) => {
    try {
        const { customerId, technicianId, customerLat, customerLng } = req.body;
        if (!customerId || !technicianId) {
            return res.status(400).json({ success: false, message: "Thiếu customerId hoặc technicianId" });
        }
        
        const rescue = await technicianService.assignRescueTechnician(customerId, technicianId, customerLat, customerLng);
        res.status(200).json({ success: true, data: rescue, message: "Phân công kỹ thuật viên thành công" });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};
module.exports.createRescueRequest = async (req, res) => {
    try {
        const rescue = await technicianService.createRescueRequest(req.body);
        res.status(201).json({ success: true, data: rescue, message: "Tạo yêu cầu cứu hộ thành công" });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};
module.exports.cancelRescueRequest = async (req, res) => {
    try {
        const { rescueId } = req.params;
        const { cancel_reason } = req.body;
        const rescue = await technicianService.cancelRescueRequest(rescueId, cancel_reason);
        res.status(200).json({ success: true, data: rescue, message: "Đã hủy yêu cầu cứu hộ" });
    } catch (error) {
        res.status(error.status || 500).json({ success: false, message: error.message });
    }
};
