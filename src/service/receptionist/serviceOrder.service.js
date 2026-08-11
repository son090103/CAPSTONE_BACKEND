const db = require("../../../models");
const { Op } = require("sequelize");
const { calculateTotalServicePrice } = require("../../util/calculateServicePrice.util");
const { notifyUser } = require("../../util/notification.util");
const assignQueuedOrders = require("../../util/assignQueuedOrders.util");
const Quotation = db.Quotations;
const QuotationDetail = db.Quotation_Details;
const SparePart = db.Spare_Parts;
const Task = db.Task;
const Issues = db.Vehicle_Issues;
const Components = db.Vehicle_Components;
const Tasks = db.Task;
const Task_Assignment = db.Task_Assignment;
const Service_Order = db.Service_Orders;
const Appointment = db.Appointments;
const Customers = db.Customers;
const Users = db.User;
const Vehicles = db.Vehicles;
const Vehicle_Models = db.Vehicle_Models;
const Vehicle_Makes = db.Vehicle_Makes;
const Service_Catalog = db.Service_Catalog;
const Quotation_Details = db.Quotation_Details;
const Vehicle_Components = db.Vehicle_Components;
const Vehicle_Issues = db.Vehicle_Issues;

module.exports.createServiceOrder = async (data, receptionistId) => {
  if (!data.symptoms || !data.symptoms.trim()) {
    throw {
      status: 400,
      message: "Vui lòng ghi mô tả tình trạng xe lúc tiếp nhận.",
    };
  }

  const transaction = await db.sequelize.transaction();

  try {
    let actualVehicleId = data.vehicle_id;
    let actualAppointmentId = data.appointment_id;
    // Chỉ appointment_id có sẵn từ trước mới đại diện cho một lịch đã giữ chỗ.
    // Appointment được tự tạo trong chính request này vẫn là lượt đến trực tiếp.
    const hasReservedAppointment = Boolean(data.appointment_id);

    // Xử lý khách vãng lai nếu không có vehicle_id
    if (!actualVehicleId && data.walk_in) {
      let phoneToUse = data.walk_in.customer_phone;

      // SĐT đã có khách hàng trong hệ thống — không âm thầm dùng lại/ghi đè tên, bắt lễ tân
      // chuyển qua chọn khách hàng có sẵn (tránh lưu nhầm tên khác cho cùng 1 khách).
      const existingCustomer = await db.Customers.findOne({
        where: { phone: phoneToUse },
        transaction,
      });
      if (existingCustomer) {
        throw {
          status: 409,
          message: `Số điện thoại này đã thuộc về khách hàng "${existingCustomer.name || 'chưa rõ tên'}" trong hệ thống. Vui lòng chọn khách hàng có sẵn thay vì tạo mới.`,
        };
      }

      // 1. Tạo Customer mới
      let customer = await db.Customers.create({
        phone: phoneToUse,
        user_id: null,
        name: data.walk_in.customer_name || null,
        membership_tier: "BRONZE",
        loyalty_points: 0,
      }, { transaction });

      // 2. Lấy hoặc tạo Brand (Make)
      let [make] = await db.Vehicle_Makes.findOrCreate({
        where: { make_name: data.walk_in.brand_name },
        transaction,
      });

      // 3. Lấy hoặc tạo Model
      let [model] = await db.Vehicle_Models.findOrCreate({
        where: {
          model_name: data.walk_in.model_name,
          make_id: make.id,
        },
        transaction,
      });

      // Chuẩn hóa biển số xe (Viết hoa, xóa khoảng trắng thừa ở 2 đầu)
      let plateToUse = data.walk_in.vehicle_plate;
      if (plateToUse) {
        plateToUse = plateToUse.trim().toUpperCase();
      }

      // 4. Tạo hoặc lấy Vehicle
      let yearVal = data.walk_in.vehicle_year
        ? Number(data.walk_in.vehicle_year)
        : new Date().getFullYear();
      let [vehicleRecord] = await db.Vehicles.findOrCreate({
        where: { license_plate: plateToUse },
        defaults: {
          customer_id: customer.id,
          model_id: model.id,
          year: yearVal,
          color: data.walk_in.vehicle_color || null,
          avg_daily_mileage: 0,
        },
        transaction,
      });

      actualVehicleId = vehicleRecord.id;
    }

    // 2. Kiểm tra xe tồn tại
    const vehicle = await db.Vehicles.findByPk(actualVehicleId, {
      transaction,
    });
    if (!vehicle) {
      throw { status: 404, message: "Xe không tồn tại" };
    }

    // 3. Nếu KHÔNG có appointment_id (Khách vãng lai đến trực tiếp - có thể là khách cũ hoặc mới)
    let currentBookingType = "WALK_IN";
    if (!actualAppointmentId) {
      // Lấy customer_id từ xe
      const customerId = vehicle.customer_id;

      // Tự động phân loại: nếu có chọn sẵn dịch vụ/combo thì là SPECIFIC, ngược lại là REPAIR
      let autoBookingType = "WALK_IN_REPAIR";
      if (
        (data.service_ids && data.service_ids.length > 0) ||
        (data.combo_ids && data.combo_ids.length > 0)
      ) {
        autoBookingType = "WALK_IN_SPECIFIC";
      }

      // Tạo Appointment cho khách đến trực tiếp
      const newAppointment = await db.Appointments.create(
        {
          customer_id: customerId,
          vehicle_id: actualVehicleId,
          booking_type: autoBookingType,
          scheduled_time: data.estimated_finish_time ? new Date(data.estimated_finish_time) : new Date(),
          status: "IN_PROGRESS",
          notes: data.notes || "Tạo tự động cho khách đến trực tiếp tại Gara",
        },
        { transaction },
      );

      actualAppointmentId = newAppointment.id;
      currentBookingType = autoBookingType;

      // Tạo Appointment_Details
      if (data.service_ids && data.service_ids.length > 0) {
        const details = data.service_ids.map((id) => ({
          appointment_id: actualAppointmentId,
          catalog_id: id,
        }));
        await db.Appointment_Details.bulkCreate(details, { transaction });
      }

      if (data.combo_ids && data.combo_ids.length > 0) {
        const comboDetails = data.combo_ids.map((id) => ({
          appointment_id: actualAppointmentId,
          combo_id: id,
        }));
        await db.Appointment_Details.bulkCreate(comboDetails, { transaction });
      }
    } else {
      const appointment = await db.Appointments.findByPk(actualAppointmentId, { transaction });
      if (appointment) {
        currentBookingType = appointment.booking_type || "WALK_IN";
      }
    }

    // Khách vãng lai vẫn được tiếp nhận khi công suất đã được lịch hẹn đặt trước giữ chỗ,
    // nhưng lệnh dịch vụ phải vào hàng chờ và tuyệt đối chưa được chiếm cầu nâng.
    // Lịch đặt trước không đi qua nhánh WALK nên vẫn được phân cầu bình thường khi tạo lệnh.
    let mustWaitForReservedBay = false;
    let calculatedWalkInFinishTime = null;

    // Kiểm tra công suất đối với khách vãng lai (Walk-in)
    const isWalkIn = !hasReservedAppointment || (currentBookingType && currentBookingType.includes("WALK"));
    if (isWalkIn) {
      // Calculate estimated duration
      let totalDurationMinutes = 0;
      if (data.service_ids && data.service_ids.length > 0) {
        const catalogs = await db.Service_Catalog.findAll({
          where: { id: { [Op.in]: data.service_ids } },
          transaction,
        });
        catalogs.forEach((c) => {
          totalDurationMinutes += parseInt(c.estimated_duration || 30, 10);
        });
      }
      if (data.combo_ids && data.combo_ids.length > 0) {
        const comboCatalogs = await db.Service_Combo_Catalogs.findAll({
          where: { combo_id: { [Op.in]: data.combo_ids } },
          include: [{ model: db.Service_Catalog, as: "catalog" }],
          transaction,
        });
        comboCatalogs.forEach((cc) => {
          totalDurationMinutes += parseInt(cc.catalog?.estimated_duration || 30, 10);
        });
      }
      if (totalDurationMinutes === 0) {
        const config = await db.Garage_Configurations.findOne({
          where: { config_key: "DEFAULT_DIAGNOSIS_MINUTES" },
          transaction,
        });
        totalDurationMinutes = config && !isNaN(parseInt(config.config_value, 10))
          ? parseInt(config.config_value, 10)
          : 60;
      }

      const entryTime = new Date();
      const estimatedFinishTime = new Date(entryTime.getTime() + totalDurationMinutes * 60 * 1000);
      calculatedWalkInFinishTime = estimatedFinishTime;

      const getGarageCapacity = require("../../util/getGarageCapacity.util");
      const capacityData = await getGarageCapacity();
      const capacity = capacityData.maxCapacity;

      const startOfDay = new Date(entryTime);
      startOfDay.setUTCHours(0,0,0,0);
      const endOfDay = new Date(entryTime);
      endOfDay.setUTCHours(23,59,59,999);

      const appointments = await db.Appointments.findAll({
        where: {
          scheduled_time: { [Op.between]: [startOfDay, endOfDay] },
          booking_type: { [Op.notLike]: '%WALK%' },
          status: { [Op.in]: ['PENDING', 'CONFIRMED', 'INFORMATION_RECEIVED'] },
          id: { [Op.ne]: actualAppointmentId || 0 }
        },
        include: [{ model: db.Appointment_Details, as: 'appointmentDetails' }],
        transaction
      });

      const activeOrders = await db.Service_Orders.findAll({
        where: {
          status: { [Op.in]: ['INSPECTING', 'IN_PROGRESS', 'WAITING_FOR_PARTS'] },
          bay_status: 'ASSIGNED',
          bay_id: { [Op.ne]: null },
          estimated_finish_time: { [Op.ne]: null, [Op.gt]: startOfDay },
          entry_time: { [Op.lt]: endOfDay }
        },
        transaction
      });

      const { calculateAppointmentTime } = require("../../util/calculateAppointmentTime.util");

      const bookedCounts = {};
      const getOccupiedHours = (startTime, endTime) => {
        if (endTime <= startOfDay || startTime >= endOfDay) return [];
        const effectiveStart = startTime < startOfDay ? startOfDay : startTime;
        const effectiveEnd = endTime > endOfDay ? endOfDay : endTime;
        const startHour = effectiveStart.getUTCHours();
        let endHour = effectiveEnd.getUTCHours();
        if (effectiveEnd.getMinutes() === 0 && effectiveEnd.getSeconds() === 0 && endHour > startHour) {
          endHour -= 1;
        }
        const hours = [];
        for (let h = startHour; h <= endHour; h++) {
          hours.push(h);
        }
        return hours;
      };

      await Promise.all(appointments.map(async (app) => {
        const timeStart = app.scheduled_time;
        const { endTime } = await calculateAppointmentTime(app.appointmentDetails, timeStart);
        const occupiedHours = getOccupiedHours(timeStart, endTime);
        occupiedHours.forEach(h => {
          bookedCounts[h] = (bookedCounts[h] || 0) + 1;
        });
      }));

      activeOrders.forEach(order => {
        const occupiedHours = getOccupiedHours(order.entry_time, order.estimated_finish_time);
        occupiedHours.forEach(h => {
          bookedCounts[h] = (bookedCounts[h] || 0) + 1;
        });
      });

      // Luôn bảo vệ tối thiểu 60 phút lịch sắp tới. Ví dụ xe vãng lai đến 09:45
      // thì các lịch 10:00 vẫn phải được giữ cầu, kể cả dịch vụ walk-in rất ngắn.
      const minimumReservationHorizon = new Date(entryTime.getTime() + 60 * 60 * 1000);
      const reservationCheckEndTime = estimatedFinishTime > minimumReservationHorizon
        ? estimatedFinishTime
        : minimumReservationHorizon;
      const protectedWalkInHours = getOccupiedHours(entryTime, reservationCheckEndTime);
      for (const h of protectedWalkInHours) {
        const currentCount = bookedCounts[h] || 0;
        if (currentCount >= capacity) {
          mustWaitForReservedBay = true;
          break;
        }
      }
    }

    // 2. Xác định Service_Order này có cần cầu nâng hay không, dựa trên các dịch vụ đã chọn
    // (kể cả dịch vụ nằm trong combo). Không có dịch vụ cụ thể nào (vd REPAIR chưa rõ hạng mục)
    // thì mặc định coi là cần cầu nâng để an toàn.
    const catalogIdsToCheck = new Set(data.service_ids || []);
    if (data.combo_ids && data.combo_ids.length > 0) {
      const comboCatalogs = await db.Service_Combo_Catalogs.findAll({
        where: { combo_id: { [Op.in]: data.combo_ids } },
        transaction,
      });
      comboCatalogs.forEach((cc) => catalogIdsToCheck.add(cc.catalog_id));
    }

    let needsBay = true;
    if (catalogIdsToCheck.size > 0) {
      const catalogs = await db.Service_Catalog.findAll({
        where: { id: { [Op.in]: Array.from(catalogIdsToCheck) } },
        attributes: ["id", "requires_bay"],
        transaction,
      });
      needsBay = catalogs.some((c) => c.requires_bay !== false);
    }

    // 3. Kiểm tra cầu nâng tồn tại (nếu có chọn), hoặc tự phân bổ nếu không.
    // Nguồn sự thật duy nhất về cầu nâng đang bận/rảnh là Service_Bays.status/current_service_order_id
    // (không tự đếm lại qua Service_Orders nữa).
    // Khi công suất đã được lịch đặt trước giữ chỗ, bỏ qua cả cầu do client gửi lên.
    // Xe được tạo lệnh với bay_status=WAITING và sẽ được assignQueuedOrders xử lý sau.
    let bayIdToUse = needsBay && !mustWaitForReservedBay ? data.bay_id : null;
    let forceAutoAssign = false;

    if (needsBay && bayIdToUse) {
      const bay = await db.Service_Bays.findByPk(bayIdToUse, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!bay) {
        throw { status: 404, message: "Cầu nâng không tồn tại" };
      }

      // Nếu cầu này đang bận, tự động phân bổ sang cầu khác rảnh
      if (bay.status !== "available") {
        forceAutoAssign = true;
      }
    }

    if (needsBay && !mustWaitForReservedBay && (!bayIdToUse || forceAutoAssign)) {
      const freeBay = await db.Service_Bays.findOne({
        where: { is_active: true, status: "available" },
        order: [["id", "ASC"]],
        transaction,
        lock: transaction.LOCK.UPDATE,
        skipLocked: true,
      });
      bayIdToUse = freeBay ? freeBay.id : null;
    }

    const bayStatus = !needsBay ? "NOT_NEEDED" : (bayIdToUse ? "ASSIGNED" : "WAITING");

    // 3. Xử lý lịch hẹn (nếu được truyền vào từ trước)
    if (data.appointment_id && !data.walk_in) {
      const appointment = await db.Appointments.findByPk(data.appointment_id, {
        transaction,
      });
      if (!appointment) {
        throw { status: 404, message: "Lịch hẹn không tồn tại" };
      }

      currentBookingType = appointment.booking_type;

      // Kiểm tra xem lịch hẹn đã được gán lệnh sửa chữa nào chưa
      const existingOrder = await db.Service_Orders.findOne({
        where: { appointment_id: data.appointment_id },
        transaction,
      });
      if (existingOrder) {
        throw {
          status: 400,
          message: "Lịch hẹn này đã được tạo lệnh sửa chữa",
        };
      }

      await appointment.update(
        {
          status: "IN_PROGRESS",
          notes: data.notes !== undefined ? data.notes : appointment.notes,
        },
        { transaction },
      );
    }

    // Tính toán lại estimated_finish_time nếu là Sửa chữa (REPAIR)
    let estimatedFinishTime = data.estimated_finish_time
      ? new Date(data.estimated_finish_time)
      : calculatedWalkInFinishTime;

    if (currentBookingType.includes("REPAIR")) {
      const config = await db.Garage_Configurations.findOne({
        where: { config_key: "DEFAULT_DIAGNOSIS_MINUTES" },
        transaction,
      });
      const diagnosisMinutes = config && !isNaN(parseInt(config.config_value, 10))
        ? parseInt(config.config_value, 10)
        : 60; // Mặc định 60 phút nếu chưa cấu hình

      estimatedFinishTime = data.estimated_finish_time ? new Date(data.estimated_finish_time) : new Date();
      estimatedFinishTime.setMinutes(estimatedFinishTime.getMinutes() + diagnosisMinutes);
    }

    const serviceOrder = await db.Service_Orders.create(
      {
        appointment_id: actualAppointmentId || null,
        vehicle_id: actualVehicleId,
        receptionist_id: receptionistId,
        bay_id: bayIdToUse || null,
        bay_status: bayStatus,
        current_odo: data.current_odo,
        status: "INSPECTING",
        entry_time: new Date(),
        estimated_finish_time: estimatedFinishTime,
        symptoms: data.symptoms.trim(), // Lưu tình trạng xe lúc tiếp nhận — bắt buộc, đã validate ở đầu hàm
      },
      { transaction },
    );

    if (bayIdToUse) {
      await db.Service_Bays.update(
        { status: "in_use", current_service_order_id: serviceOrder.id },
        { where: { id: bayIdToUse }, transaction },
      );
    }

    // Rescue chỉ hoàn tất quy trình khi kỹ thuật trưởng tạo Service Order từ phiếu tiếp nhận.
    const rescueRequest = data.rescue_id
      ? await db.Rescue_Requests.findByPk(data.rescue_id, { transaction, lock: transaction.LOCK.UPDATE })
      : await db.Rescue_Requests.findOne({
          where: { appointment_id: actualAppointmentId },
          transaction,
          lock: transaction.LOCK.UPDATE,
        });
    if (rescueRequest) {
      if (rescueRequest.status !== 'COMPLETED') {
        throw { status: 400, message: "Yêu cầu cứu hộ không ở trạng thái chờ tạo lệnh dịch vụ" };
      }
      if (rescueRequest.appointment_id && rescueRequest.appointment_id !== actualAppointmentId) {
        throw { status: 400, message: "Yêu cầu cứu hộ đã liên kết với phiếu tiếp nhận khác" };
      }
      rescueRequest.appointment_id = actualAppointmentId;
      rescueRequest.status = 'SERVICE_CREATED';
      await rescueRequest.save({ transaction });
    }

    // Cập nhật trạng thái Lịch hẹn đã tiếp nhận thành IN_PROGRESS
    if (actualAppointmentId) {
      await db.Appointments.update(
        { status: 'IN_PROGRESS' },
        { where: { id: actualAppointmentId }, transaction }
      );
    }

    //  const techRole = await db.Role.findOne({ where: { roleCode: 'TECHNICIAN' }, transaction });
    // let technicianId = null;

    // // Kiểm tra xem đây có phải là loại REPAIR không. Nếu có chữ REPAIR thì bỏ qua tự động gán thợ.
    // const isRepair = currentBookingType.includes('REPAIR');

    // if (techRole && !isRepair) {
    // 5. Tự động phân công thợ (Technician) rảnh rỗi nhất (CHỈ DÀNH CHO BẢO DƯỠNG/DỊCH VỤ CỤ THỂ)
    const techRole = await db.Role.findOne({
      where: { roleCode: "TECHNICIAN" },
      transaction,
    });
    let technicianId = null;

    if (techRole) {
      const technicians = await db.User.findAll({
        where: { roleId: techRole.id, status: "ACTIVE" },
        transaction,
      });
      if (technicians.length > 0) {
        const technicianTasksCount = await Promise.all(
          technicians.map(async (tech) => {
            const count = await db.Task_Assignment.count({
              where: {
                technician_id: tech.id,
                status: { [Op.in]: ["ASSIGNED", "IN_PROGRESS"] },
              },
              transaction,
            });
            return { id: tech.id, count };
          }),
        );
        technicianTasksCount.sort((a, b) => a.count - b.count);
        technicianId = technicianTasksCount[0].id;
      }
    }
    console.log("[createServiceOrder] techRole:", techRole?.id, "technicianId chọn được:", technicianId);

    // 6. Tạo Tasks cho các dịch vụ được chọn và gán thợ
    const taskCatalogs = [];
    if (data.service_ids && data.service_ids.length > 0) {
      taskCatalogs.push(...data.service_ids);
    }
    if (data.combo_ids && data.combo_ids.length > 0) {
      for (const comboId of data.combo_ids) {
        const comboCatalogs = await db.Service_Combo_Catalogs.findAll({
          where: { combo_id: comboId },
          transaction,
        });
        for (const cc of comboCatalogs) {
          taskCatalogs.push(cc.catalog_id);
        }
      }
    }

    const uniqueTaskCatalogs = [...new Set(taskCatalogs)];

    if (uniqueTaskCatalogs.length === 0) {
      // Khách sửa chữa chưa rõ bệnh -> Tạo một Task kiểm tra xe chung,
      // gắn vào dịch vụ đặc biệt "Kiểm tra hoặc sửa chữa" (labor_price = 0)
      const inspectionCatalog = await db.Service_Catalog.findOne({
        where: { labor_price: 0 },
        transaction,
      });
      const task = await db.Task.create(
        {
          service_order_id: serviceOrder.id,
          service_catalog_id: inspectionCatalog ? inspectionCatalog.id : null,
          type: "INSPECTION",
          status: "PENDING",
        },
        { transaction },
      );

      if (technicianId && bayStatus !== "WAITING") {
        await db.Task_Assignment.create(
          {
            task_id: task.id,
            technician_id: technicianId,
            bay_id: bayIdToUse || null,
            role_in_task: "LEAD",
            contribution_percent: 100,
            status: "ASSIGNED",
          },
          { transaction },
        );
      }
    } else {
      const freeCheckupCatalog = await db.Service_Catalog.findOne({
        where: { labor_price: 0 },
        transaction,
      });

      // Báo giá tự động (APPROVED) cho các dịch vụ lẻ/combo lễ tân chọn thẳng khi tạo hóa đơn —
      // cần có Quotation_Details để KTV yêu cầu xuất kho phụ tùng đi kèm dịch vụ (nếu có).
      // Quotation.task_id chỉ là điểm neo kỹ thuật (ràng buộc DB không cho null) — dùng luôn Task
      // thật của dịch vụ đầu tiên, KHÔNG tạo thêm Task INSPECTION giả không đại diện công việc nào.
      let quotation = null;
      let totalQuotationAmount = 0;

      for (const catalogId of uniqueTaskCatalogs) {
        const isFreeCheckup = freeCheckupCatalog && catalogId === freeCheckupCatalog.id;

        const catalog = await db.Service_Catalog.findByPk(catalogId, {
          include: [{ model: db.Spare_Parts, as: "sparePart" }],
          transaction,
        });
        if (!catalog) continue;

        const task = await db.Task.create(
          {
            service_order_id: serviceOrder.id,
            service_catalog_id: catalogId,
            type: isFreeCheckup ? "INSPECTION" : "REPAIR",
            status: "PENDING",
          },
          { transaction },
        );

        if (technicianId && bayStatus !== "WAITING") {
          await db.Task_Assignment.create(
            {
              task_id: task.id,
              technician_id: technicianId,
              bay_id: bayIdToUse || null,
              role_in_task: "LEAD",
              contribution_percent: 100,
              status: "ASSIGNED",
            },
            { transaction },
          );
        }

        if (!quotation) {
          quotation = await db.Quotations.create(
            {
              task_id: task.id,
              created_by: receptionistId,
              total_amount: 0,
              deposit_amount: 0,
              status: "APPROVED",
              approved_at: new Date(),
              approval_method: "RECEPTIONIST",
            },
            { transaction },
          );
        }

        const issue = await db.Vehicle_Issues.create(
          {
            task_id: task.id,
            error_description: `Dịch vụ: ${catalog.service_name}`,
            status: "RESOLVED",
          },
          { transaction },
        );

        const serviceDetail = await db.Quotation_Details.create(
          {
            quotation_id: quotation.id,
            issue_id: issue.id,
            service_id: catalogId,
            quantity: 1,
            unit_price: 0,
            repair_price: catalog.labor_price || 0,
            amount: catalog.labor_price || 0,
            status: "PENDING",
          },
          { transaction },
        );
        await task.update({ quotation_item_id: serviceDetail.id }, { transaction });

        let partAmount = 0;
        if (catalog.spare_part_id && catalog.sparePart) {
          partAmount = Number(catalog.sparePart.retail_price || 0);
          await db.Quotation_Details.create(
            {
              quotation_id: quotation.id,
              issue_id: issue.id,
              spare_part_id: catalog.spare_part_id,
              quantity: 1,
              unit_price: partAmount,
              repair_price: 0,
              amount: partAmount,
              status: "PENDING",
            },
            { transaction },
          );
        }
        totalQuotationAmount += Number(catalog.labor_price || 0) + partAmount;
      }

      if (quotation) {
        await quotation.update({ total_amount: totalQuotationAmount }, { transaction });
      }
    }

    await transaction.commit();
    console.log("[createServiceOrder] transaction commit xong, serviceOrder.id:", serviceOrder.id, "technicianId:", technicianId, "bayStatus:", bayStatus);
    if (technicianId && bayStatus !== "WAITING") {
      await notifyUser(
        technicianId,
        {
          title: "Bạn được giao công việc mới",
          content: "Bạn vừa được hệ thống tự động phân công tiếp nhận một xe mới.",
          notificationType: "SERVICE_ORDER",
          referenceId: serviceOrder.id,
        },
        "new_notification",
        { type: "TASK_ASSIGNED", serviceOrderId: serviceOrder.id },
      );
    }
    return serviceOrder;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

module.exports.getServiceOrders = async () => {
  const serviceOrders = await db.Service_Orders.findAll({
    include: [
      {
        model: db.Vehicles,
        as: "vehicle",
        attributes: ["id", "license_plate", "vin_number"],
        include: [
          {
            model: db.Vehicle_Models,
            as: "model",
            attributes: ["id", "model_name"],
            include: [
              {
                model: db.Vehicle_Makes,
                as: "make",
                attributes: ["id", "make_name"],
              },
            ],
          },
          {
            model: db.Customers,
            as: "customer",
            attributes: ["id", "name", "phone"],
            include: [
              {
                model: db.User,
                as: "user",
                attributes: ["fullName", "phoneNumber"],
              },
            ],
          },
        ],
      },
      {
        model: db.User,
        as: "receptionist",
        attributes: ["id", "fullName"],
      },
      {
        model: db.Service_Bays,
        as: "bay",
        attributes: ["id", "bay_name"],
      },
      {
        model: db.Appointments,
        as: "appointment",
        attributes: ["id", "booking_type", "scheduled_time", "status"],
        include: [
          {
            model: db.Appointment_Details,
            as: "appointmentDetails",
            include: [
              {
                model: db.Service_Catalog,
                as: "catalog",
                attributes: ["id", "service_name", "estimated_duration"],
              },
              {
                model: db.Service_Combo,
                as: "combo",
                attributes: ["id", "combo_name"],
              },
            ],
          },
        ],
      },
      {
        model: db.Task,
        as: "tasks",
        attributes: ["id", "status"],
      },
      {
        model: db.Booking_Payments,
        as: "payment",
        attributes: ["id", "payment_status", "amount", "payment_method"],
      }
    ],
    order: [["createdAt", "DESC"]],
  });

  // Service_Order chỉ được tạo lúc tiếp nhận thật (không còn tạo lúc đặt lịch nữa), nên
  // sự tồn tại của nó đã là bằng chứng xe đã tới — không cần lọc theo status của Appointment.
  return serviceOrders;
};

module.exports.getServiceOrdersAwaitingPayment = async () => {
  const completedOrders = await db.Service_Orders.findAll({
    where: { status: "COMPLETED" },
    include: [
      {
        model: db.Vehicles,
        as: "vehicle",
        attributes: ["id", "license_plate", "vin_number"],
        include: [
          {
            model: db.Vehicle_Models,
            as: "model",
            attributes: ["id", "model_name"],
          },
          {
            model: db.Customers,
            as: "customer",
            attributes: ["id", "name", "phone"],
          },
        ],
      },
    ],
    order: [["actual_finish_time", "ASC"]],
  });

  const result = [];
  for (const order of completedOrders) {
    const quotations = await Quotation.findAll({
      attributes: ["id", "total_amount", "deposit_amount"],
      where: { status: "APPROVED" },
      include: [
        {
          model: Tasks,
          as: "task",
          attributes: [],
          where: { service_order_id: order.id },
          required: true,
        },
        {
          model: Quotation_Details,
          as: "items",
          attributes: ["id", "amount", "status"],
        },
      ],
    });
    // Lấy phí cứu hộ nếu có liên kết qua appointment
    const rescueRequest = order.appointment_id ? await db.Rescue_Requests.findOne({
      where: { appointment_id: order.appointment_id }
    }) : null;
    const rescuePrice = rescueRequest ? Number(rescueRequest.rescue_price || 0) : 0;

    // grandTotal tính động từ các dòng chưa bị hủy (đóng sớm đơn) — KHÔNG đọc total_amount,
    // vì trường đó giữ nguyên giá trị gốc lúc khách duyệt, không bị ghi đè khi đóng sớm.
    const grandTotal = quotations.reduce(
      (sum, q) => sum + q.items.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + Number(i.amount), 0),
      0,
    ) + rescuePrice;
    const totalDeposit = quotations.reduce(
      (sum, q) => sum + Number(q.deposit_amount || 0),
      0,
    );
    const remainingAmount = grandTotal - totalDeposit;
    if (remainingAmount > 0) {
      result.push({
        serviceOrder: order,
        grandTotal,
        totalDeposit,
        remainingAmount,
      });
    }
  }

  return result;
};

module.exports.getServiceOrderById = async (id) => {
  const serviceOrder = await db.Service_Orders.findByPk(id, {
    include: [
      {
        model: db.Vehicles,
        as: "vehicle",
        attributes: [
          "id",
          "license_plate",
          "vin_number",
          "avg_daily_mileage",
          "color",
          "year",
        ],
        include: [
          {
            model: db.Vehicle_Models,
            as: "model",
            attributes: ["id", "model_name"],
            include: [
              {
                model: db.Vehicle_Makes,
                as: "make",
                attributes: ["id", "make_name"],
              },
            ],
          },
          {
            model: db.Customers,
            as: "customer",
            attributes: [
              "id",
              "name",
              "phone",
              "membership_tier",
              "loyalty_points",
            ],
            include: [
              {
                model: db.User,
                as: "user",
                attributes: ["fullName", "phoneNumber"],
              },
            ],
          },
        ],
      },
      {
        model: db.User,
        as: "receptionist",
        attributes: ["id", "fullName"],
      },
      {
        model: db.Service_Bays,
        as: "bay",
        attributes: ["id", "bay_name"],
      },
      {
        model: db.Appointments,
        as: "appointment",
        attributes: ["id", "booking_type", "scheduled_time", "notes"],
        include: [
          {
            model: db.Appointment_Details,
            as: "appointmentDetails",
            include: [
              {
                model: db.Service_Catalog,
                as: "catalog",
                attributes: ["id", "service_name", "estimated_duration"],
              },
              {
                model: db.Service_Combo,
                as: "combo",
                attributes: ["id", "combo_name"],
              },
            ],
          },
          {
            model: db.Rescue_Requests,
            as: "rescueRequest",
            attributes: ["id", "rescue_price", "distance_km", "phone_number"],
          },
        ],
      },
      {
        model: db.Task,
        as: "tasks",
        include: [
          {
            model: db.Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name", "estimated_duration", "labor_price", "spare_part_id"],
            include: [
              {
                model: db.Spare_Parts,
                as: "sparePart",
                attributes: ["id", "retail_price"],
              }
            ]
          },
          {
            model: db.Quotation_Details,
            as: "quotationItem",
            include: [
              {
                model: db.Spare_Parts,
                as: "sparePart",
                attributes: ["id", "name", "retail_price"],
              },
              {
                model: db.Service_Catalog,
                as: "service_catalog",
                attributes: ["id", "service_name"],
              },
              {
                model: db.Custom_Part_Orders,
                as: "customPartOrder",
                attributes: ["id", "item_name", "quantity", "unit_price", "status"],
              }
            ]
          },
          {
            model: db.Task_Assignment,
            as: "assignments",
            include: [
              {
                model: db.User,
                as: "technician",
                attributes: ["id", "fullName"],
              },
            ],
          },
        ],
      },
      {
        model: db.Booking_Payments,
        as: "payment",
        attributes: ["id", "payment_status", "amount", "payment_method", "paid_at"],
      }
    ],
  });

  if (!serviceOrder) {
    throw { status: 404, message: "Không tìm thấy Lệnh sửa chữa này" };
  }

  const rawServiceOrder = serviceOrder.toJSON();

  // Fetch associated Quotation with items (both services and spare parts)
  const taskIds = rawServiceOrder.tasks ? rawServiceOrder.tasks.map(t => t.id) : [];
  let quotation = null;
  if (taskIds.length > 0) {
    quotation = await db.Quotations.findOne({
      where: { 
        task_id: { [db.Sequelize.Op.in]: taskIds }
      },
      include: [{
        model: db.Quotation_Details,
        as: "items",
        include: [
          {
            model: db.Spare_Parts,
            as: "sparePart",
            attributes: ["id", "name", "retail_price"],
          },
          {
            model: db.Service_Catalog,
            as: "service_catalog",
            attributes: ["id", "service_name", "labor_price"],
          },
          {
            model: db.Custom_Part_Orders,
            as: "customPartOrder",
            attributes: ["id", "item_name", "quantity", "unit_price", "status"],
          }
        ]
      }]
    });
  }
  rawServiceOrder.quotation = quotation ? quotation.toJSON() : null;

  if (rawServiceOrder.tasks) {
    rawServiceOrder.tasks = rawServiceOrder.tasks.map(task => {
      if (task.quotationItem) {
        // If it's a repair task from quotation, calculate the exact quoted price: spare_part + repair_price
        const repairPrice = Number(task.quotationItem.repair_price || 0);
        let partPrice = Number(task.quotationItem.unit_price || 0) * Number(task.quotationItem.quantity || 1);
        
        // If the quotation detail line doesn't specify unit_price, check if the service catalog itself has an associated spare part
        if (partPrice === 0 && task.catalog && task.catalog.sparePart) {
          partPrice = Number(task.catalog.sparePart.retail_price || 0);
        }
        
        const totalTaskPrice = repairPrice + partPrice;
        
        // Define service name from quotationItem details
        let serviceName = task.quotationItem.custom_item_name;
        if (!serviceName && task.quotationItem.service_catalog) {
          serviceName = task.quotationItem.service_catalog.service_name;
        }
        if (!serviceName && task.quotationItem.sparePart) {
          serviceName = `Thay thế ${task.quotationItem.sparePart.name}`;
        }
        if (!serviceName) {
          serviceName = task.catalog?.service_name || 'Dịch vụ sửa chữa';
        }

        task.catalog = {
          ...(task.catalog || {}),
          service_name: serviceName,
          total_price: totalTaskPrice,
          estimated_duration: task.catalog?.estimated_duration || 30
        };
      } else if (task.catalog) {
        task.catalog.total_price = calculateTotalServicePrice(task.catalog);
      }
      return task;
    });
  }

  return rawServiceOrder;
};

module.exports.updateServiceOrderOdo = async (id, currentOdo, symptoms) => {
  const serviceOrder = await db.Service_Orders.findByPk(id);
  if (!serviceOrder) {
    throw { status: 404, message: "Không tìm thấy Lệnh sửa chữa này" };
  }

  serviceOrder.current_odo = currentOdo;
  if (symptoms) {
    serviceOrder.symptoms = symptoms;
  }
  // Update entry time to the exact moment the receptionist receives the car
  serviceOrder.entry_time = new Date();
  await serviceOrder.save();

  // Đồng bộ cập nhật số ODO cho bảng Vehicles nếu ODO mới lớn hơn ODO hiện tại của xe
  const vehicle = await db.Vehicles.findByPk(serviceOrder.vehicle_id);
  if (vehicle && currentOdo > vehicle.avg_daily_mileage) {
    vehicle.avg_daily_mileage = currentOdo;
    await vehicle.save();
  }

  return serviceOrder;
};

module.exports.getCompleteServiceOrder = async () => {
  const serviceOrder = await Service_Order.findAll({
    where: { status: "COMPLETED" },
    attributes: ["id"],
    include: [
      {
        model: Vehicles,
        as: "vehicle",
        attributes: ["id", "license_plate", "color"],
        include: [
          {
            model: Vehicle_Models,
            as: "model",
            attributes: ["id", "model_name"],
            include: [
              {
                model: Vehicle_Makes,
                as: "make",
                attributes: ["id", "make_name"],
              },
            ],
          },
          {
            model: Customers,
            as: "customer",
            attributes: ["id", "name", "phone"],
            include: [
              {
                model: db.User,
                as: "user",
                attributes: ["id", "fullName", "phoneNumber"],
              },
            ],
          },
        ],
      },
      {
        model: Task,
        as: "tasks",
        required: true,
        where: { status: ["COMPLETED"] },
        attributes: ["id", "type", "status", "createdAt"],
        include: [
          {
            model: Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name", "estimated_duration"],
          },
          {
            model: Quotation_Details,
            as: "quotationItem",
            attributes: ["id", "quantity"],
            include: [
              {
                model: Vehicle_Issues,
                as: "issue",
                attributes: ["id", "error_description", "note"],
                include: [
                  {
                    model: Vehicle_Components,
                    as: "component",
                    attributes: ["id", "name"],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  return serviceOrder;
};

// Đóng sớm lệnh sửa chữa (Early Closure) khi khách hàng muốn dừng giữa chừng lúc đang sửa.
// Nguyên tắc: KHÔNG hủy Service_Order/Quotation đã có chi phí thực tế phát sinh — chỉ chốt
// (close) đúng phần đã thực hiện thật. Các hạng mục dịch vụ đã duyệt nhưng CHƯA thực hiện
// (do lễ tân xác nhận cùng kỹ thuật viên) sẽ được đánh dấu CANCELLED và loại khỏi hóa đơn cuối,
// không tạo ra bất kỳ dòng "báo giá âm"/bù trừ giả tạo nào.
module.exports.closeServiceOrderEarly = async (serviceOrderId, completedQuotationItemIds, reason, receptionistId) => {
  const transaction = await db.sequelize.transaction();

  try {
    const serviceOrder = await Service_Order.findByPk(serviceOrderId, {
      include: [
        {
          model: Vehicles,
          as: "vehicle",
          attributes: ["id"],
          include: [{ model: Customers, as: "customer", attributes: ["id", "user_id"] }],
        },
      ],
      transaction,
    });
    if (!serviceOrder) {
      throw { status: 404, message: "Không tìm thấy lệnh sửa chữa" };
    }
    if (serviceOrder.status === "COMPLETED") {
      throw { status: 400, message: "Lệnh sửa chữa đã hoàn thành, không thể đóng sớm" };
    }

    // Lấy toàn bộ item (Quotation_Details) thuộc các Quotation APPROVED của service order này,
    // kèm Task tương ứng (mỗi service item luôn sinh 1 Task REPAIR riêng khi được duyệt).
    const approvedQuotations = await Quotation.findAll({
      where: { status: "APPROVED" },
      include: [
        { model: Tasks, as: "task", attributes: ["id"], where: { service_order_id: serviceOrderId }, required: true },
        { model: QuotationDetail, as: "items" },
      ],
      order: [["createdAt", "ASC"]],
      transaction,
    });

    if (approvedQuotations.length === 0) {
      throw { status: 400, message: "Lệnh sửa chữa chưa có báo giá nào được duyệt để đóng sớm" };
    }

    // completedQuotationItemIds giờ mang nghĩa "chắc chắn giữ lại, không hủy" (lễ tân xác nhận
    // cùng kỹ thuật viên là hạng mục này không thể/không nên hủy — ví dụ đã lắp vào xe), KHÔNG
    // còn nghĩa "đã hoàn thành". Task tương ứng các item được giữ lại GIỮ NGUYÊN status hiện tại,
    // để kỹ thuật viên tự cập nhật qua đúng luồng làm việc bình thường của họ — hệ thống không
    // tự ý gán COMPLETED thay họ.
    const keepIdSet = new Set((completedQuotationItemIds || []).map((id) => Number(id)));
    const itemsToCancel = [];
    const quotationsAffected = new Map(); // quotation_id -> Quotation instance

    for (const quotation of approvedQuotations) {
      for (const item of quotation.items) {
        const isMarkedKeep = keepIdSet.has(item.id);

        if (!isMarkedKeep && item.status !== "CANCELLED") {
          itemsToCancel.push(item);
        }
        quotationsAffected.set(quotation.id, quotation);
      }
    }

    // Không chặn khi itemsToCancel rỗng — trường hợp lễ tân tick TẤT CẢ hạng mục (mọi thứ đều
    // giữ lại) vẫn là một lượt đóng sớm hợp lệ, chỉ là không có gì bị hủy cả.

    // 1. Đánh dấu CANCELLED cho từng dòng báo giá không được giữ lại
    const itemIds = itemsToCancel.map((i) => i.id);
    let affectedTechnicianIds = [];
    if (itemIds.length > 0) {
      await QuotationDetail.update(
        { status: "CANCELLED" },
        { where: { id: itemIds }, transaction },
      );

      // 2. Hủy các Task REPAIR tương ứng (mỗi item service tương ứng 1 Task qua quotation_item_id)
      const cancelledTaskIds = (
        await Tasks.findAll({
          where: { quotation_item_id: itemIds, status: ["PENDING", "IN_PROGRESS", "PAUSED", "WAITING_STOCK"] },
          attributes: ["id"],
          transaction,
        })
      ).map((t) => t.id);

      if (cancelledTaskIds.length > 0) {
        await Tasks.update(
          { status: "CANCELLED" },
          { where: { id: cancelledTaskIds }, transaction },
        );

        // 2b. Hủy theo các Task_Assignment con của những Task vừa bị hủy — không để KTV vẫn
        //     thấy việc này "đang active" trong danh sách công việc dù Task cha đã CANCELLED.
        //     Lấy technician_id TRƯỚC khi update để còn báo cho họ biết dừng việc.
        const cancelledAssignments = await Task_Assignment.findAll({
          where: {
            task_id: cancelledTaskIds,
            status: ["ASSIGNED", "IN_PROGRESS", "PAUSED", "WAITING_STOCK"],
          },
          attributes: ["technician_id"],
          transaction,
        });
        affectedTechnicianIds = [...new Set(cancelledAssignments.map((a) => a.technician_id))];

        await Task_Assignment.update(
          { status: "CANCELLED" },
          {
            where: {
              task_id: cancelledTaskIds,
              status: ["ASSIGNED", "IN_PROGRESS", "PAUSED", "WAITING_STOCK"],
            },
            transaction,
          },
        );
      }
    }

    // 3. KHÔNG đổi total_amount của Quotation — đây là con số khách đã duyệt (approved_at),
    //    phải giữ nguyên làm bằng chứng lịch sử. Số tiền thực phải trả sau khi đóng sớm được
    //    tính động ở nơi hiển thị/thanh toán (SUM các Quotation_Details chưa CANCELLED),
    //    không ghi đè lên báo giá gốc.

    // 4. Service_Order chỉ thật sự COMPLETED khi MỌI Task của nó đã ở trạng thái cuối
    //    (COMPLETED hoặc CANCELLED) — không tự gán COMPLETED vô điều kiện chỉ vì lễ tân bấm nút.
    //    "Đóng sớm" là hành động chủ động ghi nhận ý định dừng (lưu ở early_closure_reason),
    //    còn status thật của đơn phải phản ánh đúng tình trạng Task, tránh nói dối là đã xong
    //    trong khi vẫn còn công việc treo lại.
    const remainingTasks = await Tasks.findAll({
      where: { service_order_id: serviceOrderId },
      attributes: ["id", "status"],
      transaction,
    });
    const allTasksFinished = remainingTasks.every((t) =>
      ["COMPLETED", "CANCELLED"].includes(t.status?.toUpperCase()),
    );

    const updatePayload = { early_closure_reason: reason };
    if (allTasksFinished) {
      updatePayload.status = "COMPLETED";
      updatePayload.actual_finish_time = new Date();
      updatePayload.exit_time = serviceOrder.exit_time || new Date();
    }
    await serviceOrder.update(updatePayload, { transaction });

    if (allTasksFinished && serviceOrder.bay_id) {
      await db.Service_Bays.update(
        { status: "available", current_service_order_id: null },
        { where: { id: serviceOrder.bay_id }, transaction },
      );
      await assignQueuedOrders(transaction);
    }

    await transaction.commit();

    // Gửi thông báo SAU khi commit thành công, không giữ transaction chờ I/O thông báo.
    const customerUserId = serviceOrder.vehicle?.customer?.user_id;
    if (customerUserId) {
      await notifyUser(
        customerUserId,
        {
          title: "Lệnh sửa chữa đã đóng sớm",
          content: reason
            ? `Xưởng đã đóng sớm lệnh sửa chữa #${serviceOrderId} theo yêu cầu. Lý do: ${reason}`
            : `Xưởng đã đóng sớm lệnh sửa chữa #${serviceOrderId} theo yêu cầu của bạn.`,
          notificationType: "SERVICE_ORDER",
          referenceId: serviceOrderId,
        },
        "new_notification",
        { type: "SERVICE_ORDER_CLOSED_EARLY", serviceOrderId },
      );
    }
    for (const technicianId of affectedTechnicianIds) {
      await notifyUser(
        technicianId,
        {
          title: "Công việc đã bị hủy do đóng đơn sớm",
          content: reason
            ? `Lệnh sửa chữa #${serviceOrderId} đã đóng sớm, một số công việc của bạn bị hủy. Lý do: ${reason}`
            : `Lệnh sửa chữa #${serviceOrderId} đã đóng sớm, một số công việc của bạn bị hủy.`,
          notificationType: "SERVICE_ORDER",
          referenceId: serviceOrderId,
        },
        "new_notification",
        { type: "TASK_CANCELLED_EARLY_CLOSURE", serviceOrderId },
      );
    }

    return {
      serviceOrderId,
      cancelledItemCount: itemsToCancel.length,
      affectedQuotationIds: [...quotationsAffected.keys()],
      serviceOrderCompleted: allTasksFinished,
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};

