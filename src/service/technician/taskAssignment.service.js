const { Op, where } = require("sequelize");
const db = require("../../../models");
const Issues = db.Vehicle_Issues;
const { emitProgress } = require("../../util/socket.util");
const { notifyRole, notifyUser } = require("../../util/notification.util");
const geminiClient = require("../../config/gemini.config");
const Components = db.Vehicle_Components;
const Tasks = db.Task;
const Task_Assignments = db.Task_Assignment;
const Service_Order = db.Service_Orders;
const Appointment = db.Appointments;
const Customers = db.Customers;
const Users = db.User;
const Vehicles = db.Vehicles;
const Vehicle_Models = db.Vehicle_Models;
const Vehicle_Makes = db.Vehicle_Makes;
const Diagnostic_Knowledge = db.Diagnostic_Knowledge;
const Repair_Notes = db.Repair_Notes;
const Service_Catalog = db.Service_Catalog;

module.exports.getTaskAssignment = async (technicianId) => {
  const serviceOrders = await db.Service_Orders.findAll({
    include: [
      {
        model: db.Vehicles,
        as: "vehicle",
        attributes: ["id", "license_plate", "vin_number", "color"],
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
        attributes: ["id", "booking_type", "scheduled_time"],
      },
      {
        model: db.Task,
        as: "tasks",
        required: true,
        where: { status: ["PENDING", "IN_PROGRESS"] },
        include: [
          {
            model: db.Task_Assignment,
            as: "assignments",
            required: technicianId ? true : false, // Bắt buộc phải có assignment nếu có lọc theo technicianId
            where: technicianId ? { technician_id: technicianId } : undefined, // Lọc theo Kỹ thuật viên
            include: [
              {
                model: db.User,
                as: "technician",
                attributes: ["id", "fullName"],
              },
            ],
          },
          {
            model: db.Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name", "estimated_duration"],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });
  return serviceOrders;
};

module.exports.getServiceOrderDetail = async (serviceOrderId, technicianId) => {
  const serviceOrder = await db.Service_Orders.findOne({
    where: { id: serviceOrderId },
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
        attributes: ["id", "booking_type", "scheduled_time", "status", "notes"],
      },
      {
        model: db.Task,
        as: "tasks",
        include: [
          {
            model: db.Task_Assignment,
            as: "assignments",
            // Lấy tất cả phân công để thợ có thể xem đồng nghiệp làm cùng
            include: [
              {
                model: db.User,
                as: "technician",
                attributes: ["id", "fullName"],
              },
            ],
          },
          {
            model: db.Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name", "estimated_duration"],
          },
        ],
      },
    ],
  });

  if (!serviceOrder) {
    throw { status: 404, message: "Không tìm thấy chi tiết Lệnh sửa chữa" };
  }

  return serviceOrder;
};

module.exports.startTask = async (taskAssignmentId, technicianId) => {
  // 1. Tìm assignment gốc để lấy thông tin Service Order và Appointment
  const assignment = await db.Task_Assignment.findOne({
    where: { id: taskAssignmentId, technician_id: technicianId },
    include: [
      {
        model: db.Task,
        as: "task",
        include: [
          {
            model: db.Service_Orders,
            as: "serviceOrder",
            include: [
              {
                model: db.Appointments,
                as: "appointment",
                attributes: ["id", "status", "booking_type"],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!assignment) {
    throw {
      status: 404,
      message:
        "Không tìm thấy phân công công việc hoặc bạn không có quyền thực hiện.",
    };
  }

  const serviceOrderId = assignment.task.service_order_id;
  const serviceOrder = assignment.task.serviceOrder;

  // 2. Tìm TẤT CẢ phân công của Kỹ thuật viên này trong CÙNG 1 Service Order
  const allAssignments = await db.Task_Assignment.findAll({
    where: { technician_id: technicianId },
    include: [
      {
        model: db.Task,
        as: "task",
        where: { service_order_id: serviceOrderId },
      },
    ],
  });

  // 3. Cập nhật tất cả các assignment và task tương ứng
  for (const asg of allAssignments) {
    if (asg.status !== "IN_PROGRESS" && asg.status !== "COMPLETED") {
      const task = asg.task;

      // Đếm số lượng người làm chung Task này
      const totalAssignments = await db.Task_Assignment.count({
        where: { task_id: task.id },
      });

      if (totalAssignments <= 1) {
        // Chỉ có 1 người làm
        task.status = "IN_PROGRESS";
        await task.save();
      } else {
        // Có nhiều người làm
        if (asg.role_in_task === "LEAD") {
          task.status = "IN_PROGRESS";
          await task.save();
        } else {
          // Nếu là thợ phụ, chỉ start assignment, task giữ nguyên trừ khi task đã IN_PROGRESS
          if (task.status !== "IN_PROGRESS") {
            throw {
              status: 403,
              message: `Nhiệm vụ ID ${task.id} có nhiều Kỹ thuật viên. Bạn chỉ được bắt đầu sau khi Thợ chính (LEAD) đã bắt đầu.`,
            };
          }
        }
      }

      asg.status = "IN_PROGRESS";
      if (!asg.actual_start_time) {
        asg.actual_start_time = new Date();
      }
      await asg.save();
    }
  }

  // 4. Cập nhật trạng thái Lệnh sửa chữa (Service Order)
  if (serviceOrder && serviceOrder.status !== "IN_PROGRESS") {
    serviceOrder.status = "IN_PROGRESS";
    await serviceOrder.save();
  }

  return assignment;
};

module.exports.completeTask = async (
  taskAssignmentId,
  technicianId,
  content,
) => {
  const taskAssignment = await Task_Assignments.findOne({
    where: {
      id: taskAssignmentId,
      technician_id: technicianId,
      status: "IN_PROGRESS",
    },
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id", "service_order_id", "type"],
      },
    ],
  });
  if (!taskAssignment) {
    throw { status: 404, message: "Không tìm thấy công việc đang thực hiện." };
  }
  await taskAssignment.update({
    status: "COMPLETED",
    actual_end_time: new Date(),
  });
  const task = taskAssignment.task;
  const taskId = task.id;
  const serviceOrderId = task.service_order_id;
  const remainingAsg = await Task_Assignments.count({
    where: { task_id: taskId, status: { [Op.ne]: "COMPLETED" } },
  });
  if (remainingAsg === 0) {
    await Tasks.update({ status: "COMPLETED" }, { where: { id: taskId } });
    if (task.type === "REPAIR") {
      const remainingRepair = await Tasks.count({
        where: {
          service_order_id: serviceOrderId,
          type: "REPAIR",
          status: { [Op.ne]: "COMPLETED" },
        },
      });
      if (remainingRepair === 0) {
        await Service_Order.update(
          { status: "PENDING_FINAL_QC" },
          { where: { id: serviceOrderId } },
        );
      }
      if (content && content.trim()) {
        await Repair_Notes.create({
          task_id: taskId,
          content: content.trim(),
        });
      }
    }
  }
  emitProgress(serviceOrderId, { type: "PROGRESS_UPDATED", taskId });
  return taskAssignment;
};

module.exports.getAllComponents = async () => {
  const components = await Components.findAll({
    attributes: ["id", "name", "parent_id"],
  });
  return components;
};

module.exports.createIssueReports = async (
  task_id,
  issues,
  note,
  technicianId,
) => {
  const task = await Tasks.findOne({
    where: {
      id: task_id,
      status: "IN_PROGRESS",
    },
  });
  const taskAssignment = await Task_Assignments.findOne({
    where: {
      task_id: task_id,
      technician_id: technicianId,
      status: "IN_PROGRESS",
    },
  });
  if (!task || !taskAssignment) {
    throw { status: 404, message: "Không tìm thấy công việc đang thực hiện." };
  }
  const records = issues.map((item) => ({
    component_id: item.component_id,
    task_id: task_id,
    error_description: item.description,
    note: note,
  }));
  const issuesRecords = await Issues.bulkCreate(records);
  await task.update({ status: "COMPLETED" });
  await taskAssignment.update({ status: "COMPLETED" });
  await Service_Order.update(
    { status: "PENDING_QUOTATION" },
    { where: { id: task.service_order_id } },
  );
  await notifyRole(
    "RECEPTIONIST",
    {
      title: "Có báo cáo lỗi mới",
      content: `Kỹ thuật viên vừa ghi nhận ${issuesRecords.length} lỗi cần lập báo giá.`,
      notificationType: "ISSUE_REPORT",
      referenceId: task.service_order_id,
    },
    "new_notification",
    {
      type: "ISSUE_REPORT",
      serviceOrderId: task.service_order_id,
    },
  );
  emitProgress(task.service_order_id, {
    type: "INSPECTION_DONE",
    serviceOrderId: task.service_order_id,
  });
  return issuesRecords;
};

module.exports.getIssuesReportHistory = async (technicianId) => {
  const issues = await Issues.findAll({
    attributes: ["id", "error_description", "note", "createdAt"],
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id", "status"],
        required: true,
        include: [
          {
            model: Task_Assignments,
            as: "assignments",
            attributes: [],
            where: { technician_id: technicianId },
            required: true,
          },
          {
            model: Service_Order,
            as: "serviceOrder",
            attributes: ["id"],
            include: [
              {
                model: Vehicles,
                as: "vehicle",
                attributes: ["id", "color", "license_plate"],
                include: [
                  {
                    model: Vehicle_Models,
                    as: "model",
                    attributes: ["id", "model_name"],
                  },
                  {
                    model: Customers,
                    as: "customer",
                    attributes: ["id", "name", "phone"],
                    include: [
                      {
                        model: Users,
                        as: "user",
                        attributes: ["id", "fullName", "phoneNumber"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        model: Components,
        as: "component",
        attributes: ["id", "name", "parent_id"],
        include: [
          {
            model: Components,
            as: "parent",
            attributes: ["id", "name"],
          },
          {
            model: Components,
            as: "children",
            attributes: ["id", "name"],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return issues;
};

module.exports.startRescueTask = async (rescueId, technicianId, newStatus) => {
  const rescue = await db.Rescue_Requests.findByPk(rescueId, {
    include: [{ model: db.Customers, as: "customer" }],
  });

  if (!rescue) {
    throw { status: 404, message: "Không tìm thấy yêu cầu cứu hộ" };
  }

  if (rescue.technician_id !== technicianId) {
    throw {
      status: 403,
      message: "Bạn không được phân công yêu cầu cứu hộ này",
    };
  }

  // Cho phép chuyển đổi linh hoạt: từ ASSIGNED -> ACCEPTED, từ ACCEPTED -> EN_ROUTE, ...
  if (newStatus) {
    rescue.status = newStatus;
  } else {
    // Mặc định nếu không truyền thì hiểu là Bắt đầu đi (EN_ROUTE) hoặc Nhận (ACCEPTED) tuỳ status hiện tại
    if (rescue.status === "ASSIGNED") {
      rescue.status = "ACCEPTED";
    } else if (rescue.status === "ACCEPTED") {
      rescue.status = "EN_ROUTE";
    }
  }

  await rescue.save();

  if (rescue.status === "EN_ROUTE" && global._io) {
    const userId = rescue.customer?.user_id || rescue.customer_id;
    // Gửi cho lễ tân (global) hoặc có thể gửi cụ thể nếu có room lễ tân
    global._io.emit("rescue-vehicle-moving", {
      rescueId: rescue.id,
      technicianId,
      customerId: userId,
      customerLat: rescue.customer_lat,
      customerLng: rescue.customer_lng,
    });

    // Gửi cho khách hàng cụ thể
    global._io.to(`customer_${userId}`).emit("rescue-vehicle-moving", {
      rescueId: rescue.id,
      technicianId,
    });
  }

  return rescue;
};

module.exports.getMyActiveRescue = async (technicianId) => {
  const rescue = await db.Rescue_Requests.findOne({
    where: {
      technician_id: technicianId,
      status: {
        [db.Sequelize.Op.in]: [
          "ASSIGNED",
          "ACCEPTED",
          "EN_ROUTE",
          "ARRIVED",
          "IN_PROGRESS",
        ],
      },
    },
    include: [
      {
        model: db.Customers,
        as: "customer",
        attributes: ["id", "name", "phone"],
        include: [
          {
            model: db.User,
            as: "user",
            attributes: ["id", "fullName", "phoneNumber", "avatar"],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return rescue;
};

module.exports.getAllDiagnostics = async () => {
  const rows = await Diagnostic_Knowledge.findAll({
    attributes: ["id", "symptom", "possible_causes", "model_id", "make_id"],
    include: [
      { model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] },
      { model: Vehicle_Makes, as: "make", attributes: ["id", "make_name"] },
    ],
    order: [["symptom", "ASC"]],
  });
  return rows;
};

module.exports.searchDiagnostics = async (keyword) => {
  const where = {};
  if (keyword && keyword.trim()) {
    const kw = `%${keyword.trim()}%`;
    where[Op.or] = [
      { symptom: { [Op.iLike]: kw } },
      { possible_causes: { [Op.iLike]: kw } },
    ];
  }
  const rows = await db.Diagnostic_Knowledge.findAll({
    where,
    attributes: ["id", "symptom", "possible_causes", "model_id", "make_id"],
    include: [
      {
        model: db.Vehicle_Models,
        as: "model",
        attributes: ["id", "model_name"],
      },
      { model: db.Vehicle_Makes, as: "make", attributes: ["id", "make_name"] },
    ],
    order: [["symptom", "ASC"]],
  });
  return rows;
};

module.exports.filterDiagnostics = async ({ makeId, modelId }) => {
  let orClauses = null;
  if (modelId) {
    const model = await db.Vehicle_Models.findByPk(modelId, {
      attributes: ["make_id"],
    });
    orClauses = [{ model_id: modelId }];
    if (model?.make_id) {
      orClauses.push({ make_id: model.make_id, model_id: null });
    }
  } else if (makeId) {
    const models = await db.Vehicle_Models.findAll({
      where: { make_id: makeId },
      attributes: ["id"],
    });
    const modelIds = models.map((m) => m.id);
    orClauses = [{ make_id: makeId }];
    if (modelIds.length) {
      orClauses.push({ model_id: { [Op.in]: modelIds } });
    }
  }
  const rows = await db.Diagnostic_Knowledge.findAll({
    where: orClauses ? { [Op.or]: orClauses } : {},
    attributes: ["id", "symptom", "possible_causes", "model_id", "make_id"],
    include: [
      {
        model: db.Vehicle_Models,
        as: "model",
        attributes: ["id", "model_name"],
      },
      { model: db.Vehicle_Makes, as: "make", attributes: ["id", "make_name"] },
    ],
    order: [["symptom", "ASC"]],
  });
  return rows;
};

module.exports.getMakes = async () => {
  return await db.Vehicle_Makes.findAll({
    attributes: ["id", "make_name"],
    order: [["make_name", "ASC"]],
  });
};

module.exports.getModels = async (makeId) => {
  const where = {};
  if (makeId) where.make_id = makeId;
  return await db.Vehicle_Models.findAll({
    where,
    attributes: ["id", "make_id", "model_name"],
    order: [["model_name", "ASC"]],
  });
};

module.exports.aiSuggestCauses = async (symptom, modelName) => {
  if (!symptom || !symptom.trim()) {
    throw { status: 400, message: "Vui lòng nhập triệu chứng" };
  }
  const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Bạn là kỹ thuật viên ô tô giàu kinh nghiệm.
    Xe: ${modelName || "không xác định"}.
    Triệu chứng: "${symptom.trim()}".
    Liệt kê 3-5 nguyên nhân khả dĩ phổ biến nhất, sắp theo khả năng cao nhất trước.
    Mỗi nguyên nhân một dòng ngắn gọn, kèm bộ phận cần kiểm tra.
    Chỉ trả lời bằng tiếng Việt, không giải thích dài dòng.`;
  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return {
    symptom: symptom.trim(),
    ai_suggestion: text,
    disclaimer: "Gợi ý từ AI, cần kỹ thuật viên kiểm chứng trước khi kết luận.",
  };
};

module.exports.getRepairHistory = async () => {
  return await Tasks.findAll({
    where: { type: "REPAIR", status: "COMPLETED" },
    attributes: ["id", "createdAt"],
    include: [
      {
        model: Service_Catalog,
        as: "catalog",
        attributes: ["id", "service_name"],
      },
      {
        model: db.Repair_Notes,
        as: "repairNotes",
        attributes: ["id", "content", "createdAt"],
        required: false,
      },
      {
        model: Task_Assignments,
        as: "assignments",
        attributes: ["id"],
        include: [
          { model: db.User, as: "technician", attributes: ["id", "fullName"] },
        ],
      },
      {
        model: Service_Order,
        as: "serviceOrder",
        attributes: ["id"],
        required: true,
        include: [
          {
            model: Vehicles,
            as: "vehicle",
            attributes: ["id", "model_id"],
            required: true,
            include: [
              {
                model: Vehicle_Models,
                as: "model",
                attributes: ["id", "model_name"],
              },
            ],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
};

module.exports.searchRepairHistory = async (keyword) => {
  const catalogWhere = {};
  if (keyword && keyword.trim()) {
    catalogWhere.service_name = { [Op.iLike]: `%${keyword.trim()}%` };
  }

  return await Tasks.findAll({
    where: { type: "REPAIR", status: "COMPLETED" },
    attributes: ["id", "createdAt"],
    include: [
      {
        model: Service_Catalog,
        as: "catalog",
        attributes: ["id", "service_name"],
        required: !!(keyword && keyword.trim()),
        where: Object.keys(catalogWhere).length ? catalogWhere : undefined,
      },
      {
        model: Repair_Notes,
        as: "repairNotes",
        attributes: ["id", "content", "createdAt"],
        required: false,
      },
      {
        model: Task_Assignments,
        as: "assignments",
        attributes: ["id"],
        include: [
          { model: db.User, as: "technician", attributes: ["id", "fullName"] },
        ],
      },
      {
        model: Service_Order,
        as: "serviceOrder",
        attributes: ["id"],
        required: true,
        include: [
          {
            model: Vehicles,
            as: "vehicle",
            attributes: ["id", "license_plate", "model_id"],
            required: true,
            include: [
              {
                model: Vehicle_Models,
                as: "model",
                attributes: ["id", "model_name"],
              },
            ],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
};

module.exports.filterRepairHistory = async ({ makeId, modelId }) => {
  const vehicleWhere = {};
  if (modelId) vehicleWhere.model_id = modelId;

  const modelInclude = {
    model: Vehicle_Models,
    as: "model",
    attributes: ["id", "model_name", "make_id"],
    required: !!makeId,
    where: makeId ? { make_id: makeId } : undefined,
    include: [
      { model: Vehicle_Makes, as: "make", attributes: ["id", "make_name"] },
    ],
  };

  return await Tasks.findAll({
    where: { type: "REPAIR", status: "COMPLETED" },
    attributes: ["id", "createdAt"],
    include: [
      {
        model: Service_Catalog,
        as: "catalog",
        attributes: ["id", "service_name"],
      },
      {
        model: db.Repair_Notes,
        as: "repairNotes",
        attributes: ["id", "content", "createdAt"],
        required: false,
        include: [
          { model: db.User, as: "technician", attributes: ["id", "fullName"] },
        ],
      },
      {
        model: Service_Order,
        as: "serviceOrder",
        attributes: ["id"],
        required: true,
        include: [
          {
            model: Vehicles,
            as: "vehicle",
            attributes: ["id", "license_plate", "model_id"],
            required: true,
            where: Object.keys(vehicleWhere).length ? vehicleWhere : undefined,
            include: [modelInclude],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
};

module.exports.getAllInspectionHistory = async () => {
  return await Issues.findAll({
    attributes: [
      "id",
      "error_description",
      "note",
      "component_id",
      "createdAt",
    ],
    include: [
      { model: Components, as: "component", attributes: ["id", "name"] },
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        required: true,
        include: [
          {
            model: Service_Order,
            as: "serviceOrder",
            attributes: ["id", "symptoms"],
            required: true,
            include: [
              {
                model: Vehicles,
                as: "vehicle",
                attributes: ["id", "license_plate", "model_id"],
                required: true,
                include: [
                  {
                    model: Vehicle_Models,
                    as: "model",
                    attributes: ["id", "model_name", "make_id"],
                    include: [
                      {
                        model: Vehicle_Makes,
                        as: "make",
                        attributes: ["id", "make_name"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
};

module.exports.searchInspectionHistory = async (keyword) => {
  const kw = keyword && keyword.trim() ? `%${keyword.trim()}%` : null;

  return await Issues.findAll({
    attributes: [
      "id",
      "error_description",
      "note",
      "component_id",
      "createdAt",
    ],
    where: kw
      ? { "$task.serviceOrder.symptoms$": { [Op.iLike]: kw } }
      : undefined,
    include: [
      { model: Components, as: "component", attributes: ["id", "name"] },
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        required: true,
        include: [
          {
            model: Service_Order,
            as: "serviceOrder",
            attributes: ["id", "symptoms"],
            required: true,
            include: [
              {
                model: Vehicles,
                as: "vehicle",
                attributes: ["id", "license_plate", "model_id"],
                required: true,
                include: [
                  {
                    model: Vehicle_Models,
                    as: "model",
                    attributes: ["id", "model_name", "make_id"],
                    include: [
                      {
                        model: Vehicle_Makes,
                        as: "make",
                        attributes: ["id", "make_name"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
};

module.exports.filterInspectionHistory = async ({ makeId, modelId }) => {
  const vehicleWhere = {};
  if (modelId) vehicleWhere.model_id = modelId;

  const modelInclude = {
    model: Vehicle_Models,
    as: "model",
    attributes: ["id", "model_name", "make_id"],
    required: !!makeId,
    where: makeId ? { make_id: makeId } : undefined,
    include: [
      { model: Vehicle_Makes, as: "make", attributes: ["id", "make_name"] },
    ],
  };
  return await Issues.findAll({
    attributes: [
      "id",
      "error_description",
      "note",
      "component_id",
      "createdAt",
    ],
    include: [
      { model: Components, as: "component", attributes: ["id", "name"] },
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        required: true,
        include: [
          {
            model: Service_Order,
            as: "serviceOrder",
            attributes: ["id", "symptoms"],
            required: true,
            include: [
              {
                model: Vehicles,
                as: "vehicle",
                attributes: ["id", "license_plate", "model_id"],
                required: true,
                where: Object.keys(vehicleWhere).length
                  ? vehicleWhere
                  : undefined,
                include: [modelInclude],
              },
            ],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
};

module.exports.getCompletedTasks = async (technicianId) => {
  return await Task_Assignments.findAll({
    where: { technician_id: technicianId, status: "COMPLETED" },
    attributes: ["id", "status", "actual_start_time", "actual_end_time", "role_in_task"],
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id", "type", "status"],
        required: true,
        include: [
          {
            model: Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name"],
          },
          {
            model: Service_Order,
            as: "serviceOrder",
            attributes: ["id", "status"],
            required: true,
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
                  },
                  {
                    model: Customers,
                    as: "customer",
                    attributes: ["id", "name", "phone"],
                    include: [
                      {
                        model: Users,
                        as: "user",
                        attributes: ["id", "fullName", "phoneNumber"],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    order: [["actual_end_time", "DESC"]],
    limit: 100,
  });
};

