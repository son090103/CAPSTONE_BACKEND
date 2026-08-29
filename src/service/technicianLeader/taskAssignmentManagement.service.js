const { Op, where } = require("sequelize");
const db = require("../../../models");
const Task = db.Task;
const User = db.User;
const Role = db.Role;
const Vehicles = db.Vehicles;
const Vehicle_Models = db.Vehicle_Models;
const Vehicle_Makes = db.Vehicle_Makes;
const Service_Catalog = db.Service_Catalog;
const Quotation_Details = db.Quotation_Details;
const Vehicle_Issues = db.Vehicle_Issues;
const Vehicle_Components = db.Vehicle_Components;
const Task_Assignment = db.Task_Assignment;
const { notifyRole, notifyUser } = require("../../util/notification.util");
const { emitProgress } = require("../../util/socket.util");
const ROLES = require("../../constants/roles");

module.exports.getAllTasks = async () => {
  const serviceOrders = await db.Service_Orders.findAll({
    attributes: ["id", "status", "createdAt"],
    where: {
      status: { [Op.in]: ["INSPECTING", "IN_PROGRESS", "CLOSED_PARTIAL"] },
    },
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
            model: db.Customers,
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
        where: {
          status: "PENDING",
          id: {
            [Op.notIn]: db.sequelize.literal(`(
              SELECT DISTINCT ta.task_id FROM "Task_Assignments" ta
            )`),
          },
        },
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
    order: [["createdAt", "ASC"]],
  });
  console.log("serviceOrders là : ", serviceOrders)
  return serviceOrders;
};

module.exports.assignTask = async (data) => {
  return await db.sequelize.transaction(async (t) => {
    const tasks = await db.Task.findAll({
      where: { id: data.task_ids },
      transaction: t,
    });
    if (tasks.length !== data.task_ids.length) {
      throw { status: 404, message: "Có công việc không tồn tại" };
    }
    const notPending = tasks.find((task) => task.status !== "PENDING");
    if (notPending) {
      throw {
        status: 400,
        message: `Công việc #${notPending.id} không ở trạng thái chờ phân công`,
      };
    }
    const assigned = await db.Task_Assignment.findOne({
      where: { task_id: data.task_ids },
      transaction: t,
    });
    if (assigned) {
      throw {
        status: 400,
        message: `Công việc #${assigned.task_id} đã được phân công`,
      };
    }
    const technician = await db.User.findOne({
      where: { id: data.technician_id, status: "ACTIVE" },
      include: [
        {
          model: db.Role,
          as: "role",
          attributes: [],
          where: { roleCode: "TECHNICIAN" },
        },
      ],
      transaction: t,
    });
    if (!technician) {
      throw {
        status: 400,
        message: "Kỹ thuật viên không hợp lệ hoặc đang không hoạt động",
      };
    }
    const assignments = await db.Task_Assignment.bulkCreate(
      data.task_ids.map((taskId) => ({
        task_id: taskId,
        technician_id: data.technician_id,
        role_in_task: "LEAD",
        contribution_percent: 100,
        status: "ASSIGNED",
      })),
      { transaction: t },
    );
    return assignments;
  }).then(async (assignments) => {
    await notifyUser(
      data.technician_id,
      {
        title: "Bạn được giao công việc mới",
        content: `Bạn vừa được phân công ${data.task_ids.length} công việc.`,
        notificationType: "SERVICE_ORDER",
      },
      "new_notification",
      {
        type: "TASK_ASSIGNED",
      },
    );
    return assignments;
  });
};

module.exports.getAssignmentHistory = async () => {
  const serviceOrders = await db.Service_Orders.findAll({
    attributes: ["id", "status", "createdAt"],
    where: {
      status: {
        [Op.in]: [
          "INSPECTING",
          "IN_PROGRESS",
          "WAITING_FOR_PARTS",
        ],
      },
      id: {
        [Op.notIn]: db.sequelize.literal(`(
          SELECT DISTINCT t.service_order_id
          FROM "Tasks" t
          WHERE t.status = 'PENDING'
            AND t.id NOT IN (SELECT ta.task_id FROM "Task_Assignments" ta)
        )`),
      },
    },
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
            model: db.Customers,
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
          {
            model: Task_Assignment,
            as: "assignments",
            required: true,
            attributes: [
              "id",
              "status",
              "role_in_task",
              "contribution_percent",
              "actual_start_time",
              "actual_end_time",
              "remarks",
            ],
            include: [
              {
                model: User,
                as: "technician",
                attributes: ["id", "fullName"],
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

module.exports.updateAssignment = async (assignmentId, technicianId) => {
  const { assignment, oldTechnicianId } = await db.sequelize.transaction(
    async (t) => {
      const assignment = await db.Task_Assignment.findByPk(assignmentId, {
        transaction: t,
      });
      if (!assignment) {
        throw { status: 404, message: "Không tìm thấy phân công" };
      }
      if (assignment.status === "COMPLETED") {
        throw {
          status: 400,
          message: "Phân công đã hoàn thành, không thể đổi người",
        };
      }
      const oldTechnicianId = assignment.technician_id;
      const technician = await db.User.findOne({
        where: { id: technicianId, status: "ACTIVE" },
        include: [
          {
            model: db.Role,
            as: "role",
            attributes: [],
            where: { roleCode: "TECHNICIAN" },
          },
        ],
        transaction: t,
      });
      if (!technician) {
        throw {
          status: 400,
          message: "Kỹ thuật viên không hợp lệ hoặc đang không hoạt động",
        };
      }
      const duplicated = await db.Task_Assignment.findOne({
        where: {
          task_id: assignment.task_id,
          technician_id: technicianId,
          id: { [Op.ne]: assignmentId },
        },
        transaction: t,
      });
      if (duplicated) {
        throw {
          status: 400,
          message: "Kỹ thuật viên này đã được phân công việc này",
        };
      }

      await assignment.update(
        { technician_id: technicianId },
        { transaction: t },
      );
      return { assignment, oldTechnicianId };
    },
  );
  await notifyUser(
    technicianId,
    {
      title: "Bạn được giao công việc mới",
      content: "Bạn vừa được chuyển giao một công việc.",
      notificationType: "SERVICE_ORDER",
    },
    "new_notification",
    { type: "TASK_ASSIGNED" },
  );

  if (oldTechnicianId && oldTechnicianId !== technicianId) {
    await notifyUser(
      oldTechnicianId,
      {
        title: "Công việc đã chuyển cho người khác",
        content: "Một công việc của bạn vừa được chuyển giao.",
        notificationType: "SERVICE_ORDER",
      },
      "new_notification",
      { type: "TASK_UNASSIGNED" },
    );
  }
  return assignment;
};

module.exports.getAllTechnician = async () => {
  const technicians = await User.findAll({
    attributes: ["id", "fullName"],
    where: { status: "ACTIVE" },
    include: [
      {
        model: Role,
        as: "role",
        attributes: [],
        where: { roleCode: "TECHNICIAN" },
      },
      {
        model: Task_Assignment,
        as: "assignments",
        required: false,
        attributes: [
          "id",
          "status",
          "task_id",
          "actual_start_time",
          "actual_end_time",
          "createdAt",
        ],
        include: [
          {
            model: Task,
            as: "task",
            attributes: ["id", "status"],
            include: [
              {
                model: Service_Catalog,
                as: "catalog",
                attributes: ["id", "service_name", "estimated_duration"],
              },
              {
                model: db.Service_Orders,
                as: "serviceOrder",
                attributes: ["id"],
                include: [
                  {
                    model: Vehicles,
                    as: "vehicle",
                    attributes: ["id", "license_plate"],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
    order: [["fullName", "ASC"]],
  });

  return technicians.map((tech) => {
    const data = tech.toJSON();
    const all = data.assignments || [];

    const completed = all.filter((a) => a.status === "COMPLETED");
    const active = all.filter((a) =>
      ["ASSIGNED", "IN_PROGRESS", "PAUSED"].includes(a.status),
    );

    return {
      ...data,
      assignments: active, // chỉ trả về việc chưa xong
      total_assigned: all.length, // tổng việc từng được giao
      completed_count: completed.length,
      remaining_count: active.length,
      in_progress_count: active.filter((a) => a.status === "IN_PROGRESS")
        .length,
      pending_count: active.filter((a) => a.status === "ASSIGNED").length,
      paused_count: active.filter((a) => a.status === "PAUSED").length,
    };
  });
};

// Trang "Theo dõi công việc theo đơn": mỗi Service Order đang hoạt động xổ ra toàn bộ Task
// (mọi trạng thái, không chỉ PENDING chưa gán như getAllTasks) kèm thợ đang phụ trách, để
// trưởng nhóm tới xem trực tiếp rồi tự tay hoàn thành (completeTaskByLeader bên dưới).
module.exports.getServiceOrdersWithTasks = async () => {
  const serviceOrders = await db.Service_Orders.findAll({
    attributes: ["id", "status", "createdAt"],
    where: {
      status: { [Op.in]: ["INSPECTING", "IN_PROGRESS", "WAITING_FOR_PARTS", "CLOSED_PARTIAL"] },
    },
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
            model: db.Customers,
            as: "customer",
            attributes: ["id", "name", "phone"],
            include: [
              { model: db.User, as: "user", attributes: ["id", "fullName", "phoneNumber"] },
            ],
          },
        ],
      },
      {
        model: Task,
        as: "tasks",
        attributes: ["id", "type", "status", "createdAt"],
        include: [
          {
            model: Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name"],
          },
          {
            model: Task_Assignment,
            as: "assignments",
            attributes: ["id", "status", "actual_start_time"],
            include: [
              { model: User, as: "technician", attributes: ["id", "fullName"] },
            ],
          },
          // Dùng để FE biết task INSPECTION đã COMPLETED (do KTV tự bấm hoàn thành, không
          // phải Leader xác nhận) đã được ghi báo cáo lỗi chưa — nếu chưa thì hiện nút
          // "Tạo báo cáo lỗi" riêng, vì luồng Leader tự xác nhận đã tự hỏi lỗi sẵn rồi.
          {
            model: Vehicle_Issues,
            as: "issues",
            attributes: ["id"],
            required: false,
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });
  return serviceOrders;
};

// Kỹ thuật viên trưởng nghiệm thu công việc: áp dụng cho assignment đang IN_PROGRESS (thợ báo
// xong bằng miệng, trưởng tới xem rồi tự tay bấm) HOẶC đang PENDING_QC (thợ đã tự bấm "hoàn tất"
// trên máy, task REPAIR dừng chờ nghiệm thu). Chỉ khi trưởng xác nhận thì task mới COMPLETED và
// đơn mới được đóng nếu đã hết task REPAIR (dùng chung completeServiceOrder bên technician).
module.exports.completeTaskByLeader = async (taskAssignmentId) => {
  const { completeServiceOrder, hasAllPartsReady } = require("../technician/taskAssignment.service");
  const taskAssignment = await Task_Assignment.findOne({
    where: { id: taskAssignmentId, status: { [Op.in]: ["IN_PROGRESS", "PENDING_QC"] } },
    include: [
      { model: Task, as: "task", attributes: ["id", "service_order_id", "type", "quotation_item_id"] },
    ],
  });
  if (!taskAssignment) {
    throw { status: 404, message: "Không tìm thấy công việc đang thực hiện hoặc chờ nghiệm thu." };
  }
  const task = taskAssignment.task;
  const allReady = await hasAllPartsReady(task);
  if (!allReady) {
    throw {
      status: 409,
      message: "Còn phụ tùng chưa nhận đủ, chưa thể hoàn thành công việc.",
    };
  }
  await taskAssignment.update({ status: "COMPLETED", actual_end_time: new Date() });
  const taskId = task.id;
  const serviceOrderId = task.service_order_id;
  const remainingAsg = await Task_Assignment.count({
    where: { task_id: taskId, status: { [Op.ne]: "COMPLETED" } },
  });
  if (remainingAsg === 0) {
    await Task.update({ status: "COMPLETED" }, { where: { id: taskId } });
    if (task.type === "REPAIR") {
      const remainingRepair = await Task.count({
        where: {
          service_order_id: serviceOrderId,
          type: "REPAIR",
          status: { [Op.notIn]: ["COMPLETED", "CANCELLED"] },
        },
      });
      if (remainingRepair === 0) {
        await completeServiceOrder(serviceOrderId);
      }
    }
  }
  emitProgress(serviceOrderId, { type: "PROGRESS_UPDATED", taskId });
  return taskAssignment;
};

// Toàn bộ báo cáo lỗi của cả đội KTV (không lọc theo 1 người) — dùng cho màn hình
// Kỹ thuật viên trưởng xem lại lịch sử báo cáo lỗi đã tạo, giống cấu trúc dữ liệu
// getIssuesReportHistory bên technician/taskAssignment.service.js nhưng bỏ where
// technician_id và bổ sung tên KTV thực hiện để Leader biết ai đã báo cáo.
module.exports.getIssuesReportHistoryForLeader = async () => {
  const buildVehicleInclude = () => ({
    model: Vehicles,
    as: "vehicle",
    attributes: ["id", "color", "license_plate"],
    include: [
      { model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] },
      {
        model: db.Customers,
        as: "customer",
        attributes: ["id", "name", "phone"],
        include: [{ model: User, as: "user", attributes: ["id", "fullName", "phoneNumber"] }],
      },
    ],
  });

  const issues = await Vehicle_Issues.findAll({
    attributes: ["id", "error_description", "note", "createdAt", "service_order_id"],
    // Issue phải gắn 1 trong 2: Task (luồng cũ qua Task INSPECTION/REPAIR) hoặc service_order_id
    // trực tiếp (lỗi phát sinh không qua Task — createStandaloneIssueReport).
    where: {
      [Op.or]: [{ task_id: { [Op.ne]: null } }, { service_order_id: { [Op.ne]: null } }],
    },
    include: [
      {
        model: Task,
        as: "task",
        attributes: ["id", "status"],
        required: false,
        include: [
          {
            model: Task_Assignment,
            as: "assignments",
            attributes: ["id", "role_in_task"],
            required: false,
            include: [{ model: User, as: "technician", attributes: ["id", "fullName"] }],
          },
          {
            model: db.Service_Orders,
            as: "serviceOrder",
            attributes: ["id"],
            include: [buildVehicleInclude()],
          },
        ],
      },
      {
        model: db.Service_Orders,
        as: "serviceOrder",
        attributes: ["id"],
        required: false,
        include: [buildVehicleInclude()],
      },
      {
        model: Vehicle_Components,
        as: "component",
        attributes: ["id", "name", "parent_id"],
        include: [
          { model: Vehicle_Components, as: "parent", attributes: ["id", "name"] },
          { model: Vehicle_Components, as: "children", attributes: ["id", "name"] },
        ],
      },
      {
        model: User,
        as: "reportedByTechnician",
        attributes: ["id", "fullName"],
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
  });

  return issues;
};
