const notificationService = require("../../service/receptionist/notification.service");

module.exports.getNotification = async (req, res) => {
    try {
        const receptionistId = res.locals.user.id;
        const result = await notificationService.getNotifications(receptionistId);
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error in getNotification:", error);
        return res.status(error.status || 500).json({
            message: error.message || "Đã xảy ra lỗi khi lấy danh sách thông báo"
        });
    }
};

module.exports.getNotificationById = async (req, res) => {
    try {
        const id = req.params.id;
        const receptionistId = res.locals.user.id;
        const result = await notificationService.getNotificationById(id, receptionistId);
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error in getNotificationById:", error);
        return res.status(error.status || 500).json({
            message: error.message || "Đã xảy ra lỗi khi lấy thông báo"
        });
    }
};

module.exports.markAsRead = async (req, res) => {
    try {
        const id = req.params.id;
        const receptionistId = res.locals.user.id;
        const result = await notificationService.markAsRead(id, receptionistId);
        return res.status(200).json({
            success: true,
            message: "Đã đánh dấu đọc",
            data: result
        });
    } catch (error) {
        console.error("Error in markAsRead:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Đã xảy ra lỗi khi cập nhật thông báo"
        });
    }
};

module.exports.getUnreadCount = async (req, res) => {
    try {
        const receptionistId = res.locals.user.id;
        const count = await notificationService.getUnreadCount(receptionistId);
        return res.status(200).json({ count });
    } catch (error) {
        console.error("Error in getUnreadCount:", error);
        return res.status(error.status || 500).json({
            message: error.message || "Đã xảy ra lỗi khi đếm số lượng thông báo chưa đọc"
        });
    }
};
