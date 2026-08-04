require('dotenv').config();
const db = require('../models');

// Symptoms list for realistic data
const symptomsTemplates = [
  "Thay dầu định kỳ và kiểm tra tổng quát",
  "Phanh xe kêu két két khi đạp phanh, cảm giác phanh không ăn",
  "Động cơ rung giật khi chạy ở tốc độ cao, có khói đen",
  "Hệ thống điều hòa không mát, chỉ có gió thổi nhẹ",
  "Đèn cảnh báo check engine sáng trên taplo",
  "Đề nổ khó khăn khi trời lạnh, bình ắc quy yếu",
  "Xe bị lệch lái sang bên phải khi đi trên đường thẳng",
  "Tiếng kêu lọc cọc phát ra từ gầm xe khi đi qua gờ giảm tốc",
  "Thay má phanh trước/sau và đĩa phanh",
  "Bảo dưỡng cấp lớn 40,000 km",
  "Thay lốp xe và cân chỉnh độ chụm bánh xe",
  "Thay dây curoa động cơ bị nứt nhẹ"
];

async function seedHistory() {
  const transaction = await db.sequelize.transaction();
  try {
    console.log("=== START SEEDING HISTORICAL REVENUE DATA ===");

    // 1. Fetch available references from DB
    const receptionists = await db.User.findAll({
      where: { roleId: 2 }, // Receptionist role ID
      transaction
    });
    const receptionistId = receptionists.length > 0 ? receptionists[0].id : 5; // Fallback to 5 if not found

    const technicians = await db.User.findAll({
      where: { roleId: 4 }, // Technician role ID
      transaction
    });
    const technicianIds = technicians.map(t => t.id);
    if (technicianIds.length === 0) {
      technicianIds.push(3, 6, 7, 8); // Fallback
    }

    const vehicles = await db.Vehicles.findAll({ transaction });
    if (vehicles.length === 0) {
      throw new Error("No vehicles found in database! Please seed vehicles first.");
    }

    const bays = await db.Service_Bays.findAll({ transaction });
    const bayIds = bays.map(b => b.id);
    if (bayIds.length === 0) {
      bayIds.push(1, 2, 3); // Fallback
    }

    const serviceCatalog = await db.Service_Catalog.findAll({ transaction });
    if (serviceCatalog.length === 0) {
      throw new Error("No services found in Service_Catalog! Please seed services first.");
    }

    const spareParts = await db.Spare_Parts.findAll({ transaction });
    if (spareParts.length === 0) {
      throw new Error("No spare parts found in Spare_Parts! Please seed parts first.");
    }

    console.log(`References retrieved:`);
    console.log(`- Receptionist ID: ${receptionistId}`);
    console.log(`- Technician IDs: ${technicianIds.join(', ')}`);
    console.log(`- Vehicles Count: ${vehicles.length}`);
    console.log(`- Bays Count: ${bayIds.length}`);
    console.log(`- Services Count: ${serviceCatalog.length}`);
    console.log(`- Spare Parts Count: ${spareParts.length}`);

    // Define date range: Jan 1, 2025 to Jul 31, 2026
    const startDate = new Date('2025-01-01T08:00:00Z');
    const endDate = new Date('2026-07-31T17:00:00Z');
    let currentDate = new Date(startDate);

    let totalOrdersCreated = 0;
    let totalRevenue = 0;

    // Loop through each day in the range
    while (currentDate <= endDate) {
      // Determine number of orders for today
      // 72% chance of 0, 22% chance of 1, 6% chance of 2
      const rand = Math.random();
      let ordersToday = 0;
      if (rand > 0.72 && rand <= 0.94) {
        ordersToday = 1;
      } else if (rand > 0.94) {
        ordersToday = 2;
      }

      for (let o = 0; o < ordersToday; o++) {
        // Pick random vehicle
        const vehicle = vehicles[Math.floor(Math.random() * vehicles.length)];
        
        // Pick random bay
        const bayId = bayIds[Math.floor(Math.random() * bayIds.length)];

        // Generate realistic entry time (between 8:00 AM and 3:00 PM)
        const hour = 8 + Math.floor(Math.random() * 8);
        const minute = Math.floor(Math.random() * 60);
        const entryTime = new Date(currentDate);
        entryTime.setUTCHours(hour, minute, 0, 0);

        // Odo reading
        const odo = 10000 + Math.floor(Math.random() * 150000);

        // Symptom
        const symptom = symptomsTemplates[Math.floor(Math.random() * symptomsTemplates.length)];

        // Service Order
        const serviceOrder = await db.Service_Orders.create({
          appointment_id: null,
          vehicle_id: vehicle.id,
          receptionist_id: receptionistId,
          bay_id: bayId,
          current_odo: odo,
          status: "COMPLETED",
          symptoms: symptom,
          entry_time: entryTime,
          estimated_finish_time: new Date(entryTime.getTime() + 4 * 60 * 60 * 1000), // +4 hours
          promised_finish_time: new Date(entryTime.getTime() + 4 * 60 * 60 * 1000),
          actual_finish_time: new Date(entryTime.getTime() + 3.5 * 60 * 60 * 1000), // +3.5 hours
          exit_time: new Date(entryTime.getTime() + 3.6 * 60 * 60 * 1000)
        }, { transaction });

        // 1. Create Inspection Task (completed)
        const inspectionTask = await db.Task.create({
          service_order_id: serviceOrder.id,
          quotation_item_id: null,
          service_catalog_id: null,
          type: "INSPECTION",
          status: "COMPLETED",
          createdAt: entryTime,
          updatedAt: new Date(entryTime.getTime() + 30 * 60 * 1000) // completed in 30 mins
        }, { transaction });

        // 2. Create Quotation for the Inspection Task
        const quotation = await db.Quotations.create({
          task_id: inspectionTask.id,
          created_by: receptionistId,
          total_amount: 0, // updated later
          status: "APPROVED",
          approved_at: new Date(entryTime.getTime() + 45 * 60 * 1000),
          approval_method: "OTP",
          approved_phone: "0901234567",
          note: "Khách đồng ý sửa chữa theo báo giá",
          deposit_amount: 0,
          createdAt: new Date(entryTime.getTime() + 35 * 60 * 1000),
          updatedAt: new Date(entryTime.getTime() + 45 * 60 * 1000)
        }, { transaction });

        // 3. Create 1-3 Repair Tasks
        const numRepairs = 1 + Math.floor(Math.random() * 3);
        let orderTotalAmount = 0;
        const detailsToCreate = [];

        // Track services already used in this order to avoid duplicates
        const usedServiceIds = new Set();

        for (let r = 0; r < numRepairs; r++) {
          // Pick a random service catalog item
          let service;
          let attempts = 0;
          do {
            service = serviceCatalog[Math.floor(Math.random() * serviceCatalog.length)];
            attempts++;
          } while (usedServiceIds.has(service.id) && attempts < 10);
          
          usedServiceIds.add(service.id);

          const repairTask = await db.Task.create({
            service_order_id: serviceOrder.id,
            quotation_item_id: null, // will link if needed or keep null
            service_catalog_id: service.id,
            type: "REPAIR",
            status: "COMPLETED",
            createdAt: new Date(entryTime.getTime() + 50 * 60 * 1000),
            updatedAt: new Date(entryTime.getTime() + 3 * 60 * 60 * 1000)
          }, { transaction });

          // Task Assignment
          const techId = technicianIds[Math.floor(Math.random() * technicianIds.length)];
          await db.Task_Assignment.create({
            task_id: repairTask.id,
            technician_id: techId,
            staff_shift_id: null,
            bay_id: bayId,
            role_in_task: "LEAD",
            contribution_percent: 100,
            actual_start_time: new Date(entryTime.getTime() + 55 * 60 * 1000),
            actual_end_time: new Date(entryTime.getTime() + 3 * 60 * 60 * 1000),
            status: "COMPLETED",
            approved_by: receptionistId
          }, { transaction });

          // Quotation Detail for Service Labor
          const laborPrice = parseFloat(service.labor_price || 150000);
          orderTotalAmount += laborPrice;
          detailsToCreate.push({
            quotation_id: quotation.id,
            service_id: service.id,
            spare_part_id: null,
            quantity: 1,
            unit_price: 0,
            repair_price: laborPrice,
            amount: laborPrice,
            status: "RECEIVED",
            createdAt: quotation.createdAt,
            updatedAt: quotation.updatedAt
          });

          // Chance (60%) to use a spare part for this service
          if (Math.random() > 0.4) {
            // Find a random spare part
            const part = spareParts[Math.floor(Math.random() * spareParts.length)];
            // Make price realistic if it's too small (e.g. dummy 3000 -> 300000)
            let partPrice = parseFloat(part.retail_price || 200000);
            if (partPrice < 10000) {
              partPrice = partPrice * 100; // scale up dummy prices to look realistic
            }
            const quantity = 1 + Math.floor(Math.random() * 2);
            const partTotal = partPrice * quantity;
            orderTotalAmount += partTotal;

            detailsToCreate.push({
              quotation_id: quotation.id,
              service_id: null,
              spare_part_id: part.id,
              quantity: quantity,
              unit_price: partPrice,
              repair_price: 0,
              amount: partTotal,
              status: "RECEIVED",
              createdAt: quotation.createdAt,
              updatedAt: quotation.updatedAt
            });
          }
        }

        // Insert all quotation details
        await db.Quotation_Details.bulkCreate(detailsToCreate, { transaction });

        // Update quotation total amount
        await quotation.update({ total_amount: orderTotalAmount }, { transaction });

        // Create Booking Payment
        const method = Math.random() > 0.2 ? "VIETQR" : "CASH";
        const gateway = method === "VIETQR" ? "BANK" : "CASH";
        const txCode = `TX-${serviceOrder.id}-${Date.now().toString().slice(-6)}`;
        const paidAt = new Date(entryTime.getTime() + 3.5 * 60 * 60 * 1000 + 5 * 60 * 1000); // 5 mins after actual finish

        const bookingPayment = await db.Booking_Payments.create({
          order_id: serviceOrder.id,
          payment_method: method,
          payment_gateway: gateway,
          amount: orderTotalAmount,
          currency: "VND",
          payment_status: "PAID",
          transaction_code: txCode,
          paid_at: paidAt,
          createdAt: paidAt,
          updatedAt: paidAt
        }, { transaction });

        // Create Payment Transaction
        await db.Payment_Transactions.create({
          payment_id: bookingPayment.id,
          gateway: gateway,
          transaction_date: paidAt,
          account_number: method === "CASH" ? "CASH" : "1028374659",
          sub_account: method === "CASH" ? "CASH" : "MB_BANK",
          amount_in: orderTotalAmount,
          amount_out: 0,
          accumulated: orderTotalAmount,
          code: txCode,
          transaction_content: `Thanh toan hoa don sua chua SO-${serviceOrder.id}`,
          reference_number: txCode,
          raw_body: JSON.stringify({ order_id: serviceOrder.id, method, amount: orderTotalAmount }),
          createdAt: paidAt,
          updatedAt: paidAt
        }, { transaction });

        totalOrdersCreated++;
        totalRevenue += orderTotalAmount;
      }

      // Advance to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    await transaction.commit();
    console.log("=== SEEDING COMPLETED SUCCESSFULLY ===");
    console.log(`- Created ${totalOrdersCreated} Service Orders`);
    console.log(`- Total Revenue generated: ${totalRevenue.toLocaleString('vi-VN')} VND`);

  } catch (error) {
    await transaction.rollback();
    console.error("❌ ERROR SEEDING HISTORY:", error);
  } finally {
    process.exit(0);
  }
}

seedHistory();
