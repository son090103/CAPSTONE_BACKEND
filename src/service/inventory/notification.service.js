const db = require("../../../models");

module.exports.getNotifications = async (inventoryManagerId) => {
    const notifications = await db.Notification.findAll({
        where: { recipientId: inventoryManagerId },
        order: [['createdAt', 'DESC']]
    });
    return notifications;
};

module.exports.markAsRead = async (id, inventoryManagerId) => {
    const notification = await db.Notification.findOne({
        where: { id, recipientId: inventoryManagerId }
    });
    if (!notification) {
        throw { status: 404, message: "Thông báo không tồn tại hoặc không thuộc về bạn" };
    }

    notification.isRead = true;
    await notification.save();
    return notification;
};

module.exports.markAllAsRead = async (inventoryManagerId) => {
    await db.Notification.update(
        { isRead: true },
        { where: { recipientId: inventoryManagerId, isRead: false } }
    );
    return { success: true };
};

module.exports.getUnreadCount = async (inventoryManagerId) => {
    const count = await db.Notification.count({
        where: {
            recipientId: inventoryManagerId,
            isRead: false
        }
    });
    return count;
};
