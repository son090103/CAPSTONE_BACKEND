'use strict';

/** Seed các tình huống cảnh báo cho trang AI, không xóa dữ liệu cũ. */
const db = require('../models');
const MARKER = '[AI-RISK-DEMO]';
const scenarios = [
  { orderStatus: 'INSPECTING', taskStatus: 'PENDING', serviceId: 25, payment: 'PENDING', assigned: false },
  { orderStatus: 'PENDING_QUOTATION', taskStatus: 'PENDING', serviceId: 15, payment: 'PENDING', assigned: false },
  { orderStatus: 'INSPECTING', taskStatus: 'PENDING', serviceId: 19, payment: 'PENDING', assigned: false },
  { orderStatus: 'WAITING_FOR_PARTS', taskStatus: 'WAITING_STOCK', serviceId: 15, payment: 'DEPOSITED', assigned: true },
  { orderStatus: 'WAITING_FOR_PARTS', taskStatus: 'WAITING_STOCK', serviceId: 28, payment: 'DEPOSITED', assigned: true },
  { orderStatus: 'IN_PROGRESS', taskStatus: 'IN_PROGRESS', serviceId: 24, payment: 'PENDING', assigned: true },
];

async function main() {
  if (!process.argv.includes('--confirm')) throw new Error('Thiếu --confirm.');
  const existing = await db.Appointments.count({ where: { notes: { [db.Sequelize.Op.like]: `${MARKER}%` } } });
  if (existing) return console.log(`${MARKER} Đã tồn tại ${existing} tình huống, không seed trùng.`);

  const receptionist = await db.User.findOne({ where: { roleId: 2 } });
  const technician = await db.User.findOne({ where: { roleId: 4 }, order: [['id', 'ASC']] });
  const vehicles = await db.Vehicles.findAll({ limit: scenarios.length, order: [['id', 'DESC']] });
  if (!receptionist || !technician || vehicles.length < scenarios.length) throw new Error('Thiếu nhân sự hoặc xe nền.');

  await db.sequelize.transaction(async transaction => {
    for (let index = 0; index < scenarios.length; index += 1) {
      const scenario = scenarios[index];
      const vehicle = vehicles[index];
      const customer = await db.Customers.findByPk(vehicle.customer_id, { transaction });
      const service = await db.Service_Catalog.findByPk(scenario.serviceId, { transaction });
      const date = new Date(`2026-08-${String(12 - index).padStart(2, '0')}T09:00:00+07:00`);
      const appointment = await db.Appointments.create({ customer_id: customer.id, vehicle_id: vehicle.id, booking_type: 'REPAIR', scheduled_time: date, notes: `${MARKER} ${scenario.orderStatus}`, reception_condition: `${MARKER} Chờ xử lý`, status: 'IN_PROGRESS', priority_type: index < 2 ? 'URGENT' : 'NORMAL', created_at: date, updatedAt: date }, { transaction });
      await db.Appointment_Details.create({ appointment_id: appointment.id, catalog_id: scenario.serviceId, createdAt: date, updatedAt: date }, { transaction });
      const order = await db.Service_Orders.create({ appointment_id: appointment.id, vehicle_id: vehicle.id, receptionist_id: receptionist.id, bay_id: null, bay_status: scenario.orderStatus === 'IN_PROGRESS' ? 'ASSIGNED' : 'WAITING', status: scenario.orderStatus, symptoms: `${MARKER} ${service.service_name}`, entry_time: date, estimated_finish_time: new Date(date.getTime() + 86400000), promised_finish_time: new Date(date.getTime() + 86400000), current_odo: 50000 + index * 1000, createdAt: date, updatedAt: date }, { transaction });
      const task = await db.Task.create({ service_order_id: order.id, service_catalog_id: scenario.serviceId, type: 'REPAIR', status: scenario.taskStatus, createdAt: date, updatedAt: date }, { transaction });
      if (scenario.assigned) await db.Task_Assignment.create({ task_id: task.id, technician_id: technician.id, role_in_task: 'LEAD', contribution_percent: 100, actual_start_time: date, status: scenario.taskStatus === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'ASSIGNED', remarks: MARKER, createdAt: date, updatedAt: date }, { transaction });
      await db.Booking_Payments.create({ order_id: order.id, payment_method: 'BANK_TRANSFER', payment_gateway: 'BANK', amount: scenario.payment === 'DEPOSITED' ? 300000 : Number(service.labor_price || 200000), currency: 'VND', payment_status: scenario.payment, transaction_code: `AI-RISK-${index + 1}`, paid_at: null, created_at: date, updated_at: date }, { transaction });
    }

    // Hạ tồn hai phụ tùng đã có tốc độ sử dụng cao để kiểm thử cảnh báo thiếu kho.
    await db.Spare_Parts.update({ stock_quantity: 4 }, { where: { id: 2 }, transaction });
    await db.Spare_Parts.update({ stock_quantity: 2 }, { where: { id: 5 }, transaction });
  });
  console.log(`${MARKER} Đã thêm 3 task chưa phân công, 2 task chờ linh kiện, 3 task dồn cho một kỹ thuật viên và hạ tồn hai phụ tùng.`);
}

main().then(() => db.sequelize.close()).catch(async error => { console.error(error); try { await db.sequelize.close(); } catch {} process.exit(1); });
