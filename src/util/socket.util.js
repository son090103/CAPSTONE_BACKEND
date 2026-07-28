module.exports.emitProgress = (serviceOrderId, payload) => {
  if (!global._io || !serviceOrderId) return;
  global._io
    .to(`service-order-${serviceOrderId}`)
    .emit("progress-updated", payload);
};
