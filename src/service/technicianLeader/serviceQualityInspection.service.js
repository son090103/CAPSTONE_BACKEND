const db = require("../../../models");
const Tasks = db.Task;
const Task_Assignments = db.Task_Assignment;
const Service_Order = db.Service_Orders;
const Appointment = db.Appointments;
const Customers = db.Customers;
const Users = db.User;
const Vehicles = db.Vehicles;
const Vehicle_Models = db.Vehicle_Models;
const Service_Catalog = db.Service_Catalog;
const { Op } = require("sequelize");
const { notifyRole,notifyUser } = require("../../util/notification.util");
const { emitProgress } = require("../../util/socket.util");
const ROLES = require("../../constants/roles");

module.exports.getServiceOrdersPendingFinalQC = async () => {
  const orders = await Service_Order.findAll({
    attributes: ["id", "status", "entry_time", "updatedAt"],
    where: { status: "PENDING_FINAL_QC" },
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
      {
        model: Tasks,
        as: "tasks",
        attributes: ["id", "status"],
        include: [
          {
            model: Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name"],
          },
          {
            model: Task_Assignments,
            as: "assignments",
            attributes: ["id", "status"],
            include: [
              {
                model: Users,
                as: "technician",
                attributes: ["id", "fullName"],
              },
            ],
          },
        ],
      },
    ],
    order: [["entry_time", "ASC"]],
  });
  return orders;
};

module.exports.approveFinalInspection = async (serviceOrderId) => {
  const serviceOrder = await db.sequelize.transaction(async (t) => {
    const serviceOrder = await Service_Order.findByPk(serviceOrderId, {
      attributes: ["id", "status", "appointment_id"],
      transaction: t,
    });
    if (!serviceOrder) {
      throw { status: 404, message: "Không tìm thấy lệnh sửa chữa" };
    }
    if (serviceOrder.status !== "PENDING_FINAL_QC") {
      throw {
        status: 400,
        message: "Lệnh sửa chữa chưa sẵn sàng nghiệm thu tổng thể",
      };
    }
    const remaining = await Tasks.count({
      where: {
        service_order_id: serviceOrderId,
        status: { [Op.ne]: "COMPLETED" },
      },
      transaction: t,
    });
    if (remaining > 0) {
      throw {
        status: 400,
        message: "Vẫn còn công việc chưa hoàn thành, không thể nghiệm thu",
      };
    }
    await serviceOrder.update(
      { status: "COMPLETED", actual_finish_time: new Date() },
      { transaction: t },
    );
    if (serviceOrder.appointment_id) {
      await db.Appointments.update(
        { status: "COMPLETED" },
        { where: { id: serviceOrder.appointment_id }, transaction: t },
      );
    }
    return serviceOrder;
  });
  await notifyRole(
    ROLES.RECEPTIONIST,
    {
      title: "Xe sẵn sàng giao",
      content: `Lệnh sửa chữa #${serviceOrderId} đã nghiệm thu, có thể gọi khách nhận xe.`,
      notificationType: "READY_FOR_DELIVERY",
      referenceId: serviceOrderId,
    },
    "new_notification",
    { type: "READY_FOR_DELIVERY", serviceOrderId },
  );
  emitProgress(serviceOrderId, {
    type: "READY_FOR_DELIVERY",
    serviceOrderId,
  });
  return serviceOrder;
};

module.exports.rejectFinalInspection = async (
  serviceOrderId,
  taskIds,
  reason,
) => {
  const { serviceOrder, technicianIds } = await db.sequelize.transaction(
    async (t) => {
      const serviceOrder = await Service_Order.findByPk(serviceOrderId, {
        attributes: ["id", "status"],
        transaction: t,
      });
      if (!serviceOrder) {
        throw { status: 404, message: "Không tìm thấy lệnh sửa chữa" };
      }
      if (serviceOrder.status !== "PENDING_FINAL_QC") {
        throw {
          status: 400,
          message: "Lệnh sửa chữa không ở trạng thái chờ nghiệm thu",
        };
      }
      const tasks = await Tasks.findAll({
        where: { id: taskIds, service_order_id: serviceOrderId },
        attributes: ["id"],
        transaction: t,
      });
      if (tasks.length !== taskIds.length) {
        throw {
          status: 400,
          message: "Có công việc không thuộc lệnh sửa chữa này",
        };
      }
      const assignments = await Task_Assignments.findAll({
        where: { task_id: taskIds },
        attributes: ["technician_id"],
        transaction: t,
      });
      const technicianIds = [
        ...new Set(assignments.map((a) => a.technician_id)),
      ];
      await Tasks.update(
        { status: "IN_PROGRESS" },
        { where: { id: taskIds }, transaction: t },
      );
      await Task_Assignments.update(
        { status: "IN_PROGRESS", remarks: reason || null },
        { where: { task_id: taskIds }, transaction: t },
      );
      await serviceOrder.update({ status: "IN_PROGRESS" }, { transaction: t });
      return { serviceOrder, technicianIds };
    },
  );
  emitProgress(serviceOrderId, {
    type: "QC_REJECTED",
    serviceOrderId,
  });
  for (const technicianId of technicianIds) {
    await notifyUser(
      technicianId,
      {
        title: "Công việc cần làm lại",
        content: reason
          ? `Nghiệm thu không đạt: ${reason}`
          : "Công việc của bạn chưa đạt nghiệm thu, cần kiểm tra lại.",
        notificationType: "QC_REJECTED",
        referenceId: serviceOrderId,
      },
      "new_notification",
      { type: "QC_REJECTED", serviceOrderId },
    );
  }
  return serviceOrder;
};
