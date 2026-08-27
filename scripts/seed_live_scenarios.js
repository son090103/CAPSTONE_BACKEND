require('dotenv').config();
const db = require('../models');

async function run() {
  const transaction = await db.sequelize.transaction();
  try {
    console.log("=== START SEEDING LIVE SCENARIOS ===");

    // 1. Fetch reference roles
    const roles = await db.Role.findAll({ transaction });
    const getRoleId = (code) => roles.find(r => r.roleCode === code)?.id;
    const receptionistRole = getRoleId('RECEPTIONIST');
    const techRole = getRoleId('TECHNICIAN');
    const leaderRole = getRoleId('TECHNICIAN_LEADER');
    const customerRole = getRoleId('CUSTOMER');

    console.log(`Roles identified: RECEPTIONIST=${receptionistRole}, TECHNICIAN=${techRole}, LEADER=${leaderRole}, CUSTOMER=${customerRole}`);

    // 2. Fetch/Check users
    const receptionist = await db.User.findOne({ where: { roleId: receptionistRole }, transaction });
    if (!receptionist) throw new Error("No Receptionist user found!");
    const receptionistId = receptionist.id;

    const leader = await db.User.findOne({ where: { roleId: leaderRole }, transaction });
    if (!leader) throw new Error("No Technician Leader user found!");
    const leaderId = leader.id;

    const technicians = await db.User.findAll({ where: { roleId: techRole }, transaction });
    if (technicians.length < 3) throw new Error("Need at least 3 Technicians in DB!");
    const tech1Id = technicians[0].id;
    const tech2Id = technicians[1].id;
    const tech3Id = technicians[2].id;

    const customerUsers = await db.User.findAll({ where: { roleId: customerRole }, transaction });
    if (customerUsers.length < 3) throw new Error("Need at least 3 Customer users in DB!");

    console.log(`Key staff: Receptionist=${receptionistId}, Leader=${leaderId}, Techs=[${tech1Id}, ${tech2Id}, ${tech3Id}]`);

    // Ensure Customers table has matching records
    const customers = [];
    for (let cu of customerUsers) {
      let cust = await db.Customers.findOne({ where: { user_id: cu.id }, transaction });
      if (!cust) {
        cust = await db.Customers.create({
          user_id: cu.id,
          name: cu.fullName,
          phone: cu.phoneNumber || '0900000000',
          email: cu.email || 'customer@example.com'
        }, { transaction });
      }
      customers.push(cust);
    }

    // 3. Check or Create Vehicles
    let vehicles = await db.Vehicles.findAll({ transaction });
    if (vehicles.length < 3) {
      const model = await db.Vehicle_Models.findOne({ transaction });
      if (!model) throw new Error("No Vehicle Models found in DB!");
      
      const v1 = await db.Vehicles.create({
        customer_id: customers[0].id,
        model_id: model.id,
        license_plate: "30K-123.45",
        year: 2022,
        color: "Trắng"
      }, { transaction });

      const v2 = await db.Vehicles.create({
        customer_id: customers[1].id,
        model_id: model.id,
        license_plate: "43A-987.65",
        year: 2021,
        color: "Đen"
      }, { transaction });

      const v3 = await db.Vehicles.create({
        customer_id: customers[2].id,
        model_id: model.id,
        license_plate: "51G-555.55",
        year: 2023,
        color: "Đỏ"
      }, { transaction });

      vehicles = [v1, v2, v3];
    }

    // Fetch bays
    const bays = await db.Service_Bays.findAll({ transaction });
    if (bays.length < 2) throw new Error("Need at least 2 service bays in database.");
    const bay1Id = bays[0].id;
    const bay2Id = bays[1].id;

    // Fetch service catalogs
    const services = await db.Service_Catalog.findAll({ transaction });
    if (services.length < 5) throw new Error("Need at least 5 service catalog items in database.");

    // Fetch spare parts
    const spareParts = await db.Spare_Parts.findAll({ transaction });
    if (spareParts.length === 0) throw new Error("Need at least 1 spare part in database.");

    // ----------------------------------------------------
    // SCENARIOS FOR RECEPTIONIST & CUSTOMER REVIEW
    // ----------------------------------------------------

    // Scenario 1: Appointment scheduled for today (CONFIRMED)
    const today = new Date();
    const appTime = new Date(today);
    appTime.setHours(10, 30, 0, 0);

    const app1 = await db.Appointments.create({
      customer_id: customers[0].id,
      vehicle_id: vehicles[0].id,
      booking_type: "MAINTENANCE",
      scheduled_time: appTime,
      notes: "Bảo dưỡng định kỳ VinFast Lux A2.0",
      status: "CONFIRMED",
      priority_type: "NORMAL"
    }, { transaction });

    await db.Appointment_Details.create({
      appointment_id: app1.id,
      service_id: services[0].id,
      notes: "Thay nhớt máy và lọc dầu nhớt"
    }, { transaction });

    console.log("-> Seeded Scenario 1: CONFIRMED Appointment");

    // Appointment 2: PENDING Appointment for tomorrow
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const appTime2 = new Date(tomorrow);
    appTime2.setHours(9, 0, 0, 0);

    const app2 = await db.Appointments.create({
      customer_id: customers[1].id,
      vehicle_id: vehicles[1].id,
      booking_type: "REPAIR",
      scheduled_time: appTime2,
      notes: "Kiểm tra hệ thống treo và giảm xóc sau có tiếng động lạ",
      status: "PENDING",
      priority_type: "NORMAL"
    }, { transaction });

    await db.Appointment_Details.create({
      appointment_id: app2.id,
      service_id: services[1].id,
      notes: "Kiểm tra và chuẩn đoán gầm xe"
    }, { transaction });

    console.log("-> Seeded Appointment 2: PENDING Appointment for tomorrow");

    // Appointment 3: CONFIRMED Appointment for today afternoon
    const appTime3 = new Date(today);
    appTime3.setHours(14, 0, 0, 0);

    const app3 = await db.Appointments.create({
      customer_id: customers[2].id,
      vehicle_id: vehicles[2].id,
      booking_type: "MAINTENANCE",
      scheduled_time: appTime3,
      notes: "Bảo dưỡng định kỳ mốc 15.000 km",
      status: "CONFIRMED",
      priority_type: "NORMAL"
    }, { transaction });

    await db.Appointment_Details.create({
      appointment_id: app3.id,
      service_id: services[2].id,
      notes: "Bảo dưỡng định kỳ và thay lọc gió động cơ"
    }, { transaction });

    console.log("-> Seeded Appointment 3: CONFIRMED Appointment for today afternoon");

    // Appointment 4: CANCELED Appointment from yesterday
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const appTime4 = new Date(yesterday);
    appTime4.setHours(11, 0, 0, 0);

    const app4 = await db.Appointments.create({
      customer_id: customers[0].id,
      vehicle_id: vehicles[0].id,
      booking_type: "REPAIR",
      scheduled_time: appTime4,
      notes: "Sơn dặm cản trước và đánh bóng toàn thân xe",
      status: "CANCELED",
      cancellation_reason: "Khách bận chuyến công tác đột xuất",
      priority_type: "NORMAL"
    }, { transaction });

    await db.Appointment_Details.create({
      appointment_id: app4.id,
      service_id: services[3].id,
      notes: "Sơn sấy và đánh bóng"
    }, { transaction });

    console.log("-> Seeded Appointment 4: CANCELED Appointment from yesterday");

    // Appointment 5: PENDING Appointment for next week
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const appTime5 = new Date(nextWeek);
    appTime5.setHours(15, 30, 0, 0);

    const app5 = await db.Appointments.create({
      customer_id: customers[1].id,
      vehicle_id: vehicles[1].id,
      booking_type: "MAINTENANCE",
      scheduled_time: appTime5,
      notes: "Thay nhớt hộp số và bảo dưỡng phanh",
      status: "PENDING",
      priority_type: "NORMAL"
    }, { transaction });

    await db.Appointment_Details.create({
      appointment_id: app5.id,
      service_id: services[4].id,
      notes: "Bảo dưỡng tổng thể"
    }, { transaction });

    console.log("-> Seeded Appointment 5: PENDING Appointment for next week");

    // Scenario 2: Active Service Order under inspection with PENDING Quotation
    const entryTime2 = new Date();
    entryTime2.setMinutes(entryTime2.getMinutes() - 45); // Checked in 45 mins ago

    const so2 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[1].id,
      receptionist_id: receptionistId,
      bay_id: bay1Id,
      bay_status: "ASSIGNED",
      current_odo: 45000,
      status: "INSPECTING",
      symptoms: "Tiếng rít chói tai dưới gầm khi phanh xe",
      entry_time: entryTime2
    }, { transaction });

    const inspectionTask2 = await db.Task.create({
      service_order_id: so2.id,
      type: "INSPECTION",
      status: "COMPLETED",
      createdAt: entryTime2,
      updatedAt: new Date(entryTime2.getTime() + 20 * 60 * 1000)
    }, { transaction });

    const quote2 = await db.Quotations.create({
      task_id: inspectionTask2.id,
      created_by: receptionistId,
      total_amount: 1450000,
      status: "PENDING",
      note: "Yêu cầu thay thế má phanh trước",
      deposit_amount: 0,
      createdAt: new Date(entryTime2.getTime() + 25 * 60 * 1000)
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote2.id,
      service_id: services[1].id, // "Bảo dưỡng hệ thống phanh"
      quantity: 1,
      unit_price: 0,
      repair_price: 250000,
      amount: 250000,
      status: "RECEIVED"
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote2.id,
      spare_part_id: spareParts[0].id, // "Má phanh"
      quantity: 1,
      unit_price: 1200000,
      repair_price: 0,
      amount: 1200000,
      status: "RECEIVED"
    }, { transaction });

    console.log("-> Seeded Scenario 2: Service Order inspecting with PENDING Quotation");

    // Scenario 3: Completed Service Order waiting for checkout (payment status defaults to unpaid)
    const entryTime3 = new Date();
    entryTime3.setHours(entryTime3.getHours() - 3); // Started 3 hours ago

    const so3 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[2].id,
      receptionist_id: receptionistId,
      bay_id: bay2Id,
      bay_status: "ASSIGNED",
      current_odo: 12000,
      status: "COMPLETED",
      symptoms: "Bảo dưỡng mốc 10.000km và thay dầu động cơ",
      entry_time: entryTime3,
      actual_finish_time: new Date()
    }, { transaction });

    const inspectionTask3 = await db.Task.create({
      service_order_id: so3.id,
      type: "INSPECTION",
      status: "COMPLETED",
      createdAt: entryTime3
    }, { transaction });

    const quote3 = await db.Quotations.create({
      task_id: inspectionTask3.id,
      created_by: receptionistId,
      total_amount: 650000,
      status: "APPROVED",
      approved_at: new Date(entryTime3.getTime() + 30 * 60 * 1000),
      createdAt: entryTime3
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote3.id,
      service_id: services[0].id,
      quantity: 1,
      unit_price: 0,
      repair_price: 150000,
      amount: 150000,
      status: "RECEIVED"
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote3.id,
      spare_part_id: spareParts[0].id,
      quantity: 1,
      unit_price: 500000,
      repair_price: 0,
      amount: 500000,
      status: "RECEIVED"
    }, { transaction });

    await db.Task.create({
      service_order_id: so3.id,
      service_catalog_id: services[0].id,
      type: "REPAIR",
      status: "COMPLETED"
    }, { transaction });

    console.log("-> Seeded Scenario 3: COMPLETED Service Order awaiting payment");

    // NEW Scenario 9: COMPLETED and PAID Service Order (Ready for Review)
    const entryTime9 = new Date();
    entryTime9.setHours(entryTime9.getHours() - 5);

    const so9 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[0].id,
      receptionist_id: receptionistId,
      bay_id: bay1Id,
      bay_status: "ASSIGNED",
      current_odo: 25000,
      status: "COMPLETED",
      symptoms: "Bảo dưỡng hệ thống điều hòa xe ô tô",
      entry_time: entryTime9,
      actual_finish_time: new Date(entryTime9.getTime() + 3 * 60 * 60 * 1000)
    }, { transaction });

    const inspectionTask9 = await db.Task.create({
      service_order_id: so9.id,
      type: "INSPECTION",
      status: "COMPLETED",
      createdAt: entryTime9
    }, { transaction });

    const quote9 = await db.Quotations.create({
      task_id: inspectionTask9.id,
      created_by: receptionistId,
      total_amount: 800000,
      status: "APPROVED",
      approved_at: new Date(entryTime9.getTime() + 30 * 60 * 1000),
      createdAt: entryTime9
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote9.id,
      service_id: services[2].id, // Bảo dưỡng điều hòa
      quantity: 1,
      unit_price: 0,
      repair_price: 300000,
      amount: 300000,
      status: "RECEIVED"
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote9.id,
      spare_part_id: spareParts[0].id,
      quantity: 1,
      unit_price: 500000,
      repair_price: 0,
      amount: 500000,
      status: "RECEIVED"
    }, { transaction });

    await db.Task.create({
      service_order_id: so9.id,
      service_catalog_id: services[2].id,
      type: "REPAIR",
      status: "COMPLETED"
    }, { transaction });

    // Paid payment transaction details
    const bp9 = await db.Booking_Payments.create({
      order_id: so9.id,
      payment_method: "CASH",
      payment_gateway: "CASH",
      amount: 800000,
      currency: "VND",
      payment_status: "PAID",
      transaction_code: `TX-${so9.id}-999999`,
      paid_at: new Date()
    }, { transaction });

    console.log("-> Seeded Scenario 9: COMPLETED and PAID Service Order (Ready for Review)");

    // Scenario 10: COMPLETED and PAID Service Order 2 weeks ago
    const entryTime10 = new Date();
    entryTime10.setDate(entryTime10.getDate() - 15);

    const so10 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[0].id,
      receptionist_id: receptionistId,
      bay_id: bay1Id,
      bay_status: "ASSIGNED",
      current_odo: 24200,
      status: "COMPLETED",
      symptoms: "Thay thế chổi gạt mưa và cân bằng động bánh xe",
      entry_time: entryTime10,
      actual_finish_time: new Date(entryTime10.getTime() + 2 * 60 * 60 * 1000)
    }, { transaction });

    const inspectionTask10 = await db.Task.create({
      service_order_id: so10.id,
      type: "INSPECTION",
      status: "COMPLETED",
      createdAt: entryTime10
    }, { transaction });

    const quote10 = await db.Quotations.create({
      task_id: inspectionTask10.id,
      created_by: receptionistId,
      total_amount: 450000,
      status: "APPROVED",
      approved_at: new Date(entryTime10.getTime() + 15 * 60 * 1000),
      createdAt: entryTime10
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote10.id,
      service_id: services[3].id, // Cân bằng động bánh xe / Thay gạt mưa
      quantity: 1,
      unit_price: 0,
      repair_price: 150000,
      amount: 150000,
      status: "RECEIVED"
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote10.id,
      spare_part_id: spareParts[0].id,
      quantity: 1,
      unit_price: 300000,
      repair_price: 0,
      amount: 300000,
      status: "RECEIVED"
    }, { transaction });

    await db.Task.create({
      service_order_id: so10.id,
      service_catalog_id: services[3].id,
      type: "REPAIR",
      status: "COMPLETED"
    }, { transaction });

    await db.Booking_Payments.create({
      order_id: so10.id,
      payment_method: "BANK_TRANSFER",
      payment_gateway: "VNPAY",
      amount: 450000,
      currency: "VND",
      payment_status: "PAID",
      transaction_code: `TX-${so10.id}-888888`,
      paid_at: entryTime10
    }, { transaction });

    console.log("-> Seeded Scenario 10: COMPLETED and PAID Service Order 2 weeks ago");

    // Scenario 11: COMPLETED and PAID Service Order 30 days ago
    const entryTime11 = new Date();
    entryTime11.setDate(entryTime11.getDate() - 30);

    const so11 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[0].id,
      receptionist_id: receptionistId,
      bay_id: bay2Id,
      bay_status: "ASSIGNED",
      current_odo: 23000,
      status: "COMPLETED",
      symptoms: "Bảo dưỡng định kỳ mốc 20.000km và thay dầu phanh",
      entry_time: entryTime11,
      actual_finish_time: new Date(entryTime11.getTime() + 4 * 60 * 60 * 1000)
    }, { transaction });

    const inspectionTask11 = await db.Task.create({
      service_order_id: so11.id,
      type: "INSPECTION",
      status: "COMPLETED",
      createdAt: entryTime11
    }, { transaction });

    const quote11 = await db.Quotations.create({
      task_id: inspectionTask11.id,
      created_by: receptionistId,
      total_amount: 1200000,
      status: "APPROVED",
      approved_at: new Date(entryTime11.getTime() + 20 * 60 * 1000),
      createdAt: entryTime11
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote11.id,
      service_id: services[1].id, // Bảo dưỡng hệ thống phanh
      quantity: 1,
      unit_price: 0,
      repair_price: 400000,
      amount: 400000,
      status: "RECEIVED"
    }, { transaction });

    await db.Quotation_Details.create({
      quotation_id: quote11.id,
      spare_part_id: spareParts[0].id,
      quantity: 1,
      unit_price: 800000,
      repair_price: 0,
      amount: 800000,
      status: "RECEIVED"
    }, { transaction });

    await db.Task.create({
      service_order_id: so11.id,
      service_catalog_id: services[1].id,
      type: "REPAIR",
      status: "COMPLETED"
    }, { transaction });

    await db.Booking_Payments.create({
      order_id: so11.id,
      payment_method: "BANK_TRANSFER",
      payment_gateway: "VNPAY",
      amount: 1200000,
      currency: "VND",
      payment_status: "PAID",
      transaction_code: `TX-${so11.id}-777777`,
      paid_at: entryTime11
    }, { transaction });

    console.log("-> Seeded Scenario 11: COMPLETED and PAID Service Order 30 days ago");

    // ----------------------------------------------------
    // SCENARIOS FOR TECHNICIANS & LEAD
    // ----------------------------------------------------

    // Scenario 4: Inspection task pending assignment (Tổ trưởng giao việc)
    const entryTime4 = new Date();
    entryTime4.setMinutes(entryTime4.getMinutes() - 15);

    const so4 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[0].id,
      receptionist_id: receptionistId,
      bay_id: bay1Id,
      bay_status: "WAITING",
      status: "INSPECTING",
      symptoms: "Khói đen xả ra nhiều từ ống bô khi nổ máy",
      entry_time: entryTime4
    }, { transaction });

    await db.Task.create({
      service_order_id: so4.id,
      type: "INSPECTION",
      status: "PENDING",
      createdAt: entryTime4
    }, { transaction });

    console.log("-> Seeded Scenario 4: Inspection Task pending assignment");

    // Scenario 5: Repair task waiting for QC (Chờ nghiệm thu chất lượng)
    const entryTime5 = new Date();
    entryTime5.setHours(entryTime5.getHours() - 2);

    const so5 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[1].id,
      receptionist_id: receptionistId,
      bay_id: bay2Id,
      bay_status: "ASSIGNED",
      status: "IN_PROGRESS",
      symptoms: "Hệ thống làm lạnh điều hòa kém",
      entry_time: entryTime5
    }, { transaction });

    const repairTask5 = await db.Task.create({
      service_order_id: so5.id,
      service_catalog_id: services[2].id, 
      type: "REPAIR",
      status: "IN_PROGRESS",
      createdAt: entryTime5
    }, { transaction });

    await db.Task_Assignment.create({
      task_id: repairTask5.id,
      technician_id: tech1Id, // Lê Thợ Máy
      bay_id: bay2Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      actual_start_time: entryTime5,
      status: "PENDING_QC"
    }, { transaction });

    console.log("-> Seeded Scenario 5: Task Assignment in PENDING_QC status");

    // Scenario 6: Task ASSIGNED but not started yet (Lê Thợ Máy)
    const entryTime6 = new Date();
    entryTime6.setMinutes(entryTime6.getMinutes() - 30);

    const so6 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[2].id,
      receptionist_id: receptionistId,
      bay_id: bay1Id,
      bay_status: "ASSIGNED",
      status: "IN_PROGRESS",
      symptoms: "Lệch lái nhẹ sang phải khi chạy thẳng",
      entry_time: entryTime6
    }, { transaction });

    const repairTask6 = await db.Task.create({
      service_order_id: so6.id,
      service_catalog_id: services[3].id, 
      type: "REPAIR",
      status: "PENDING",
      createdAt: entryTime6
    }, { transaction });

    await db.Task_Assignment.create({
      task_id: repairTask6.id,
      technician_id: tech1Id, 
      bay_id: bay1Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      status: "ASSIGNED"
    }, { transaction });

    console.log("-> Seeded Scenario 6: Task ASSIGNED to tech1");

    // Scenario 7: Task IN_PROGRESS (Trần Văn Sửa)
    const entryTime7 = new Date();
    entryTime7.setMinutes(entryTime7.getMinutes() - 60);

    const so7 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[0].id,
      receptionist_id: receptionistId,
      bay_id: bay2Id,
      bay_status: "ASSIGNED",
      status: "IN_PROGRESS",
      symptoms: "Cần thay thế lọc gió động cơ và làm sạch bugi",
      entry_time: entryTime7
    }, { transaction });

    const repairTask7 = await db.Task.create({
      service_order_id: so7.id,
      service_catalog_id: services[4].id,
      type: "REPAIR",
      status: "IN_PROGRESS",
      createdAt: entryTime7
    }, { transaction });

    await db.Task_Assignment.create({
      task_id: repairTask7.id,
      technician_id: tech2Id, 
      bay_id: bay2Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      actual_start_time: entryTime7,
      status: "IN_PROGRESS"
    }, { transaction });

    console.log("-> Seeded Scenario 7: Task IN_PROGRESS for tech2");

    // Scenario 8: Task WAITING_STOCK (Phạm Hoàng Máy)
    const entryTime8 = new Date();
    entryTime8.setHours(entryTime8.getHours() - 4);

    const so8 = await db.Service_Orders.create({
      appointment_id: null,
      vehicle_id: vehicles[1].id,
      receptionist_id: receptionistId,
      bay_id: bay1Id,
      bay_status: "ASSIGNED",
      status: "WAITING_FOR_PARTS",
      symptoms: "Chảy dầu giảm xóc sau cần thay phuộc mới",
      entry_time: entryTime8
    }, { transaction });

    const repairTask8 = await db.Task.create({
      service_order_id: so8.id,
      service_catalog_id: services[1].id,
      type: "REPAIR",
      status: "WAITING_STOCK",
      createdAt: entryTime8
    }, { transaction });

    await db.Task_Assignment.create({
      task_id: repairTask8.id,
      technician_id: tech3Id, 
      bay_id: bay1Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      actual_start_time: entryTime8,
      status: "WAITING_STOCK"
    }, { transaction });

    console.log("-> Seeded Scenario 8: Task WAITING_STOCK for tech3");

    // --- Historical completed tasks to populate technicians' profile stats ---
    const pastTime1 = new Date();
    pastTime1.setDate(pastTime1.getDate() - 5);
    const soPast1 = await db.Service_Orders.create({
      vehicle_id: vehicles[0].id,
      receptionist_id: receptionistId,
      status: "COMPLETED",
      symptoms: "Bảo dưỡng 5.000km định kỳ",
      entry_time: pastTime1,
      actual_finish_time: pastTime1
    }, { transaction });
    const taskPast1 = await db.Task.create({
      service_order_id: soPast1.id,
      service_catalog_id: services[0].id,
      type: "REPAIR",
      status: "COMPLETED",
      createdAt: pastTime1
    }, { transaction });
    await db.Task_Assignment.create({
      task_id: taskPast1.id,
      technician_id: tech1Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      status: "COMPLETED",
      actual_start_time: pastTime1,
      actual_end_time: pastTime1
    }, { transaction });

    const pastTime2 = new Date();
    pastTime2.setDate(pastTime2.getDate() - 10);
    const soPast2 = await db.Service_Orders.create({
      vehicle_id: vehicles[1].id,
      receptionist_id: receptionistId,
      status: "COMPLETED",
      symptoms: "Lắp đặt cảm biến áp suất lốp",
      entry_time: pastTime2,
      actual_finish_time: pastTime2
    }, { transaction });
    const taskPast2 = await db.Task.create({
      service_order_id: soPast2.id,
      service_catalog_id: services[3].id,
      type: "REPAIR",
      status: "COMPLETED",
      createdAt: pastTime2
    }, { transaction });
    await db.Task_Assignment.create({
      task_id: taskPast2.id,
      technician_id: tech2Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      status: "COMPLETED",
      actual_start_time: pastTime2,
      actual_end_time: pastTime2
    }, { transaction });

    const pastTime3 = new Date();
    pastTime3.setDate(pastTime3.getDate() - 12);
    const soPast3 = await db.Service_Orders.create({
      vehicle_id: vehicles[2].id,
      receptionist_id: receptionistId,
      status: "COMPLETED",
      symptoms: "Vệ sinh buồng đốt động cơ",
      entry_time: pastTime3,
      actual_finish_time: pastTime3
    }, { transaction });
    const taskPast3 = await db.Task.create({
      service_order_id: soPast3.id,
      service_catalog_id: services[4].id,
      type: "REPAIR",
      status: "COMPLETED",
      createdAt: pastTime3
    }, { transaction });
    await db.Task_Assignment.create({
      task_id: taskPast3.id,
      technician_id: tech3Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      status: "COMPLETED",
      actual_start_time: pastTime3,
      actual_end_time: pastTime3
    }, { transaction });

    console.log("-> Seeded historical completed tasks for technicians");

    // --- Additional service orders and tasks for Task Assignment section ---
    const activeTime1 = new Date();
    activeTime1.setMinutes(activeTime1.getMinutes() - 30);
    const soActive1 = await db.Service_Orders.create({
      vehicle_id: vehicles[0].id,
      receptionist_id: receptionistId,
      bay_id: bay1Id,
      bay_status: "ASSIGNED",
      status: "IN_PROGRESS",
      symptoms: "Thay thế dầu hộp số tuần hoàn và vệ sinh lọc gió",
      entry_time: activeTime1
    }, { transaction });
    await db.Task.create({
      service_order_id: soActive1.id,
      service_catalog_id: services[0].id,
      type: "REPAIR",
      status: "PENDING",
      createdAt: activeTime1
    }, { transaction });
    await db.Task.create({
      service_order_id: soActive1.id,
      service_catalog_id: services[3].id,
      type: "REPAIR",
      status: "PENDING",
      createdAt: activeTime1
    }, { transaction });

    const activeTime2 = new Date();
    activeTime2.setMinutes(activeTime2.getMinutes() - 10);
    const soActive2 = await db.Service_Orders.create({
      vehicle_id: vehicles[2].id,
      receptionist_id: receptionistId,
      bay_id: bay2Id,
      bay_status: "ASSIGNED",
      status: "INSPECTING",
      symptoms: "Kiểm tra chẩn đoán lỗi hệ thống phanh ABS hiển thị trên taplo",
      entry_time: activeTime2
    }, { transaction });
    await db.Task.create({
      service_order_id: soActive2.id,
      type: "INSPECTION",
      status: "PENDING",
      createdAt: activeTime2
    }, { transaction });

    console.log("-> Seeded unassigned pending tasks for task allocation");

    // --- Additional service orders and tasks for Task Tracking section ---
    const trackingTime1 = new Date();
    trackingTime1.setHours(trackingTime1.getHours() - 1);
    const soTracking1 = await db.Service_Orders.create({
      vehicle_id: vehicles[1].id,
      receptionist_id: receptionistId,
      bay_id: bay1Id,
      bay_status: "ASSIGNED",
      status: "IN_PROGRESS",
      symptoms: "Cân chỉnh thước lái góc đặt bánh xe và cân bằng động",
      entry_time: trackingTime1
    }, { transaction });
    const taskTrack1a = await db.Task.create({
      service_order_id: soTracking1.id,
      service_catalog_id: services[3].id,
      type: "REPAIR",
      status: "IN_PROGRESS",
      createdAt: trackingTime1
    }, { transaction });
    await db.Task_Assignment.create({
      task_id: taskTrack1a.id,
      technician_id: tech2Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      status: "IN_PROGRESS",
      actual_start_time: trackingTime1
    }, { transaction });
    const taskTrack1b = await db.Task.create({
      service_order_id: soTracking1.id,
      service_catalog_id: services[2].id,
      type: "REPAIR",
      status: "PENDING",
      createdAt: trackingTime1
    }, { transaction });
    await db.Task_Assignment.create({
      task_id: taskTrack1b.id,
      technician_id: tech3Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      status: "ASSIGNED"
    }, { transaction });

    const trackingTime2 = new Date();
    trackingTime2.setHours(trackingTime2.getHours() - 2);
    const soTracking2 = await db.Service_Orders.create({
      vehicle_id: vehicles[2].id,
      receptionist_id: receptionistId,
      bay_id: bay2Id,
      bay_status: "ASSIGNED",
      status: "WAITING_FOR_PARTS",
      symptoms: "Thay cao su đệm chân máy và dây curoa động cơ",
      entry_time: trackingTime2
    }, { transaction });
    const taskTrack2a = await db.Task.create({
      service_order_id: soTracking2.id,
      service_catalog_id: services[1].id,
      type: "REPAIR",
      status: "WAITING_STOCK",
      createdAt: trackingTime2
    }, { transaction });
    await db.Task_Assignment.create({
      task_id: taskTrack2a.id,
      technician_id: tech1Id,
      role_in_task: "LEAD",
      contribution_percent: 100,
      status: "WAITING_STOCK",
      actual_start_time: trackingTime2
    }, { transaction });

    console.log("-> Seeded additional active tracking tasks");

    // --- Additional unquoted issue reports for "Tạo báo giá" ---
    const issueTime1 = new Date();
    issueTime1.setMinutes(issueTime1.getMinutes() - 25);
    const soIssue1 = await db.Service_Orders.create({
      vehicle_id: vehicles[1].id,
      receptionist_id: receptionistId,
      status: "PENDING_QUOTATION",
      symptoms: "Hệ thống treo trước kêu lục cục khi đi qua gờ giảm tốc",
      entry_time: issueTime1
    }, { transaction });
    const taskIssue1 = await db.Task.create({
      service_order_id: soIssue1.id,
      type: "INSPECTION",
      status: "COMPLETED",
      createdAt: issueTime1
    }, { transaction });
    await db.Vehicle_Issues.create({
      component_id: 1, // Hệ thống phanh
      task_id: taskIssue1.id,
      error_description: "Má phanh trước mòn vẹt lộ kim loại báo mòn",
      note: "Cần thay mới má phanh trước"
    }, { transaction });
    await db.Vehicle_Issues.create({
      component_id: 2, // Hệ thống điều hòa
      task_id: taskIssue1.id,
      error_description: "Lọc gió điều hòa bám nhiều bụi bẩn và tắc nghẽn",
      note: "Vệ sinh hoặc thay thế lọc gió điều hòa"
    }, { transaction });

    const issueTime2 = new Date();
    issueTime2.setMinutes(issueTime2.getMinutes() - 15);
    const soIssue2 = await db.Service_Orders.create({
      vehicle_id: vehicles[2].id,
      receptionist_id: receptionistId,
      status: "PENDING_QUOTATION",
      symptoms: "Đèn check engine sáng và hao nước làm mát",
      entry_time: issueTime2
    }, { transaction });
    const taskIssue2 = await db.Task.create({
      service_order_id: soIssue2.id,
      type: "INSPECTION",
      status: "COMPLETED",
      createdAt: issueTime2
    }, { transaction });
    await db.Vehicle_Issues.create({
      component_id: 3, // Động cơ
      task_id: taskIssue2.id,
      error_description: "Rò rỉ nước làm mát tại đường ống dẫn nước chính",
      note: "Cần thay thế đường ống nước làm mát"
    }, { transaction });

    console.log("-> Seeded more unquoted issue reports for quote creation");

    await transaction.commit();
    console.log("✅ ALL LIVE SCENARIOS SEEDED SUCCESSFULLY!");
  } catch (err) {
    await transaction.rollback();
    console.error("❌ ERROR SEEDING LIVE SCENARIOS:", err);
  } finally {
    process.exit(0);
  }
}

run();
