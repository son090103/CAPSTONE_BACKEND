const db = require("../../models");

/**
 * Tạo thông báo trong Database và phát sự kiện Socket cho một role cụ thể
 * @param {string} roleCode Mã role nhận thông báo (VD: 'RECEPTIONIST')
 * @param {Object} notificationData Dữ liệu thông báo { title, content, notificationType, referenceId, priority }
 * @param {string} socketEvent Tên sự kiện socket (Mặc định: 'new_notification')
 * @param {Object} socketPayload Dữ liệu gửi qua socket
 */
const notifyRole = async (
  roleCode,
  notificationData,
  socketEvent = "new_notification",
  socketPayload = {},
) => {
  try {
    const role = await db.Role.findOne({ where: { roleCode } });
    if (role) {
      const users = await db.User.findAll({ where: { roleId: role.id } });

      const notificationsToCreate = users.map((user) => ({
        recipientId: user.id,
        title: notificationData.title,
        content: notificationData.content,
        notificationType: notificationData.notificationType,
        referenceId: notificationData.referenceId || null,
        link: notificationData.link || null,
        isRead: false,
        priority: notificationData.priority || "NORMAL",
      }));

      if (notificationsToCreate.length > 0) {
        await db.Notification.bulkCreate(notificationsToCreate);
      }
    }

    if (global._io) {
      global._io.to(`role-${roleCode}`).emit(socketEvent, socketPayload);
    }
  } catch (error) {
    console.error(`Lỗi khi tạo thông báo cho role ${roleCode}:`, error);
  }
};
const notifyUser = async (userId, notificationData, socketEvent = 'new_notification', socketPayload = {}) => {
    try {
        await db.Notification.create({
            recipientId: userId,
            title: notificationData.title,
            content: notificationData.content,
            notificationType: notificationData.notificationType,
            referenceId: notificationData.referenceId || null,
            link: notificationData.link || null,
            isRead: false,
            priority: notificationData.priority || 'NORMAL'
        });

        if (global._io) {
            global._io.to(`user-${userId}`).emit(socketEvent, socketPayload);
        }
    } catch (error) {
        console.error(`Lỗi khi tạo thông báo cho user ${userId}:`, error);
    }
};
module.exports = {
  notifyRole,notifyUser
};
