const notificationService = require("../../service/customer/notification.service");

module.exports.getNotifications = async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const result = await notificationService.getNotifications(userId);
        return res.status(200).json(result);
    } catch (error) {
        console.error("Error in getNotifications:", error);
        return res.status(error.status || 500).json({
            message: error.message || "Đã xảy ra lỗi khi lấy danh sách thông báo"
        });
    }
};

module.exports.markAsRead = async (req, res) => {
    try {
        const id = req.params.id;
        const userId = res.locals.user.id;
        const result = await notificationService.markAsRead(id, userId);
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

module.exports.markAllAsRead = async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const result = await notificationService.markAllAsRead(userId);
        return res.status(200).json({
            success: true,
            message: "Đã đánh dấu đọc tất cả",
            data: result
        });
    } catch (error) {
        console.error("Error in markAllAsRead:", error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.message || "Đã xảy ra lỗi khi cập nhật thông báo"
        });
    }
};

module.exports.getUnreadCount = async (req, res) => {
    try {
        const userId = res.locals.user.id;
        const count = await notificationService.getUnreadCount(userId);
        return res.status(200).json({ count });
    } catch (error) {
        console.error("Error in getUnreadCount:", error);
        return res.status(error.status || 500).json({
            message: error.message || "Đã xảy ra lỗi khi đếm số lượng thông báo chưa đọc"
        });
    }
};
