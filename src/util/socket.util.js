module.exports.emitProgress = (serviceOrderId, payload) => {
  if (!global._io || !serviceOrderId) return;
  global._io
    .to(`service-order-${serviceOrderId}`)
    .emit("progress-updated", payload);
};

// Gửi socket event tới đúng 1 user (room "user-{id}", cùng cơ chế notifyUser dùng)
module.exports.emitToUser = (userId, event, payload) => {
  if (!global._io || !userId) return;
  global._io.to(`user-${userId}`).emit(event, payload);
};

// Gửi socket event tới toàn bộ user thuộc 1 role (room "role-{roleCode}", cùng cơ chế notifyRole dùng)
module.exports.emitToRole = (roleCode, event, payload) => {
  if (!global._io || !roleCode) return;
  global._io.to(`role-${roleCode}`).emit(event, payload);
};
