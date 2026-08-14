require('dotenv').config();
const db = require('./models');

async function seed() {
  try {
    console.log("=== BẮT ĐẦU NẠP DỮ LIỆU THỐNG KÊ ADMIN ===");

    // 1. Lấy dữ liệu cơ sở
    const customers = await db.Customers.findAll({ raw: true });
    const vehicles = await db.Vehicles.findAll({ raw: true });
    const services = await db.Service_Catalog.findAll({ raw: true });
    const parts = await db.Spare_Parts.findAll({ raw: true });

    const technicians = await db.User.findAll({ where: { roleId: 4 }, raw: true });
    const receptionist = await db.User.findOne({ where: { roleId: 2 }, raw: true });
    const receptionistId = receptionist ? receptionist.id : 1;

    if (customers.length === 0 || vehicles.length === 0 || services.length === 0) {
      console.error("Thiếu dữ liệu cơ sở!");
      process.exit(1);
    }

    console.log(`Dữ liệu cơ sở hiện có:
- Khách hàng: ${customers.length}
- Xe: ${vehicles.length}
- Dịch vụ: ${services.length}
- Phụ tùng: ${parts.length}
- Kỹ thuật viên: ${technicians.length}
- Lễ tân ID: ${receptionistId}`);

    // 2. Dọn dẹp dữ liệu cũ do seeder tạo ra
    console.log("Đang dọn dẹp dữ liệu cũ...");
    const oldOrders = await db.Service_Orders.findAll({
      where: { early_closure_reason: '[STAT_SEED]' },
      attributes: ['id', 'appointment_id'],
      raw: true
    });
    const orderIds = oldOrders.map(o => o.id);
    const appointmentIds = oldOrders.map(o => o.appointment_id).filter(Boolean);

    if (orderIds.length > 0) {
      await db.Booking_Payments.destroy({ where: { order_id: { [db.Sequelize.Op.in]: orderIds } } });
      await db.Feedback.destroy({ where: { service_order_id: { [db.Sequelize.Op.in]: orderIds } } });

      const tasks = await db.Task.findAll({
        where: { service_order_id: { [db.Sequelize.Op.in]: orderIds } },
        attributes: ['id'],
        raw: true
      });
      const taskIds = tasks.map(t => t.id);

      if (taskIds.length > 0) {
        await db.Task_Assignment.destroy({ where: { task_id: { [db.Sequelize.Op.in]: taskIds } } });

        const quotations = await db.Quotations.findAll({
          where: { task_id: { [db.Sequelize.Op.in]: taskIds } },
          attributes: ['id'],
          raw: true
        });
        const quotationIds = quotations.map(q => q.id);

        if (quotationIds.length > 0) {
          await db.Quotation_Details.destroy({ where: { quotation_id: { [db.Sequelize.Op.in]: quotationIds } } });
          await db.Quotations.destroy({ where: { id: { [db.Sequelize.Op.in]: quotationIds } } });
        }

        await db.Task.destroy({ where: { id: { [db.Sequelize.Op.in]: taskIds } } });
      }

      await db.Service_Orders.destroy({ where: { id: { [db.Sequelize.Op.in]: orderIds } } });
    }

    if (appointmentIds.length > 0) {
      await db.Appointments.destroy({ where: { id: { [db.Sequelize.Op.in]: appointmentIds } } });
    }

    console.log("Dọn dẹp hoàn tất. Đang sinh dữ liệu mới...");

    // 3. Sinh dữ liệu 52 tuần lịch sử
    const now = new Date();
    const startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    let appointmentCount = 0;
    let orderCount = 0;
    let paymentCount = 0;

    for (let w = 0; w < 52; w++) {
      const numJobs = Math.floor(Math.random() * 3) + 1;

      for (let j = 0; j < numJobs; j++) {
        const jobDate = new Date(startDate.getTime());
        jobDate.setDate(startDate.getDate() + (w * 7) + Math.floor(Math.random() * 7));
        jobDate.setHours(8 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
        if (jobDate > now) continue;

        const customer = customers[Math.floor(Math.random() * customers.length)];
        const vehicle = vehicles.find(v => v.customer_id === customer.id) || vehicles[Math.floor(Math.random() * vehicles.length)];
        const service = services[Math.floor(Math.random() * services.length)];
        const part = parts.length > 0 ? parts[Math.floor(Math.random() * parts.length)] : null;
        const technician = technicians.length > 0 ? technicians[Math.floor(Math.random() * technicians.length)] : null;

        // Tạo Appointment
        const appt = await db.Appointments.create({
          customer_id: customer.id,
          vehicle_id: vehicle.id,
          booking_type: 'CUSTOMER_REPAIR',
          scheduled_time: jobDate,
          status: 'COMPLETED',
          notes: '[STAT_SEED]',
          createdAt: jobDate,
          updatedAt: jobDate
        });
        appointmentCount++;

        // Tạo Service Order
        const serviceOrder = await db.Service_Orders.create({
          appointment_id: appt.id,
          vehicle_id: vehicle.id,
          receptionist_id: receptionistId,
          status: 'COMPLETED',
          entry_time: jobDate,
          actual_finish_time: jobDate,
          current_odo: 10000 + Math.floor(Math.random() * 50000),
          symptoms: 'Kiểm tra và bảo dưỡng định kỳ',
          early_closure_reason: '[STAT_SEED]',
          createdAt: jobDate,
          updatedAt: jobDate
        });
        orderCount++;

        // Tạo Task
        const task = await db.Task.create({
          service_order_id: serviceOrder.id,
          service_catalog_id: service.id,
          type: 'REPAIR',
          status: 'COMPLETED',
          createdAt: jobDate,
          updatedAt: jobDate
        });

        // Tạo Task Assignment
        if (technician) {
          await db.Task_Assignment.create({
            task_id: task.id,
            technician_id: technician.id,
            role_in_task: 'LEAD',
            contribution_percent: 100,
            actual_start_time: jobDate,
            actual_end_time: jobDate,
            status: 'COMPLETED',
            remarks: '[STAT_SEED]',
            createdAt: jobDate,
            updatedAt: jobDate
          });
        }

        // Tính giá
        const laborPrice = parseFloat(service.labor_price || 200000);
        let partPrice = 0;
        if (part && Math.random() > 0.3) {
          partPrice = parseFloat(part.retail_price || 150000);
        }
        const totalAmount = laborPrice + partPrice;

        // Tạo Quotation (cần created_by, total_amount)
        const quotation = await db.Quotations.create({
          task_id: task.id,
          created_by: receptionistId,
          total_amount: totalAmount,
          status: 'APPROVED',
          approved_at: jobDate,
          note: '[STAT_SEED]',
          createdAt: jobDate,
          updatedAt: jobDate
        });

        // Tạo Quotation_Details dịch vụ (dùng unit_price thay vì price)
        const laborDetail = await db.Quotation_Details.create({
          quotation_id: quotation.id,
          service_id: service.id,
          spare_part_id: null,
          quantity: 1,
          unit_price: laborPrice,
          amount: laborPrice,
          status: 'RECEIVED',
          createdAt: jobDate,
          updatedAt: jobDate
        });

        // Liên kết task với quotation_item_id
        await task.update({ quotation_item_id: laborDetail.id });

        // Tạo Quotation_Details linh kiện nếu có
        if (part && partPrice > 0) {
          await db.Quotation_Details.create({
            quotation_id: quotation.id,
            service_id: null,
            spare_part_id: part.id,
            quantity: 1,
            unit_price: parseFloat(part.retail_price),
            amount: partPrice,
            status: 'RECEIVED',
            createdAt: jobDate,
            updatedAt: jobDate
          });
        }

        // Tạo Booking Payment
        await db.Booking_Payments.create({
          order_id: serviceOrder.id,
          payment_method: Math.random() > 0.5 ? 'BANK_TRANSFER' : 'CASH',
          payment_gateway: 'SEPAY',
          amount: totalAmount,
          currency: 'VND',
          payment_status: 'PAID',
          transaction_code: `TXSEED${jobDate.getTime()}${j}`,
          paid_at: jobDate,
          refund_note: '[STAT_SEED]'
        });
        paymentCount++;

        // Tạo Feedback (cần customer_id)
        if (Math.random() > 0.5) {
          await db.Feedback.create({
            customer_id: customer.id,
            service_order_id: serviceOrder.id,
            rating: Math.floor(Math.random() * 2) + 4, // 4 hoặc 5 sao
            comment: `Dịch vụ tốt, kỹ thuật viên chuyên nghiệp. [STAT_SEED]`,
            createdAt: jobDate,
            updatedAt: jobDate
          });
        }
      }
    }

    console.log(`
=== HOÀN TẤT NẠP DỮ LIỆU ===
- Lịch hẹn hoàn thành (Appointments):   ${appointmentCount}
- Lệnh sửa chữa (Service Orders):        ${orderCount}
- Hóa đơn thanh toán PAID (Payments):   ${paymentCount}
`);
    process.exit(0);
  } catch (error) {
    console.error("Lỗi khi nạp dữ liệu thống kê:", error.message || error);
    process.exit(1);
  }
}

seed();
