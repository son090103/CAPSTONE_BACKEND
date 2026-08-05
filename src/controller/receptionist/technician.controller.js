const technicianService = require("../../service/receptionist/technician.service");

module.exports.getTechniciansWorkingToday = async (req, res) => {
    try {
        const technicians = await technicianService.getTechniciansWorkingToday();
        res.status(200).json({ success: true, data: technicians });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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
        res.status(500).json({ success: false, message: error.message });
    }
};
