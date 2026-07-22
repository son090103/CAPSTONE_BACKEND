const {Op, where } = require("sequelize");
const db = require("../../../models");
const { includes } = require("zod");
const Issues = db.Vehicle_Issues;
const Components = db.Vehicle_Components;
const Tasks = db.Task;
const Task_Assignments = db.Task_Assignment;
const Service_Order = db.Service_Orders;
const Appointment = db.Appointments;
const Customers = db.Customers;
const Users = db.User;
const Vehicles = db.Vehicles;
const Vehicle_Models = db.Vehicle_Models;
const { emitProgress } = require("../../util/socket.util");
const { notifyRole } = require("../../util/notification.util");

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

module.exports.completeTask = async (taskAssignmentId, technicianId) => {
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
        attributes: ["id", "service_order_id"],
      },
    ],
  });
  if (!taskAssignment) {
    throw { status: 404, message: "Không tìm thấy công việc đang thực hiện." };
  };
  await taskAssignment.update({
    status: "COMPLETED",
    actual_end_time: new Date(),
  });
  const taskId = taskAssignment.task.id;
  const serviceOrderId = taskAssignment.task.service_order_id;
  // Chỉ đóng task khi MỌI assignment của nó đã xong
  const remainingAsg = await Task_Assignments.count({
    where: { task_id: taskId, status: { [Op.ne]: "COMPLETED" } },
  });
  if (remainingAsg === 0) {
    await Tasks.update({ status: "COMPLETED" }, { where: { id: taskId } });
    // Chỉ đưa xe vào nghiệm thu khi MỌI task đã xong
    const remainingTasks = await Tasks.count({
      where: { service_order_id: serviceOrderId, status: { [Op.ne]: "COMPLETED" } },
    });
    if (remainingTasks === 0) {
      await Service_Order.update(
        { status: "PENDING_FINAL_QC" },
        { where: { id: serviceOrderId } },
      );
    }
  }
  emitProgress(serviceOrderId, {
    type: "PROGRESS_UPDATED",
    taskId,
  });
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
        include: [
            { model: db.Customers, as: 'customer' }
        ]
    });

    if (!rescue) {
        throw { status: 404, message: "Không tìm thấy yêu cầu cứu hộ" };
    }

    if (rescue.technician_id !== technicianId) {
        throw { status: 403, message: "Bạn không được phân công yêu cầu cứu hộ này" };
    }

    // Cho phép chuyển đổi linh hoạt: từ ASSIGNED -> ACCEPTED, từ ACCEPTED -> EN_ROUTE, ...
    if (newStatus) {
        rescue.status = newStatus;
    } else {
        // Mặc định nếu không truyền thì hiểu là Bắt đầu đi (EN_ROUTE) hoặc Nhận (ACCEPTED) tuỳ status hiện tại
        if (rescue.status === 'ASSIGNED') {
            rescue.status = 'ACCEPTED';
        } else if (rescue.status === 'ACCEPTED') {
            rescue.status = 'EN_ROUTE';
        }
    }

    await rescue.save();

    if (rescue.status === 'EN_ROUTE' && global._io) {
        const userId = rescue.customer?.user_id || rescue.customer_id;
        // Gửi cho lễ tân (global) hoặc có thể gửi cụ thể nếu có room lễ tân
        global._io.emit('rescue-vehicle-moving', {
            rescueId: rescue.id,
            technicianId,
            customerId: userId,
            customerLat: rescue.customer_lat,
            customerLng: rescue.customer_lng
        });
        
        // Gửi cho khách hàng cụ thể
        global._io.to(`customer_${userId}`).emit('rescue-vehicle-moving', {
            rescueId: rescue.id,
            technicianId
        });
    }

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
                [db.Sequelize.Op.in]: ['ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']
            }
        },
        include: [
            {
                model: db.Customers,
                as: 'customer',
                attributes: ['id', 'name', 'phone'],
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['id', 'fullName', 'phoneNumber', 'avatar']
                    }
                ]
            }
        ],
        order: [['createdAt', 'DESC']]
    });

    return rescue;
};
