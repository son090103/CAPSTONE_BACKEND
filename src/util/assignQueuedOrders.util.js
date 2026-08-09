const db = require('../../models');
const { Op } = require('sequelize');
const { notifyUser } = require('./notification.util');
const { calculateAppointmentTime } = require('./calculateAppointmentTime.util');

const RESERVED_APPOINTMENT_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'Technicaian_recieved',
  'TECHNICIAN_RECEIVED',
  'INFORMATION_RECIEVED',
  'INFORMATION_RECEIVED',
];

// Số cầu lớn nhất phải giữ cho các lịch đặt trước chưa tạo Service Order trong
// khoảng thời gian một xe walk-in dự kiến sử dụng cầu.
const getReservedBayPeak = async (windowStart, windowEnd, transaction) => {
  const reservedAppointments = await db.Appointments.findAll({
    where: {
      scheduled_time: { [Op.ne]: null, [Op.lt]: windowEnd },
      status: { [Op.in]: RESERVED_APPOINTMENT_STATUSES },
    },
    include: [
      {
        model: db.Appointment_Details,
        as: 'appointmentDetails',
        attributes: ['catalog_id', 'combo_id'],
      },
      {
        model: db.Service_Orders,
        as: 'serviceOrder',
        attributes: ['id'],
        required: false,
      },
    ],
    transaction,
  });

  const events = [];
  for (const appointment of reservedAppointments) {
    if (appointment.serviceOrder || appointment.booking_type?.includes('WALK')) continue;

    const startTime = new Date(appointment.scheduled_time);
    const calculated = await calculateAppointmentTime(appointment.appointmentDetails, startTime);
    const calculatedEnd = calculated.endTime > startTime
      ? calculated.endTime
      : new Date(startTime.getTime() + 60 * 60 * 1000);

    const overlapStart = startTime > windowStart ? startTime : windowStart;
    const overlapEnd = calculatedEnd < windowEnd ? calculatedEnd : windowEnd;
    if (overlapStart >= overlapEnd) continue;

    events.push({ time: overlapStart.getTime(), delta: 1 });
    events.push({ time: overlapEnd.getTime(), delta: -1 });
  }

  events.sort((a, b) => a.time - b.time || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    peak = Math.max(peak, current);
  }
  return peak;
};

// Sau khi 1 cầu nâng vừa được giải phóng (Service_Order chuyển hẳn sang trạng thái không còn
// chiếm bay nữa — tức allTasksFinished đã đúng ở nơi gọi), tự động quét hàng đợi
// (bay_status = 'WAITING'). Lịch đặt trước luôn được ưu tiên hơn khách vãng lai; trong cùng
// một nhóm mới xét thời gian hẹn/thời gian tiếp nhận, rồi gán cầu nâng + KTV,
// chừng nào còn cầu nâng trống, còn đơn đang chờ, và còn KTV active để gán.
const assignQueuedOrders = async (transaction) => {
  const assignedOrders = [];

  while (true) {
    const freeBay = await db.Service_Bays.findOne({
      where: { is_active: true, status: 'available' },
      order: [['id', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE,
      skipLocked: true,
    });
    if (!freeBay) break;

    const waitingOrders = await db.Service_Orders.findAll({
      where: { bay_status: 'WAITING' },
      include: [{
        model: db.Appointments,
        as: 'appointment',
        attributes: ['id', 'booking_type', 'priority_type', 'scheduled_time', 'created_at'],
        required: false,
      }],
      order: [['createdAt', 'ASC']],
      transaction,
    });
    waitingOrders.sort((a, b) => {
      const appointmentA = a.appointment;
      const appointmentB = b.appointment;
      const emergencyA = appointmentA?.priority_type === 'EMERGENCY';
      const emergencyB = appointmentB?.priority_type === 'EMERGENCY';
      if (emergencyA !== emergencyB) return emergencyA ? -1 : 1;

      const walkInA = appointmentA?.booking_type?.includes('WALK') ?? true;
      const walkInB = appointmentB?.booking_type?.includes('WALK') ?? true;
      if (walkInA !== walkInB) return walkInA ? 1 : -1;

      const timeA = appointmentA?.scheduled_time || appointmentA?.created_at || a.createdAt;
      const timeB = appointmentB?.scheduled_time || appointmentB?.created_at || b.createdAt;
      return new Date(timeA).getTime() - new Date(timeB).getTime();
    });
    const nextOrder = waitingOrders[0];
    if (!nextOrder) break;

    const isWalkIn = nextOrder.appointment?.booking_type?.includes('WALK') ?? true;
    if (isWalkIn) {
      const now = new Date();
      const storedEstimatedFinish = nextOrder.estimated_finish_time
        ? new Date(nextOrder.estimated_finish_time)
        : null;
      const minimumReservationHorizon = new Date(now.getTime() + 60 * 60 * 1000);
      const estimatedFinish = storedEstimatedFinish && storedEstimatedFinish > minimumReservationHorizon
        ? storedEstimatedFinish
        : minimumReservationHorizon;
      const freeBayCount = await db.Service_Bays.count({
        where: { is_active: true, status: 'available' },
        transaction,
      });
      const reservedBayPeak = await getReservedBayPeak(now, estimatedFinish, transaction);

      // Không dùng phần cầu đã được lịch đặt trước giữ chỗ; walk-in tiếp tục WAITING.
      if (freeBayCount <= reservedBayPeak) break;
    }

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

    const [claimedBayCount] = await db.Service_Bays.update(
      { status: 'in_use', current_service_order_id: nextOrder.id },
      { where: { id: freeBay.id, status: 'available' }, transaction },
    );
    if (claimedBayCount === 0) continue;
    await nextOrder.update({ bay_id: freeBay.id, bay_status: 'ASSIGNED' }, { transaction });

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
