'use strict';

/**
 * Làm sạch dữ liệu giao dịch bị đứt chuỗi và tạo 5 đơn mẫu hoàn chỉnh.
 * Không tạo bảng/cột mới. Giữ nguyên Users, Customers, Vehicles, Roles và cấu hình.
 *
 * Chạy: node scripts/reset_and_seed_business_demo.js --confirm-clean
 */

const db = require('../models');

const MARKER = '[BIZ-DEMO-2026]';

const servicePlans = [
  { serviceId: 25, serviceName: 'Thay dầu động cơ', laborPrice: 180000, partId: 2, partName: 'Dầu động cơ 5W-30', sku: 'BIZ-OIL-5W30', retailPrice: 650000, unitCost: 430000, importQty: 20, usedQty: 4 },
  { serviceId: 15, serviceName: 'Thay má phanh trước', laborPrice: 280000, partId: 5, partName: 'Bộ má phanh trước', sku: 'BIZ-BRAKE-F', retailPrice: 1200000, unitCost: 780000, importQty: 12, usedQty: 1 },
  { serviceId: 19, serviceName: 'Thay ắc quy', laborPrice: 180000, partId: 3, partName: 'Ắc quy ô tô 60Ah', sku: 'BIZ-BAT-60AH', retailPrice: 1850000, unitCost: 1320000, importQty: 8, usedQty: 1 },
  { serviceId: 28, serviceName: 'Bảo dưỡng điều hòa', laborPrice: 350000, partId: 9, partName: 'Lọc gió điều hòa', sku: 'BIZ-CABIN-FILTER', retailPrice: 420000, unitCost: 250000, importQty: 15, usedQty: 1 },
  { serviceId: 24, serviceName: 'Thay dây curoa', laborPrice: 320000, partId: 10, partName: 'Dây curoa động cơ', sku: 'BIZ-BELT-001', retailPrice: 780000, unitCost: 490000, importQty: 10, usedQty: 1 },
];

// Tất cả giao dịch mẫu đều đã phát sinh trước hoặc trong ngày báo cáo 12/08/2026.
const serviceDays = [3, 5, 7, 9, 11];

const transactionTables = [
  'Payment_Transactions', 'Booking_Payments', 'Point_Transactions', 'Feedbacks',
  'Repair_Notes', 'Vehicle_Issues', 'Task_Assignments', 'Restock_Requests',
  'Custom_Part_Orders', 'Quotation_Details', 'Quotations', 'Tasks',
  'Inventory_Batches', 'Inventory_Logs', 'Service_Orders',
  'Appointment_Details', 'Appointments'
];

function atDay(day, hour) {
  return new Date(`2026-08-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00+07:00`);
}

async function main() {
  if (!process.argv.includes('--confirm-clean')) {
    throw new Error('Thiếu --confirm-clean. Script này xóa dữ liệu giao dịch hiện tại trước khi seed.');
  }

  const queryInterface = db.sequelize.getQueryInterface();
  const existingTables = await queryInterface.showAllTables();
  const tablesToClean = transactionTables.filter((table) => existingTables.includes(table));

  await db.sequelize.transaction(async (transaction) => {
    if (tablesToClean.length) {
      const quotedTables = tablesToClean.map((table) => `"${table}"`).join(', ');
      await db.sequelize.query(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`, { transaction });
    }

    const receptionist = await db.User.findOne({ where: { roleId: 2 }, transaction });
    const technician = await db.User.findOne({ where: { roleId: 4 }, transaction });
    const technicianLeader = await db.User.findOne({ where: { roleId: 3 }, transaction });
    const inventoryManager = await db.User.findOne({ where: { roleId: 6 }, transaction });
    const supplier = await db.Suppliers.findOne({ where: { is_active: true }, transaction });
    const vehicles = await db.Vehicles.findAll({ limit: 5, order: [['id', 'ASC']], transaction });

    if (!receptionist || !technician || !technicianLeader || !inventoryManager || !supplier || vehicles.length < 5) {
      throw new Error('Thiếu dữ liệu nền: cần lễ tân, kỹ thuật viên, tổ trưởng, quản lý kho, nhà cung cấp và ít nhất 5 xe.');
    }

    // Các bảng thanh toán đã được làm sạch, vì vậy tổng chi tiêu phải được tính
    // lại từ đầu để script có thể chạy lặp mà không cộng trùng.
    await db.Customers.update({ total_spent: 0 }, { where: {}, transaction });

    for (let index = 0; index < servicePlans.length; index += 1) {
      const plan = servicePlans[index];
      const part = await db.Spare_Parts.findByPk(plan.partId, { transaction });
      const service = await db.Service_Catalog.findByPk(plan.serviceId, { transaction });
      if (!part || !service) throw new Error(`Không tìm thấy service ${plan.serviceId} hoặc part ${plan.partId}`);

      await part.update({
        name: plan.partName,
        sku: plan.sku,
        retail_price: plan.retailPrice,
        stock_quantity: plan.importQty - plan.usedQty,
        min_threshold: 3,
      }, { transaction });
      await service.update({
        service_name: plan.serviceName,
        labor_price: plan.laborPrice,
        spare_part_id: plan.partId,
        is_active: true,
      }, { transaction });

      const importDate = atDay(1, 8 + index);
      const importLog = await db.Inventory_Logs.create({
        receipt_code: `BIZ-IN-202608-${index + 1}`,
        part_id: plan.partId,
        supplier_id: supplier.id,
        service_order_id: null,
        type: 'IN',
        quantity: plan.importQty,
        unit_price: plan.unitCost,
        manager_id: inventoryManager.id,
        received_by: inventoryManager.id,
        received_at: importDate,
        createdAt: importDate,
        updatedAt: importDate,
      }, { transaction });
      await db.Inventory_Batches.create({
        inventory_log_id: importLog.id,
        unit_cost: plan.unitCost,
        remaining_quantity: plan.importQty - plan.usedQty,
        createdAt: importDate,
        updatedAt: importDate,
      }, { transaction });

      const vehicle = vehicles[index];
      const customer = await db.Customers.findByPk(vehicle.customer_id, { transaction });
      const bookingDate = atDay(serviceDays[index], 8);
      const finishDate = atDay(serviceDays[index], 15);

      const appointment = await db.Appointments.create({
        customer_id: customer.id,
        vehicle_id: vehicle.id,
        booking_type: 'MAINTENANCE',
        scheduled_time: bookingDate,
        notes: `${MARKER} Khách đặt ${plan.serviceName}`,
        reception_condition: `${MARKER} Xe đã được tiếp nhận và kiểm tra ban đầu`,
        status: 'COMPLETED',
        priority_type: 'NORMAL',
        created_at: bookingDate,
        updatedAt: finishDate,
      }, { transaction });
      await db.Appointment_Details.create({
        appointment_id: appointment.id,
        catalog_id: plan.serviceId,
        combo_id: null,
        createdAt: bookingDate,
        updatedAt: bookingDate,
      }, { transaction });

      const order = await db.Service_Orders.create({
        appointment_id: appointment.id,
        vehicle_id: vehicle.id,
        receptionist_id: receptionist.id,
        bay_id: null,
        bay_status: 'NOT_NEEDED',
        status: 'DELIVERED',
        symptoms: `${MARKER} Thực hiện ${plan.serviceName}`,
        entry_time: bookingDate,
        estimated_finish_time: finishDate,
        promised_finish_time: finishDate,
        actual_finish_time: finishDate,
        exit_time: finishDate,
        current_odo: 30000 + index * 5000,
        createdAt: bookingDate,
        updatedAt: finishDate,
      }, { transaction });

      const task = await db.Task.create({
        service_order_id: order.id,
        quotation_item_id: null,
        service_catalog_id: plan.serviceId,
        type: 'REPAIR',
        status: 'COMPLETED',
        createdAt: bookingDate,
        updatedAt: finishDate,
      }, { transaction });
      const quotationTotal = plan.laborPrice + plan.retailPrice * plan.usedQty;
      const quotation = await db.Quotations.create({
        task_id: task.id,
        created_by: technicianLeader.id,
        updated_by: technicianLeader.id,
        total_amount: quotationTotal,
        status: 'APPROVED',
        approved_at: bookingDate,
        approval_method: 'APP',
        note: `${MARKER} Báo giá khách đã đồng ý`,
        deposit_amount: 0,
        createdAt: bookingDate,
        updatedAt: bookingDate,
      }, { transaction });
      const laborLine = await db.Quotation_Details.create({
        quotation_id: quotation.id,
        service_id: plan.serviceId,
        spare_part_id: null,
        quantity: 1,
        unit_price: plan.laborPrice,
        repair_price: plan.laborPrice,
        amount: plan.laborPrice,
        status: 'RECEIVED',
        requested_by: technician.id,
        createdAt: bookingDate,
        updatedAt: finishDate,
      }, { transaction });
      const partLine = await db.Quotation_Details.create({
        quotation_id: quotation.id,
        service_id: null,
        spare_part_id: plan.partId,
        quantity: plan.usedQty,
        unit_price: plan.retailPrice,
        repair_price: 0,
        amount: plan.retailPrice * plan.usedQty,
        status: 'EXPORTED',
        requested_by: technician.id,
        createdAt: bookingDate,
        updatedAt: finishDate,
      }, { transaction });
      await task.update({ quotation_item_id: laborLine.id }, { transaction });

      await db.Task_Assignment.create({
        task_id: task.id,
        technician_id: technician.id,
        role_in_task: 'LEAD',
        contribution_percent: 100,
        actual_start_time: bookingDate,
        actual_end_time: finishDate,
        status: 'COMPLETED',
        approved_by: technicianLeader.id,
        remarks: `${MARKER} Hoàn thành và kiểm tra chất lượng`,
        createdAt: bookingDate,
        updatedAt: finishDate,
      }, { transaction });
      await db.Inventory_Logs.create({
        receipt_code: `BIZ-OUT-202608-${index + 1}`,
        part_id: plan.partId,
        supplier_id: null,
        service_order_id: order.id,
        type: 'OUT',
        quantity: plan.usedQty,
        unit_price: plan.retailPrice,
        manager_id: inventoryManager.id,
        received_by: technician.id,
        received_at: finishDate,
        requested_technician_id: technician.id,
        createdAt: finishDate,
        updatedAt: finishDate,
      }, { transaction });

      const payment = await db.Booking_Payments.create({
        order_id: order.id,
        payment_method: index % 2 === 0 ? 'BANK_TRANSFER' : 'CASH',
        payment_gateway: index % 2 === 0 ? 'BANK' : 'CASH',
        amount: quotationTotal,
        currency: 'VND',
        payment_status: 'PAID',
        transaction_code: `BIZ-PAY-202608-${index + 1}`,
        paid_at: finishDate,
        created_at: finishDate,
        updated_at: finishDate,
      }, { transaction });
      await db.Payment_Transactions.create({
        payment_id: payment.id,
        gateway: payment.payment_gateway,
        transaction_date: finishDate,
        amount_in: quotationTotal,
        amount_out: 0,
        accumulated: quotationTotal,
        code: payment.transaction_code,
        transaction_content: `${MARKER} Thanh toán ${plan.serviceName}`,
        reference_number: payment.transaction_code,
        created_at: finishDate,
        updated_at: finishDate,
      }, { transaction });

      await customer.increment('total_spent', { by: quotationTotal, transaction });
      void partLine;
    }

    // Xóa liên kết sai trên các dịch vụ còn lại: không tự gán lốp xe cho mọi dịch vụ.
    await db.Service_Catalog.update(
      { spare_part_id: null },
      { where: { id: { [db.Sequelize.Op.notIn]: servicePlans.map((item) => item.serviceId) } }, transaction }
    );
  });

  console.log(`${MARKER} Đã làm sạch dữ liệu giao dịch và tạo 5 đơn đã thanh toán.`);
}

main()
  .then(async () => db.sequelize.close())
  .catch(async (error) => {
    console.error(error);
    try { await db.sequelize.close(); } catch {}
    process.exit(1);
  });
