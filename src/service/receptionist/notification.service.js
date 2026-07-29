const db = require("../../../models");

module.exports.getNotifications = async (receptionistId) => {
    const notifications = await db.Notification.findAll({
        where: { recipientId: receptionistId },
        order: [['createdAt', 'DESC']]
    });

    return notifications;
};

module.exports.getNotificationById = async (id, receptionistId) => {
    const notification = await db.Notification.findOne({
        where: { id, recipientId: receptionistId }
    });

    if (!notification) {
        throw { status: 404, message: "Thông báo không tồn tại hoặc không thuộc về bạn" };
    }

    return notification;
};

module.exports.markAsRead = async (id, receptionistId) => {
    const notification = await db.Notification.findOne({
        where: { id, recipientId: receptionistId }
    });
    if (!notification) {
        throw { status: 404, message: "Thông báo không tồn tại hoặc không thuộc về bạn" };
    }

    notification.isRead = true;
    await notification.save();
    return notification;
};

module.exports.getUnreadCount = async (receptionistId) => {
    const count = await db.Notification.count({
        where: {
            recipientId: receptionistId,
            isRead: false
        }
    });
    return count;
};
