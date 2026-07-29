const db = require("../../../models");
const { Op } = require("sequelize");
const { calculateTotalServicePrice } = require("../../util/calculateServicePrice.util");
const { notifyUser } = require("../../util/notification.util");
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
  const transaction = await db.sequelize.transaction();

  try {
    let actualVehicleId = data.vehicle_id;
    let actualAppointmentId = data.appointment_id;

    // Xử lý khách vãng lai nếu không có vehicle_id
    if (!actualVehicleId && data.walk_in) {
      let phoneToUse = data.walk_in.customer_phone;

      // 1. Tạo hoặc lấy Customer
      let [customer] = await db.Customers.findOrCreate({
        where: { phone: phoneToUse },
        defaults: {
          user_id: null,
          name: data.walk_in.customer_name || null,
          membership_tier: "BRONZE",
          loyalty_points: 0,
        },
        transaction,
      });

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
          vin_number: data.walk_in.vehicle_vin || null,
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
      let autoBookingType = data.walk_in
        ? "WALK_IN_REPAIR"
        : "RECEPTIONIST_REPAIR";
      if (
        (data.service_ids && data.service_ids.length > 0) ||
        (data.combo_ids && data.combo_ids.length > 0)
      ) {
        autoBookingType = data.walk_in
          ? "WALK_IN_SPECIFIC"
          : "RECEPTIONIST_SPECIFIC";
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
    }

    // 2. Kiểm tra cầu nâng tồn tại (nếu có chọn), hoặc tự phân bổ nếu không
    // 2. Kiểm tra cầu nâng tồn tại (nếu có chọn), hoặc tự phân bổ nếu không
    let bayIdToUse = data.bay_id;
    let forceAutoAssign = false;

    if (bayIdToUse) {
      const bay = await db.Service_Bays.findByPk(bayIdToUse, { transaction });
      if (!bay) {
        throw { status: 404, message: "Cầu nâng không tồn tại" };
      }

      // Kiểm tra xem cầu nâng này có đang bận không
      const isBusy = await db.Service_Orders.count({
        where: {
          bay_id: bayIdToUse,
          status: {
            [Op.in]: ["INSPECTING", "IN_PROGRESS", "WAITING_FOR_PARTS"],
          },
        },
        transaction,
      });

      // Nếu cầu này đang bận, tự động phân bổ sang cầu khác rảnh
      if (isBusy > 0) {
        forceAutoAssign = true;
      }
    }

    if (!bayIdToUse || forceAutoAssign) {
      const bays = await db.Service_Bays.findAll({
        where: { is_active: true },
        transaction,
      });
      if (bays.length > 0) {
        const bayUsageCount = await Promise.all(
          bays.map(async (b) => {
            const count = await db.Service_Orders.count({
              where: {
                bay_id: b.id,
                status: {
                  [Op.in]: ["INSPECTING", "IN_PROGRESS", "WAITING_FOR_PARTS"],
                },
              },
              transaction,
            });
            return { id: b.id, count };
          }),
        );

        const availableBays = bayUsageCount.filter((b) => b.count === 0);

        if (availableBays.length > 0) {
          // Chọn ngẫu nhiên 1 trong số các cầu rảnh
          const randomIndex = Math.floor(Math.random() * availableBays.length);
          bayIdToUse = availableBays[randomIndex].id;
        } else {
          // Nếu tất cả đều bận, chọn cầu ít việc nhất
          bayUsageCount.sort((a, b) => a.count - b.count);
          bayIdToUse = bayUsageCount[0].id;
        }
      }
    }

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
      : null;

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
        current_odo: data.current_odo,
        status: "INSPECTING",
        entry_time: new Date(),
        estimated_finish_time: estimatedFinishTime,
        symptoms: data.symptoms || "Chưa cập nhật", // Lưu tình trạng xe lúc tiếp nhận
      },
      { transaction },
    );

    // Cập nhật trạng thái Cứu hộ nếu có mã rescue_id được truyền vào
    if (data.rescue_id) {
      const rescueRequest = await db.Rescue_Requests.findByPk(data.rescue_id, { transaction });
      if (rescueRequest && rescueRequest.status === 'COMPLETED') {
        rescueRequest.status = 'SERVICE_CREATED';
        await rescueRequest.save({ transaction });
      }
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
      // Khách sửa chữa chưa rõ bệnh -> Tạo một Task kiểm tra xe chung
      const task = await db.Task.create(
        {
          service_order_id: serviceOrder.id,
          service_catalog_id: null,
          type: "INSPECTION",
          status: "PENDING",
        },
        { transaction },
      );

      if (technicianId) {
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
      for (const catalogId of uniqueTaskCatalogs) {
        const task = await db.Task.create(
          {
            service_order_id: serviceOrder.id,
            service_catalog_id: catalogId,
            type: "REPAIR",
            status: "PENDING",
          },
          { transaction },
        );

        if (technicianId) {
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
      }
    }

    await transaction.commit();
    console.log("[createServiceOrder] transaction commit xong, serviceOrder.id:", serviceOrder.id, "technicianId:", technicianId);
    if (technicianId) {
      console.log("[createServiceOrder] Gửi notifyUser cho technicianId:", technicianId);
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
      console.log("[createServiceOrder] notifyUser đã gọi xong (không lỗi)");
    } else {
      console.log("[createServiceOrder] KHÔNG gửi notify vì technicianId là null/undefined");
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

  // Filter out Service Orders that are tied to an appointment which hasn't been received yet
  const filteredOrders = serviceOrders.filter(order => {
    if (!order.appointment_id) return true; // Walk-ins and Rescues
    if (!order.appointment) return true; // Safety check
    const apptStatus = order.appointment.status;
    // If appointment is still PENDING or CONFIRMED, the car hasn't arrived yet
    if (apptStatus === 'PENDING' || apptStatus === 'CONFIRMED') {
      return false;
    }
    return true;
  });

  return filteredOrders;
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
      ],
    });
    const grandTotal = quotations.reduce(
      (sum, q) => sum + Number(q.total_amount),
      0,
    );
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
