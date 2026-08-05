const db = require("../../../models");

module.exports.getNotifications = async (leaderId) => {
    const notifications = await db.Notification.findAll({
        where: { recipientId: leaderId },
        order: [['createdAt', 'DESC']]
    });
    return notifications;
};

module.exports.markAsRead = async (id, leaderId) => {
    const notification = await db.Notification.findOne({
        where: { id, recipientId: leaderId }
    });
    if (!notification) {
        throw { status: 404, message: "Thông báo không tồn tại hoặc không thuộc về bạn" };
    }

    notification.isRead = true;
    await notification.save();
    return notification;
};

module.exports.markAllAsRead = async (leaderId) => {
    await db.Notification.update(
        { isRead: true },
        { where: { recipientId: leaderId, isRead: false } }
    );
    return { success: true };
};

module.exports.getUnreadCount = async (leaderId) => {
    const count = await db.Notification.count({
        where: {
            recipientId: leaderId,
            isRead: false
        }
    });
    return count;
};
