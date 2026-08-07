const db = require('../../models');
const { Op } = require('sequelize');
const { notifyUser } = require('./notification.util');

// Sau khi 1 cầu nâng vừa được giải phóng (Service_Order chuyển hẳn sang trạng thái không còn
// chiếm bay nữa — tức allTasksFinished đã đúng ở nơi gọi), tự động quét hàng đợi
// (bay_status = 'WAITING', ưu tiên đơn tiếp nhận trước) và gán ngay cầu nâng + KTV cho từng đơn,
// chừng nào còn cầu nâng trống, còn đơn đang chờ, và còn KTV active để gán.
const assignQueuedOrders = async (transaction) => {
  const assignedOrders = [];

  while (true) {
    const freeBay = await db.Service_Bays.findOne({
      where: { is_active: true, status: 'available' },
      order: [['id', 'ASC']],
      transaction,
    });
    if (!freeBay) break;

    const nextOrder = await db.Service_Orders.findOne({
      where: { bay_status: 'WAITING' },
      order: [['createdAt', 'ASC']],
      transaction,
    });
    if (!nextOrder) break;

    const techRole = await db.Role.findOne({ where: { roleCode: 'TECHNICIAN' }, transaction });
    let technicianId = null;
    if (techRole) {
      const technicians = await db.User.findAll({
        where: { roleId: techRole.id, status: 'ACTIVE' },
        transaction,
      });
      if (technicians.length > 0) {
        const technicianTasksCount = await Promise.all(
          technicians.map(async (tech) => {
            const count = await db.Task_Assignment.count({
              where: { technician_id: tech.id, status: { [Op.in]: ['ASSIGNED', 'IN_PROGRESS'] } },
              transaction,
            });
            return { id: tech.id, count };
          }),
        );
        technicianTasksCount.sort((a, b) => a.count - b.count);
        technicianId = technicianTasksCount[0].id;
      }
    }
    // Không còn KTV active nào — dừng vòng lặp, đơn vẫn ở WAITING chờ lần giải phóng bay kế tiếp
    if (!technicianId) break;

    await nextOrder.update({ bay_id: freeBay.id, bay_status: 'ASSIGNED' }, { transaction });
    await db.Service_Bays.update(
      { status: 'in_use', current_service_order_id: nextOrder.id },
      { where: { id: freeBay.id }, transaction },
    );

    const tasks = await db.Task.findAll({ where: { service_order_id: nextOrder.id }, transaction });
    for (const task of tasks) {
      const existingAssignment = await db.Task_Assignment.findOne({ where: { task_id: task.id }, transaction });
      if (existingAssignment) continue;
      await db.Task_Assignment.create(
        {
          task_id: task.id,
          technician_id: technicianId,
          bay_id: freeBay.id,
          role_in_task: 'LEAD',
          contribution_percent: 100,
          status: 'ASSIGNED',
        },
        { transaction },
      );
    }

    assignedOrders.push({ orderId: nextOrder.id, technicianId });
  }

  for (const { orderId, technicianId } of assignedOrders) {
    await notifyUser(technicianId, {
      title: 'Bạn được giao công việc mới',
      content: 'Bạn vừa được hệ thống tự động phân công tiếp nhận một xe đang chờ cầu nâng.',
      notificationType: 'SERVICE_ORDER',
      referenceId: orderId,
    }, 'new_notification', {
      type: 'TASK_ASSIGNED',
      serviceOrderId: orderId,
    });
  }
};

module.exports = assignQueuedOrders;
