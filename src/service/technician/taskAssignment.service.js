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
const { uploadToCloudinary } = require("../../helper/uploadToCloudinary.helper");

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
        where: { status: ["PENDING", "IN_PROGRESS", "PAUSED", "WAITING_STOCK","COMPLETED"] },
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
             {
            model: db.Quotation_Details,
            as: "quotationItem",
            attributes: ["id", "quantity", "status"],
            include: [
              {
                model: db.Vehicle_Issues,
                as: "issue",
                attributes: ["id", "error_description", "note"],
                include: [
                  {
                    model: db.Vehicle_Components,
                    as: "component",
                    attributes: ["id", "name"],
                  },
                  {
                    model: db.Quotation_Details,
                    as: "quotationDetails",
                    attributes: [
                      "id",
                      "quantity",
                      "custom_item_name",
                      "status",
                    ],
                    where: {
                      [Op.or]: [
                        { spare_part_id: { [Op.ne]: null } },
                        { custom_item_name: { [Op.ne]: null } },
                      ],
                    },
                    required: false,
                    include: [
                      {
                        model: db.Spare_Parts,
                        as: "sparePart",
                        attributes: ["id", "name", "sku"],
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
    order: [["createdAt", "ASC"]],
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

const resolveStartStatus = async (task) => {
  if (!task.quotation_item_id) {
    return "IN_PROGRESS";
  }
  const quotationItem = await db.Quotation_Details.findByPk(
    task.quotation_item_id,
    { attributes: ["id", "issue_id"] },
  );
  if (!quotationItem || !quotationItem.issue_id) {
    return "IN_PROGRESS";
  }
  // Luồng xuất kho: thủ kho duyệt -> WAITING_SIGNATURE (chờ KTV ký) -> EXPORTED (đã ký xong).
  // Chỉ coi là "đủ hàng" khi đã EXPORTED (đã ký) - RECEIVED giữ để tương thích dữ liệu cũ.
  const needsPart = await db.Quotation_Details.findOne({
    where: {
      issue_id: quotationItem.issue_id,
      status: { [Op.notIn]: ["EXPORTED", "RECEIVED"] },
      [Op.or]: [
        { spare_part_id: { [Op.ne]: null } },
        { custom_item_name: { [Op.ne]: null } },
      ],
    },
    attributes: ["id"],
  });
  return needsPart ? "WAITING_STOCK" : "IN_PROGRESS";
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

      const startStatus = await resolveStartStatus(task);
      let assignmentStatus = "IN_PROGRESS";

      if (totalAssignments <= 1) {
        // Chỉ có 1 người làm
        task.status = startStatus;
        await task.save();
        assignmentStatus = startStatus;
      } else {
        // Có nhiều người làm
        if (asg.role_in_task === "LEAD") {
          task.status = startStatus;
          await task.save();
          assignmentStatus = startStatus;
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

      asg.status = assignmentStatus;
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
  const task = taskAssignment.task;
  const startStatus = await resolveStartStatus(task);
  if (startStatus === "WAITING_STOCK") {
    throw {
      status: 409,
      message: "Còn phụ tùng chưa nhận đủ, chưa thể hoàn thành công việc.",
    };
  }
  await taskAssignment.update({
    status: "COMPLETED",
    actual_end_time: new Date(),
  });
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
        await notifyRole(
          "TECHNICIAN_LEADER",
          {
            title: "Có lệnh sửa chữa chờ nghiệm thu",
            content: "Tất cả công việc sửa chữa đã hoàn tất, cần nghiệm thu tổng thể trước khi giao xe.",
            notificationType: "SERVICE_ORDER",
            referenceId: serviceOrderId,
          },
          "new_notification",
          {
            type: "PENDING_FINAL_QC",
            serviceOrderId,
          },
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
      type: "INSPECTION",
      status: ["IN_PROGRESS","COMPLETED"],
    },
  });
  const taskAssignment = await Task_Assignments.findOne({
    where: {
      task_id: task_id,
      technician_id: technicianId,
      status: ["IN_PROGRESS","COMPLETED"],
    },
  });
  if (!task || !taskAssignment) {
    throw {
      status: 404,
      message: "Không tìm thấy công việc kiểm tra đang thực hiện.",
    };
  }
  const records = issues.map((item) => ({
    component_id: item.component_id,
    task_id: task_id,
    error_description: item.description,
    note: note,
  }));
  const issuesRecords = await Issues.bulkCreate(records);
  await task.update({ status: "COMPLETED" });
  await taskAssignment.update({
    status: "COMPLETED",
    actual_end_time: new Date(),
  });
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
  await notifyRole(
    "TECHNICIAN_LEADER",
    {
      title: "Kiểm tra xong, có lỗi cần báo giá",
      content: `Kỹ thuật viên vừa hoàn tất kiểm tra và ghi nhận ${issuesRecords.length} lỗi.`,
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

module.exports.reportAdditionalIssue = async (
  task_id,
  issues,
  note,
  technicianId,
) => {
  // Chỉ cần xác định đúng Task REPAIR thuộc về kỹ thuật viên này để biết service_order_id
  // (dùng gộp báo giá bổ sung sau này) — không ép trạng thái phải IN_PROGRESS, vì lỗi phát
  // sinh có thể được ghi nhận cả khi Task đang PAUSED/WAITING_STOCK, không chỉ lúc đang chạy.
  const task = await Tasks.findOne({
    where: {
      id: task_id,
      type: "REPAIR",
    },
  });
  const taskAssignment = await Task_Assignments.findOne({
    where: {
      task_id: task_id,
      technician_id: technicianId,
    },
  });
  if (!task || !taskAssignment) {
    throw {
      status: 404,
      message: "Không tìm thấy công việc sửa chữa được giao cho bạn.",
    };
  }
  const records = issues.map((item) => ({
    component_id: item.component_id,
    task_id: task_id,
    error_description: item.description,
    note: note,
  }));
  const issuesRecords = await Issues.bulkCreate(records);
  await notifyRole(
    "RECEPTIONIST",
    {
      title: "Có lỗi phát sinh trong sửa chữa",
      content: `Kỹ thuật viên vừa ghi nhận ${issuesRecords.length} lỗi phát sinh cần lập báo giá bổ sung.`,
      notificationType: "ISSUE_REPORT",
      referenceId: task.service_order_id,
    },
    "new_notification",
    {
      type: "ISSUE_REPORT",
      serviceOrderId: task.service_order_id,
    },
  );
  await notifyRole(
    "TECHNICIAN_LEADER",
    {
      title: "Lỗi phát sinh trong sửa chữa",
      content: `Kỹ thuật viên vừa ghi nhận ${issuesRecords.length} lỗi phát sinh trong quá trình sửa chữa.`,
      notificationType: "ISSUE_REPORT",
      referenceId: task.service_order_id,
    },
    "new_notification",
    {
      type: "ISSUE_REPORT",
      serviceOrderId: task.service_order_id,
    },
  );
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

  if (rescue.status === 'COMPLETED') {
    const technician = await db.User.findByPk(technicianId);

    // Clear customer coordinates
    if (rescue.customer && rescue.customer.user_id) {
      await db.User.update(
        { latitude: null, longitude: null },
        { where: { id: rescue.customer.user_id } }
      );
    }

    await notifyRole('RECEPTIONIST', {
      title: 'Cứu hộ hoàn tất',
      content: `Kỹ thuật viên ${technician?.fullName || 'ẩn danh'} đã hoàn tất cứu hộ cho khách hàng ${rescue.customer?.name || 'ẩn danh'} và đưa xe về Gara thành công!`,
      notificationType: 'SYSTEM',
      priority: 'NORMAL',
      link: '/reception/customers'
    }, 'new_notification', { message: `Kỹ thuật viên ${technician?.fullName || ''} đã cứu hộ hoàn tất!` });
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

// Bước 6 (Format AI Response): parse JSON thô từ Gemini và dựng lại thành text có cấu trúc rõ ràng cho FE hiển thị
function formatAiCausesResponse(rawText) {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    // AI không trả đúng JSON như yêu cầu -> fallback dùng nguyên văn bản
    return { causes: [], recommendations: [], formattedText: rawText.trim() };
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return { causes: [], recommendations: [], formattedText: rawText.trim() };
  }

  const causes = Array.isArray(parsed.causes) ? parsed.causes : [];
  const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

  const lines = [];
  if (causes.length > 0) {
    lines.push("Nguyên nhân khả dĩ:");
    causes.forEach((c, idx) => {
      const part = c.part_to_check ? ` (Kiểm tra: ${c.part_to_check})` : "";
      lines.push(`${idx + 1}. ${c.cause}${part}`);
    });
  }
  if (recommendations.length > 0) {
    lines.push("", "Khuyến nghị kiểm tra:");
    recommendations.forEach((r) => lines.push(`- ${r}`));
  }

  return {
    causes,
    recommendations,
    formattedText: lines.length > 0 ? lines.join("\n") : rawText.trim(),
  };
}

module.exports.aiSuggestCauses = async (symptom, modelName) => {
  if (!symptom || !symptom.trim()) {
    throw { status: 400, message: "Vui lòng nhập triệu chứng" };
  }
  const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = `Bạn là kỹ thuật viên ô tô giàu kinh nghiệm.
    Xe: ${modelName || "không xác định"}.
    Triệu chứng: "${symptom.trim()}".
    Liệt kê 3-5 nguyên nhân khả dĩ phổ biến nhất, sắp theo khả năng cao nhất trước, và các khuyến nghị kiểm tra đi kèm.
    Chỉ trả lời bằng MỘT khối JSON hợp lệ duy nhất, không kèm markdown hay giải thích thêm, theo đúng cấu trúc:
    {
      "causes": [ { "cause": "Tên nguyên nhân ngắn gọn", "part_to_check": "Bộ phận cần kiểm tra" } ],
      "recommendations": [ "Khuyến nghị kiểm tra ngắn gọn" ]
    }
    Tất cả nội dung bằng tiếng Việt.`;
  const result = await model.generateContent(prompt);
  const rawText = result.response.text();

  // Bước 6: Format AI Response — parse và cấu trúc lại output thô từ AI
  const { causes, recommendations, formattedText } = formatAiCausesResponse(rawText);

  return {
    symptom: symptom.trim(),
    ai_suggestion: formattedText,
    causes,
    recommendations,
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
        model: db.Quotation_Details,
        as: "quotationItem",
        attributes: ["id"],
        required: false,
        include: [
          {
            model: Issues,
            as: "issue",
            attributes: ["id", "error_description"],
            include: [
              { model: Components, as: "component", attributes: ["id", "name"] },
            ],
          },
        ],
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
        model: db.Quotation_Details,
        as: "quotationItem",
        attributes: ["id"],
        required: false,
        include: [
          {
            model: Issues,
            as: "issue",
            attributes: ["id", "error_description"],
            include: [
              { model: Components, as: "component", attributes: ["id", "name"] },
            ],
          },
        ],
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


// Danh sách phụ tùng (đã có trong báo giá đã duyệt, thuộc chính Task này) mà KTV có thể
// yêu cầu xuất kho - chỉ lấy các dòng còn PENDING (chưa yêu cầu/xuất).
// Lấy issue_id của TẤT CẢ Task mà KTV này phụ trách trong 1 service order - dùng làm phạm vi
// gộp yêu cầu xuất kho chung (1 nút duy nhất cho cả lệnh sửa chữa, không tách theo từng Task).
const getIssueIdsForTechnicianInServiceOrder = async (serviceOrderId, technicianId) => {
  const assignments = await Task_Assignments.findAll({
    where: { technician_id: technicianId },
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        where: { service_order_id: serviceOrderId },
        required: true,
        include: [
          { model: db.Quotation_Details, as: "quotationItem", attributes: ["id", "issue_id"] },
        ],
      },
    ],
  });
  if (assignments.length === 0) {
    throw { status: 403, message: "Bạn không phụ trách công việc nào thuộc lệnh sửa chữa này." };
  }
  return [
    ...new Set(
      assignments
        .map((a) => a.task?.quotationItem?.issue_id)
        .filter(Boolean),
    ),
  ];
};

module.exports.getRequestablePartsForServiceOrder = async (serviceOrderId, technicianId) => {
  const issueIds = await getIssueIdsForTechnicianInServiceOrder(serviceOrderId, technicianId);
  if (issueIds.length === 0) {
    return [];
  }
  return db.Quotation_Details.findAll({
    where: {
      issue_id: issueIds,
      spare_part_id: { [Op.ne]: null },
      status: "PENDING",
    },
    attributes: ["id", "quantity", "unit_price", "amount"],
    include: [
      { model: db.Spare_Parts, as: "sparePart", attributes: ["id", "sku", "name", "brand", "stock_quantity"] },
    ],
  });
};

// Kỹ thuật viên gửi yêu cầu xuất kho cho các dòng phụ tùng đã chọn (có thể thuộc nhiều Task
// khác nhau trong cùng lệnh sửa chữa mà chính KTV này phụ trách) - thủ kho sẽ duyệt sau.
module.exports.requestExportParts = async (serviceOrderId, technicianId, detailIds) => {
  const issueIds = await getIssueIdsForTechnicianInServiceOrder(serviceOrderId, technicianId);
  if (issueIds.length === 0) {
    throw { status: 400, message: "Không tìm thấy hạng mục báo giá nào để yêu cầu xuất kho." };
  }

  const items = await db.Quotation_Details.findAll({
    where: {
      id: detailIds,
      issue_id: issueIds,
      spare_part_id: { [Op.ne]: null },
      status: "PENDING",
    },
  });
  if (items.length !== detailIds.length) {
    throw {
      status: 400,
      message: "Có dòng không hợp lệ, đã yêu cầu, hoặc không thuộc các công việc bạn phụ trách.",
    };
  }
  await db.Quotation_Details.update(
    { status: "REQUESTED", requested_by: technicianId },
    { where: { id: detailIds } },
  );

  await notifyRole(
    "INVENTORY_MANAGER",
    {
      title: "Yêu cầu xuất kho mới",
      content: `Kỹ thuật viên yêu cầu xuất ${items.length} phụ tùng cho lệnh sửa chữa #${serviceOrderId}.`,
      notificationType: "SERVICE_ORDER",
      referenceId: serviceOrderId,
    },
    "new_notification",
    { type: "PARTS_EXPORT_REQUESTED", serviceOrderId },
  );

  return { requested_count: items.length };
};

const PAUSE_STATUSES = ["PAUSED", "WAITING_STOCK"];
module.exports.pauseTask = async (
  taskAssignmentId,
  technicianId,
  reason,
  status = "PAUSED",
) => {
  if (!PAUSE_STATUSES.includes(status)) {
    throw { status: 400, message: "Trạng thái tạm dừng không hợp lệ." };
  }
  const taskAssignment = await Task_Assignments.findOne({
    where: {
      id: taskAssignmentId,
      technician_id: technicianId,
      status: "IN_PROGRESS",
    },
    include: [{ model: Tasks, as: "task" }],
  });
  if (!taskAssignment) {
    throw { status: 404, message: "Không tìm thấy công việc đang thực hiện." };
  }
  await taskAssignment.update({
    status,
    remarks: reason || null,
  });
  await taskAssignment.task.update({ status });
  return taskAssignment;
};


module.exports.resumeTask = async (taskAssignmentId, technicianId) => {
  const taskAssignment = await Task_Assignments.findOne({
    where: {
      id: taskAssignmentId,
      technician_id: technicianId,
      status: PAUSE_STATUSES,
    },
    include: [{ model: Tasks, as: "task" }],
  });
  if (!taskAssignment) {
    throw { status: 404, message: "Không tìm thấy công việc đang tạm dừng." };
  }
  await taskAssignment.update({
    status: "IN_PROGRESS",
  });
  await taskAssignment.task.update({ status: "IN_PROGRESS" });

  return taskAssignment;
};
