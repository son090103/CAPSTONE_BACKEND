'use strict';

/**
 * Bổ sung dữ liệu để thử nghiệm AI trong 30 ngày gần nhất và 30 ngày đối chiếu.
 * Không tạo bảng/cột và không xóa dữ liệu đang có.
 * Chạy: node scripts/seed_ai_analysis_30_days.js --confirm
 */
const db = require('../models');

const MARKER = '[AI-ANALYSIS-30D]';
const plans = [
  { serviceId: 25, partId: 2, labor: 180000, partPrice: 650000, partQty: 4 },
  { serviceId: 15, partId: 5, labor: 280000, partPrice: 1200000, partQty: 1 },
  { serviceId: 19, partId: 3, labor: 180000, partPrice: 1850000, partQty: 1 },
  { serviceId: 28, partId: 9, labor: 350000, partPrice: 420000, partQty: 1 },
  { serviceId: 24, partId: 10, labor: 320000, partPrice: 780000, partQty: 1 },
];

const atOffset = (daysAgo, hour = 8) => {
  const date = new Date('2026-08-12T00:00:00+07:00');
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date;
};

async function main() {
  if (!process.argv.includes('--confirm')) throw new Error('Thiếu --confirm.');
  const existing = await db.Appointments.count({ where: { notes: { [db.Sequelize.Op.like]: `${MARKER}%` } } });
  if (existing > 0) {
    console.log(`${MARKER} Đã tồn tại ${existing} lịch hẹn, không seed trùng.`);
    return;
  }

  const receptionist = await db.User.findOne({ where: { roleId: 2 } });
  const technician = await db.User.findOne({ where: { roleId: 4 } });
  const leader = await db.User.findOne({ where: { roleId: 3 } });
  const inventoryManager = await db.User.findOne({ where: { roleId: 6 } });
  const vehicles = await db.Vehicles.findAll({ limit: 20, order: [['id', 'ASC']] });
  if (!receptionist || !technician || !leader || !inventoryManager || vehicles.length < 10) {
    throw new Error('Thiếu nhân sự nền hoặc cần ít nhất 10 xe.');
  }

  // Kỳ hiện tại có 24 đơn hoàn thành. Dịch vụ phanh và điều hòa xuất hiện nhiều
  // hơn về cuối kỳ để AI nhìn thấy xu hướng vận hành.
  const currentOffsets = [29, 27, 25, 23, 21, 19, 17, 15, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 2, 1, 1, 0];
  const currentPlanIndexes = [0, 4, 2, 0, 3, 1, 0, 4, 3, 1, 0, 3, 1, 3, 1, 0, 1, 3, 1, 3, 1, 3, 1, 3];
  // Khoảng liền trước làm đường cơ sở so sánh, ít đơn phanh/điều hòa hơn.
  const baselineOffsets = [58, 55, 52, 49, 46, 43, 40, 37, 34, 31];
  const baselinePlanIndexes = [0, 4, 2, 0, 4, 2, 0, 1, 4, 2];

  await db.sequelize.transaction(async (transaction) => {
    let sequence = 0;
    const createOrder = async ({ daysAgo, planIndex, state = 'PAID' }) => {
      sequence += 1;
      const plan = plans[planIndex];
      const service = await db.Service_Catalog.findByPk(plan.serviceId, { transaction });
      const vehicle = vehicles[sequence % vehicles.length];
      const customer = await db.Customers.findByPk(vehicle.customer_id, { transaction });
      const start = atOffset(daysAgo, 8);
      const finish = atOffset(daysAgo, 15);
      const isPaid = state === 'PAID';
      const isActive = state === 'PENDING' || state === 'DEPOSITED';
      const total = plan.labor + plan.partPrice * plan.partQty;

      const appointment = await db.Appointments.create({
        customer_id: customer.id, vehicle_id: vehicle.id, booking_type: 'MAINTENANCE', scheduled_time: start,
        notes: `${MARKER} ${service.service_name}`, reception_condition: `${MARKER} Đã tiếp nhận xe`,
        status: isActive ? 'IN_PROGRESS' : 'COMPLETED', priority_type: 'NORMAL', created_at: start, updatedAt: finish,
      }, { transaction });
      await db.Appointment_Details.create({ appointment_id: appointment.id, catalog_id: plan.serviceId, createdAt: start, updatedAt: start }, { transaction });
      const order = await db.Service_Orders.create({
        appointment_id: appointment.id, vehicle_id: vehicle.id, receptionist_id: receptionist.id,
        bay_id: null, bay_status: 'NOT_NEEDED', status: isActive ? 'IN_PROGRESS' : 'DELIVERED',
        symptoms: `${MARKER} ${service.service_name}`, entry_time: start,
        estimated_finish_time: finish, promised_finish_time: finish,
        actual_finish_time: isActive ? null : finish, exit_time: isActive ? null : finish,
        current_odo: 25000 + sequence * 1200, createdAt: start, updatedAt: finish,
      }, { transaction });
      const task = await db.Task.create({ service_order_id: order.id, service_catalog_id: plan.serviceId, type: 'REPAIR', status: isActive ? 'IN_PROGRESS' : 'COMPLETED', createdAt: start, updatedAt: finish }, { transaction });
      const quotation = await db.Quotations.create({ task_id: task.id, created_by: leader.id, updated_by: leader.id, total_amount: total, status: 'APPROVED', approved_at: start, approval_method: 'APP', note: `${MARKER} Báo giá`, deposit_amount: state === 'DEPOSITED' ? Math.round(total * 0.3) : 0, createdAt: start, updatedAt: start }, { transaction });
      const laborLine = await db.Quotation_Details.create({ quotation_id: quotation.id, service_id: plan.serviceId, quantity: 1, unit_price: plan.labor, repair_price: plan.labor, amount: plan.labor, status: 'RECEIVED', requested_by: technician.id, createdAt: start, updatedAt: finish }, { transaction });
      await db.Quotation_Details.create({ quotation_id: quotation.id, spare_part_id: plan.partId, quantity: plan.partQty, unit_price: plan.partPrice, repair_price: 0, amount: plan.partPrice * plan.partQty, status: isActive ? 'PENDING' : 'EXPORTED', requested_by: technician.id, createdAt: start, updatedAt: finish }, { transaction });
      await task.update({ quotation_item_id: laborLine.id }, { transaction });
      await db.Task_Assignment.create({ task_id: task.id, technician_id: technician.id, role_in_task: 'LEAD', contribution_percent: 100, actual_start_time: start, actual_end_time: isActive ? null : finish, status: isActive ? 'IN_PROGRESS' : 'COMPLETED', approved_by: leader.id, remarks: MARKER, createdAt: start, updatedAt: finish }, { transaction });

      if (!isActive) {
        await db.Inventory_Logs.create({ receipt_code: `AI-OUT-${sequence}`, part_id: plan.partId, service_order_id: order.id, type: 'OUT', quantity: plan.partQty, unit_price: plan.partPrice, manager_id: inventoryManager.id, received_by: technician.id, received_at: finish, requested_technician_id: technician.id, createdAt: finish, updatedAt: finish }, { transaction });
      }
      const payment = await db.Booking_Payments.create({ order_id: order.id, payment_method: sequence % 2 ? 'BANK_TRANSFER' : 'CASH', payment_gateway: sequence % 2 ? 'BANK' : 'CASH', amount: state === 'DEPOSITED' ? Math.round(total * 0.3) : total, currency: 'VND', payment_status: state, transaction_code: `AI-PAY-${sequence}`, paid_at: isPaid ? finish : null, created_at: start, updated_at: finish }, { transaction });
      if (isPaid) {
        await db.Payment_Transactions.create({ payment_id: payment.id, gateway: payment.payment_gateway, transaction_date: finish, amount_in: total, amount_out: 0, accumulated: total, code: payment.transaction_code, transaction_content: `${MARKER} Thanh toán`, reference_number: payment.transaction_code, created_at: finish, updated_at: finish }, { transaction });
        await customer.increment('total_spent', { by: total, transaction });
      }
    };

    for (let index = 0; index < baselineOffsets.length; index += 1) await createOrder({ daysAgo: baselineOffsets[index], planIndex: baselinePlanIndexes[index] });
    for (let index = 0; index < currentOffsets.length; index += 1) await createOrder({ daysAgo: currentOffsets[index], planIndex: currentPlanIndexes[index] });
    await createOrder({ daysAgo: 1, planIndex: 1, state: 'PENDING' });
    await createOrder({ daysAgo: 2, planIndex: 3, state: 'PENDING' });
    await createOrder({ daysAgo: 3, planIndex: 1, state: 'DEPOSITED' });
    await createOrder({ daysAgo: 4, planIndex: 3, state: 'DEPOSITED' });
  });
  console.log(`${MARKER} Đã thêm 24 đơn PAID trong 30 ngày, 10 đơn đối chiếu và 4 đơn đang xử lý/chờ thanh toán.`);
}

main().then(() => db.sequelize.close()).catch(async error => { console.error(error); try { await db.sequelize.close(); } catch {} process.exit(1); });
