const { Op, where } = require("sequelize");
const db = require("../../../models");
const Issues = db.Vehicle_Issues;
const { emitProgress } = require("../../util/socket.util");
const { notifyRole, notifyUser } = require("../../util/notification.util");
const assignQueuedOrders = require("../../util/assignQueuedOrders.util");
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
                    // Không lọc where ở tầng SQL nữa (dòng shell của custom part không còn
                    // spare_part_id/custom_item_name để lọc qua) — lấy hết dòng của issue rồi
                    // lọc "dòng có ý nghĩa" (hàng kho hoặc có customPartOrder) ở tầng JS bên
                    // dưới. KHÔNG include customPartOrder ngay đây — chuỗi alias
                    // "tasks.quotationItem.issue.quotationDetails.customPartOrder.item_name"
                    // (68 ký tự) vượt giới hạn 63 ký tự của Postgres, bị cắt trùng với alias
                    // khác khiến Sequelize trả sai dữ liệu (chỉ còn "id"). Query riêng bên dưới.
                    model: db.Quotation_Details,
                    as: "quotationDetails",
                    attributes: ["id", "quantity", "status"],
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
  // Gom mọi quotation_detail_id đang xuất hiện để query riêng Custom_Part_Orders (tách khỏi
  // include chính — xem lý do ở comment phía trên, tránh alias quá dài bị Postgres cắt).
  const allDetailIds = [];
  for (const so of serviceOrders) {
    for (const task of so.tasks || []) {
      for (const d of task.quotationItem?.issue?.quotationDetails || []) {
        allDetailIds.push(d.id);
      }
    }
  }
  const customPartOrders = allDetailIds.length
    ? await db.Custom_Part_Orders.findAll({
        where: { quotation_detail_id: allDetailIds },
        attributes: ["id", "item_name", "quantity", "unit_price", "status", "arrived_at", "quotation_detail_id"],
      })
    : [];
  const customPartOrderByDetailId = new Map(customPartOrders.map((c) => [c.quotation_detail_id, c.toJSON()]));

  // Lọc lại quotationDetails: chỉ giữ dòng "có ý nghĩa" (hàng kho spare_part_id, hoặc dòng
  // shell của phụ tùng đặt riêng có customPartOrder) — bỏ dòng dịch vụ thuần túy không có
  // phụ tùng đi kèm. Trước đây lọc bằng where ở tầng SQL, giờ dòng shell không còn
  // spare_part_id/custom_item_name để lọc qua đó nữa nên chuyển lọc sang tầng JS.
  const filtered = serviceOrders.map((so) => {
    const data = so.toJSON();
    data.tasks = (data.tasks || []).map((task) => {
      const issue = task.quotationItem?.issue;
      if (issue?.quotationDetails) {
        issue.quotationDetails = issue.quotationDetails
          .map((d) => ({ ...d, customPartOrder: customPartOrderByDetailId.get(d.id) ?? null }))
          .filter((d) => d.sparePart != null || d.customPartOrder != null);
      }
      return task;
    });
    return data;
  });
  return filtered;
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
  //
  // KTV được quyền bắt đầu sớm nếu CÓ ÍT NHẤT 1 phụ tùng đã sẵn sàng, tự chọn việc gì làm
  // trước (ví dụ thay bugi/lọc gió trước khi má phanh đặt riêng còn đang chờ về) — không bắt
  // buộc phải đủ 100% phụ tùng mới cho bắt đầu. Chỉ khi KHÔNG CÓ dòng nào sẵn sàng (0/N) thì
  // mới thực sự WAITING_STOCK. Việc chặn "hoàn thành Task khi còn thiếu" vẫn giữ nguyên ở
  // completeTask (dùng hasAllPartsReady riêng, không dùng lại hàm này).
  //
  // Lọc "dòng nào là phụ tùng" bằng service_id IS NULL (không dùng spare_part_id/
  // custom_item_name — xem giải thích chi tiết ở hasAllPartsReady bên dưới).
  const partRows = await db.Quotation_Details.findAll({
    where: {
      issue_id: quotationItem.issue_id,
      service_id: null,
      status: { [Op.ne]: "CANCELLED" },
    },
    attributes: ["id", "status"],
  });
  if (partRows.length === 0) return "IN_PROGRESS";
  const hasReadyPart = partRows.some((p) => ["EXPORTED", "RECEIVED"].includes(p.status));
  return hasReadyPart ? "IN_PROGRESS" : "WAITING_STOCK";
};

// Dùng khi HOÀN THÀNH Task (khác với resolveStartStatus dùng khi BẮT ĐẦU) — bắt đầu chỉ cần
// có ít nhất 1 phụ tùng sẵn sàng, nhưng hoàn thành bắt buộc phải ĐỦ HẾT 100% phụ tùng của
// issue đó, tránh KTV đánh dấu xong việc khi còn thiếu đồ (ví dụ má phanh đặt riêng chưa về).
//
// Lọc "dòng nào là phụ tùng" bằng service_id IS NULL — KHÔNG dùng spare_part_id/
// custom_item_name nữa: dòng shell của phụ tùng đặt riêng (Custom_Part_Orders) giờ luôn có
// spare_part_id = NULL VÀ custom_item_name = NULL, nên điều kiện Op.or cũ không bao giờ bắt
// được nó nữa (bug đã gặp — hasAllPartsReady trả true sai dù còn phụ tùng đặt riêng chưa về).
// Dòng shell được đồng bộ status = EXPORTED khi Custom_Part_Orders.status = EXPORTED (xem
// exportCustomPartOrder), nên chỉ cần check status NOT IN [EXPORTED, RECEIVED] trên các dòng
// service_id IS NULL là đủ, không cần join thêm Custom_Part_Orders.
const hasAllPartsReady = async (task) => {
  if (!task.quotation_item_id) return true;
  const quotationItem = await db.Quotation_Details.findByPk(task.quotation_item_id, {
    attributes: ["id", "issue_id"],
  });
  if (!quotationItem || !quotationItem.issue_id) return true;
  const unreadyPart = await db.Quotation_Details.findOne({
    where: {
      issue_id: quotationItem.issue_id,
      service_id: null,
      status: { [Op.notIn]: ["EXPORTED", "RECEIVED", "CANCELLED"] },
    },
    attributes: ["id"],
  });
  return !unreadyPart;
};
module.exports.hasAllPartsReady = hasAllPartsReady;

// KTV tự bấm "Yêu cầu xuất kho" 1 lần cho CẢ ĐƠN — gộp mọi Task của chính KTV đó trong Service
// Order, gửi yêu cầu xuất kho cho toàn bộ phụ tùng còn PENDING (đủ tồn, chỉ chưa xuất). Tách
// riêng khỏi startTask, gọi được bất cứ lúc nào, không phụ thuộc trạng thái Task.
module.exports.requestPartsExport = async (serviceOrderId, technicianId) => {
  const assignments = await Task_Assignments.findAll({
    where: { technician_id: technicianId },
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id", "service_order_id", "quotation_item_id"],
        where: { service_order_id: serviceOrderId },
        required: true,
      },
    ],
  });
  if (assignments.length === 0) {
    throw { status: 404, message: "Bạn không có công việc nào trong lệnh sửa chữa này." };
  }

  const quotationItemIds = [...new Set(assignments.map((a) => a.task.quotation_item_id).filter(Boolean))];
  if (quotationItemIds.length === 0) {
    throw { status: 400, message: "Không có công việc nào gắn với hạng mục báo giá." };
  }

  const quotationItems = await db.Quotation_Details.findAll({
    where: { id: quotationItemIds },
    attributes: ["id", "issue_id"],
  });
  const issueIds = [...new Set(quotationItems.map((q) => q.issue_id).filter(Boolean))];
  if (issueIds.length === 0) {
    throw { status: 400, message: "Không tìm thấy hạng mục lỗi gắn với các công việc này." };
  }

  const items = await db.Quotation_Details.findAll({
    where: {
      issue_id: issueIds,
      status: "PENDING",
      [Op.or]: [
        { spare_part_id: { [Op.ne]: null } },
        { custom_item_name: { [Op.ne]: null } },
      ],
    },
  });
  if (items.length === 0) {
    throw { status: 400, message: "Không có phụ tùng nào đang chờ yêu cầu xuất kho cho lệnh sửa chữa này." };
  }

  await db.Quotation_Details.update(
    { status: "REQUESTED", requested_by: technicianId },
    { where: { id: items.map((i) => i.id) } },
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

  return { requestedCount: items.length };
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

  const serviceOrder = assignment.task.serviceOrder;

  // 2. Chỉ xử lý đúng assignment vừa được bấm — không còn hiệu ứng dây chuyền khởi động
  // luôn các Task khác của cùng KTV trong đơn. KTV phải tự bấm từng Task khi thật sự bắt
  // tay vào làm, phản ánh đúng KTV đang làm gì thay vì tự động đoán.
  if (assignment.status !== "IN_PROGRESS" && assignment.status !== "COMPLETED") {
    const task = assignment.task;

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
      if (assignment.role_in_task === "LEAD") {
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

    assignment.status = assignmentStatus;
    if (!assignment.actual_start_time) {
      assignment.actual_start_time = new Date();
    }
    await assignment.save();
  }

  // 3. Cập nhật trạng thái Lệnh sửa chữa (Service Order)
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
        attributes: ["id", "service_order_id", "type", "quotation_item_id"],
      },
    ],
  });
  if (!taskAssignment) {
    throw { status: 404, message: "Không tìm thấy công việc đang thực hiện." };
  }
  const task = taskAssignment.task;
  const allReady = await hasAllPartsReady(task);
  if (!allReady) {
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
        await completeServiceOrder(serviceOrderId);
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

// Không còn bước "nghiệm thu tổng thể" chờ kỹ thuật viên trưởng duyệt — thợ báo xong bằng
// miệng, trưởng nhóm tới xem trực tiếp rồi tự tay bấm hoàn thành (completeTaskByLeader bên
// dưới) hoặc để chính thợ tự complete. Khi task REPAIR cuối cùng của Service Order xong (dù
// do ai bấm), đơn tự động chuyển thẳng COMPLETED, không qua trạng thái chờ duyệt nào nữa.
async function completeServiceOrder(serviceOrderId) {
  let customerUserId = null;
  await db.sequelize.transaction(async (t) => {
    const serviceOrder = await Service_Order.findByPk(serviceOrderId, {
      attributes: ["id", "appointment_id", "bay_id"],
      include: [
        {
          model: Vehicles,
          as: "vehicle",
          attributes: ["id"],
          include: [{ model: Customers, as: "customer", attributes: ["id", "user_id"] }],
        },
      ],
      transaction: t,
    });
    if (!serviceOrder) return;
    customerUserId = serviceOrder.vehicle?.customer?.user_id ?? null;
    await serviceOrder.update(
      { status: "COMPLETED", actual_finish_time: new Date() },
      { transaction: t },
    );
    if (serviceOrder.bay_id) {
      await db.Service_Bays.update(
        { status: "available", current_service_order_id: null },
        { where: { id: serviceOrder.bay_id }, transaction: t },
      );
      await assignQueuedOrders(t);
    }
    if (serviceOrder.appointment_id) {
      await Appointment.update(
        { status: "COMPLETED" },
        { where: { id: serviceOrder.appointment_id }, transaction: t },
      );
    }
  });
  await notifyRole(
    "RECEPTIONIST",
    {
      title: "Xe sẵn sàng giao",
      content: `Lệnh sửa chữa #${serviceOrderId} đã hoàn tất, có thể gọi khách nhận xe.`,
      notificationType: "SERVICE_ORDER",
      referenceId: serviceOrderId,
    },
    "new_notification",
    { type: "READY_FOR_DELIVERY", serviceOrderId },
  );
  if (customerUserId) {
    await notifyUser(
      customerUserId,
      {
        title: "Xe của bạn đã sẵn sàng",
        content: "Xe của bạn đã hoàn tất sửa chữa, bạn có thể đến nhận xe.",
        notificationType: "SERVICE_ORDER",
        referenceId: serviceOrderId,
      },
      "new_notification",
      { type: "READY_FOR_DELIVERY", serviceOrderId },
    );
  }
  emitProgress(serviceOrderId, { type: "READY_FOR_DELIVERY", serviceOrderId });
}
module.exports.completeServiceOrder = completeServiceOrder;

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

  // Kiểm tra xong (dù có lỗi hay không) thì chưa chắc khách sẽ duyệt sửa — trong lúc chờ
  // báo giá/khách duyệt, xe không cần tiếp tục chiếm cầu nâng, nên nhả ngay cho đơn khác
  // đang xếp hàng (nếu có). Khi khách duyệt và tạo Task REPAIR, đơn sẽ xin cầu nâng lại.
  const serviceOrderForBay = await Service_Order.findByPk(task.service_order_id, {
    attributes: ["id", "bay_id"],
  });
  if (serviceOrderForBay && serviceOrderForBay.bay_id) {
    await db.sequelize.transaction(async (t) => {
      await db.Service_Bays.update(
        { status: "available", current_service_order_id: null },
        { where: { id: serviceOrderForBay.bay_id }, transaction: t },
      );
      // "NOT_NEEDED" tạm thời — chưa biết khách có duyệt sửa hay không, nên KHÔNG xếp vào
      // hàng đợi giành bay ngay. Khi khách duyệt báo giá và Task REPAIR được tạo, đơn sẽ
      // xin cầu nâng lại lúc đó (ưu tiên đúng thời điểm thực sự cần).
      await Service_Order.update(
        { bay_id: null, bay_status: "NOT_NEEDED" },
        { where: { id: serviceOrderForBay.id }, transaction: t },
      );
      await assignQueuedOrders(t);
    });
  }

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

module.exports.startRescueTask = async (rescueId, technicianId, newStatus, technicianLat, technicianLng) => {
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

  const allowedTransitions = {
    ASSIGNED: ["EN_ROUTE", "CANCELLED"],
    EN_ROUTE: ["ARRIVED", "CANCELLED"],
    ARRIVED: ["TOWING", "CANCELLED"],
    TOWING: ["COMPLETED"],
  };
  const targetStatus = newStatus || (rescue.status === "ASSIGNED" ? "EN_ROUTE" : null);
  const allowedTargets = allowedTransitions[rescue.status] || [];

  if (!targetStatus || !allowedTargets.includes(targetStatus)) {
    throw {
      status: 400,
      message: `Không thể chuyển cứu hộ từ ${rescue.status} sang ${targetStatus || "trạng thái tiếp theo"}`,
    };
  }

  rescue.status = targetStatus;

  await rescue.save();

  // Lúc bắt đầu 1 đoạn di chuyển mới (EN_ROUTE: tới chỗ khách, TOWING: chở xe về Gara), lưu GPS
  // hiện tại của KTV vào User.latitude/longitude — dùng chung field có sẵn (giống cách customer
  // share vị trí) để khách hàng tính đúng route xuất phát từ vị trí THẬT của KTV lúc đó.
  if ((rescue.status === "EN_ROUTE" || rescue.status === "TOWING") && technicianLat != null && technicianLng != null) {
    await db.User.update(
      { latitude: technicianLat, longitude: technicianLng },
      { where: { id: technicianId } },
    );
  }

  const technician = await db.User.findByPk(technicianId, {
    attributes: ["id", "fullName", "latitude", "longitude"],
  });
  const statusMessages = {
    EN_ROUTE: "Kỹ thuật viên đang trên đường tới vị trí của bạn.",
    ARRIVED: "Kỹ thuật viên đã tới nơi.",
    TOWING: "Kỹ thuật viên đang chở xe của bạn về Gara.",
    COMPLETED: "Cứu hộ đã hoàn tất, xe đã được đưa về Gara.",
  };

  if (rescue.customer?.user_id && statusMessages[rescue.status]) {
    await notifyUser(rescue.customer.user_id, {
      title: "Cập nhật yêu cầu cứu hộ",
      content: technician
        ? `${statusMessages[rescue.status]} (KTV ${technician.fullName})`
        : statusMessages[rescue.status],
      notificationType: "SYSTEM",
      priority: "HIGH",
    }, "new_notification", {
      type: "RESCUE_STATUS_UPDATED",
      rescueId: rescue.id,
      status: rescue.status,
      technicianLat: technician?.latitude ?? null,
      technicianLng: technician?.longitude ?? null,
    });
  }

  if (rescue.status === 'COMPLETED') {
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
          "EN_ROUTE",
          "ARRIVED",
          "TOWING",
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

// Danh sách các cuốc cứu hộ đã hoàn tất của chính KTV đang đăng nhập — để họ xem lại lịch sử.
module.exports.getMyRescueHistory = async (technicianId) => {
  const rescues = await db.Rescue_Requests.findAll({
    where: {
      technician_id: technicianId,
      status: { [db.Sequelize.Op.in]: ["COMPLETED", "SERVICE_CREATED"] },
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
            attributes: ["id", "fullName", "phoneNumber"],
          },
        ],
      },
    ],
    order: [["updatedAt", "DESC"]],
  });

  return rescues;
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

// Tách từ khóa thay vì ILIKE nguyên văn cả câu — vì keyword thường là triệu chứng gốc dài
// (VD "Ngoại hình xe bình thường Tiếp nhận Xe có tiếng khi bóp phanh") tự động điền sẵn từ
// symptoms của đơn, gần như không bao giờ khớp chính xác 1 bản ghi có sẵn trong hệ thống.
module.exports.searchDiagnostics = async (keyword) => {
  const where = {};
  const keywords = keyword && keyword.trim() ? extractSymptomKeywords(keyword) : [];
  if (keywords.length > 0) {
    where[Op.or] = keywords.flatMap((kw) => [
      { symptom: { [Op.iLike]: `%${kw}%` } },
      { possible_causes: { [Op.iLike]: `%${kw}%` } },
    ]);
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
  if (keywords.length === 0) return rows;

  // Nhiều từ khóa (VD "tiếng") match chung chung nhiều bản ghi không liên quan — ưu tiên bản
  // ghi khớp CÀNG NHIỀU từ khóa CÀNG lên đầu, thay vì để lẫn lộn theo alphabet.
  const countMatches = (row) => {
    const text = `${row.symptom || ""} ${row.possible_causes || ""}`.toLowerCase();
    return keywords.reduce((count, kw) => (text.includes(kw) ? count + 1 : count), 0);
  };
  return [...rows].sort((a, b) => countMatches(b) - countMatches(a));
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

function formatAiCausesResponse(rawText) {
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
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

// KTV không tự nhập triệu chứng ban đầu — AI tự lấy từ Service_Order.symptoms (do giám sát ghi
// lúc tạo đơn dịch vụ) gắn với chính Task đang xem, tránh phải gõ tay trên tablet. Sau câu trả
// lời đầu tiên, KTV vẫn có thể gõ followUpQuestion để hỏi thêm/làm rõ (vd "còn nguyên nhân nào
// khác không", "cách kiểm tra ra sao") mà không cần gõ lại triệu chứng từ đầu.
module.exports.aiSuggestCauses = async (taskAssignmentId, technicianId, followUpQuestion) => {
  const assignment = await Task_Assignments.findOne({
    where: { id: taskAssignmentId, technician_id: technicianId },
    include: [
      {
        model: Tasks,
        as: "task",
        include: [
          {
            model: Service_Order,
            as: "serviceOrder",
            attributes: ["id", "symptoms"],
            include: [
              {
                model: Vehicles,
                as: "vehicle",
                attributes: ["id"],
                include: [
                  { model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  if (!assignment) {
    throw { status: 404, message: "Không tìm thấy công việc được giao cho bạn." };
  }
  const symptom = assignment.task?.serviceOrder?.symptoms;
  const modelName = assignment.task?.serviceOrder?.vehicle?.model?.model_name;
  if (!symptom || !symptom.trim()) {
    throw { status: 400, message: "Lệnh sửa chữa chưa ghi nhận triệu chứng." };
  }
  const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = followUpQuestion && followUpQuestion.trim()
    ? `Bạn là kỹ thuật viên ô tô giàu kinh nghiệm.
    Xe: ${modelName || "không xác định"}.
    Triệu chứng ban đầu: "${symptom.trim()}".
    Kỹ thuật viên hỏi thêm: "${followUpQuestion.trim()}".
    Trả lời ngắn gọn, đúng trọng tâm câu hỏi, dựa trên triệu chứng ban đầu.
    Chỉ trả lời bằng MỘT khối JSON hợp lệ duy nhất, không kèm markdown hay giải thích thêm, theo đúng cấu trúc:
    {
      "causes": [ { "cause": "Tên nguyên nhân ngắn gọn", "part_to_check": "Bộ phận cần kiểm tra" } ],
      "recommendations": [ "Khuyến nghị kiểm tra ngắn gọn" ]
    }
    Tất cả nội dung bằng tiếng Việt.`
    : `Bạn là kỹ thuật viên ô tô giàu kinh nghiệm.
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
        where: { type: "INSPECTION", status: "COMPLETED" },
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

// Tách từ khóa thay vì ILIKE nguyên văn cả câu — keyword thường là triệu chứng gốc dài tự
// động điền sẵn từ symptoms của đơn, gần như không bao giờ khớp chính xác 1 bản ghi có sẵn.
module.exports.searchInspectionHistory = async (keyword) => {
  const keywords = keyword && keyword.trim() ? extractSymptomKeywords(keyword) : null;

  return await Issues.findAll({
    attributes: [
      "id",
      "error_description",
      "note",
      "component_id",
      "createdAt",
    ],
    where: keywords
      ? {
          [Op.or]: keywords.map((kw) => ({
            "$task.serviceOrder.symptoms$": { [Op.iLike]: `%${kw}%` },
          })),
        }
      : undefined,
    include: [
      { model: Components, as: "component", attributes: ["id", "name"] },
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        where: { type: "INSPECTION", status: "COMPLETED" },
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

// Các từ quá ngắn/quá chung chung, tách ra thì không còn giá trị lọc (vd "xe bị" trong
// "xe bị má phanh" sẽ match gần như mọi bản ghi) — loại bỏ trước khi dùng làm điều kiện ILIKE.
const SYMPTOM_STOPWORDS = new Set([
  "xe", "bi", "bị", "la", "là", "co", "có", "va", "và", "khi", "bi", "hay",
  "duoc", "được", "can", "cần", "the", "thế", "nay", "này", "do", "đó", "cua", "của",
]);

// Tách triệu chứng gốc thành các từ khóa (không dùng AI để tránh chờ lâu), lọc bỏ từ quá
// ngắn/chung chung, rồi dùng để lọc kinh nghiệm sửa lỗi cũ (OR nhiều điều kiện ILIKE) — KTV
// không cần gõ đúng khớp chuỗi chính xác như tra cứu thường.
const extractSymptomKeywords = (symptom) => {
  const words = symptom
    .trim()
    .toLowerCase()
    .split(/[\s,.;:!?()]+/)
    .filter((w) => w.length >= 2 && !SYMPTOM_STOPWORDS.has(w));
  const keywords = [...new Set(words)];
  return keywords.length ? keywords : [symptom.trim()];
};

// KTV bấm "Tra cứu sửa lỗi" -> tự lấy triệu chứng gốc (Service_Order.symptoms) của task REPAIR
// đang xem, tách thành từ khóa, rồi lọc kinh nghiệm sửa chữa cũ (Tasks REPAIR đã hoàn thành +
// repairNotes) theo các từ khóa đó — không cần khớp đúng từ như tra cứu ILIKE nguyên văn.
module.exports.searchRepairHistorySmart = async (taskAssignmentId, technicianId) => {
  const assignment = await Task_Assignments.findOne({
    where: { id: taskAssignmentId, technician_id: technicianId },
    include: [
      {
        model: Tasks,
        as: "task",
        include: [
          {
            model: Service_Order,
            as: "serviceOrder",
            attributes: ["id", "symptoms"],
          },
        ],
      },
    ],
  });
  if (!assignment) {
    throw { status: 404, message: "Không tìm thấy công việc được giao cho bạn." };
  }
  const symptom = assignment.task?.serviceOrder?.symptoms;
  if (!symptom || !symptom.trim()) {
    throw { status: 400, message: "Lệnh sửa chữa chưa ghi nhận triệu chứng." };
  }

  const keywords = extractSymptomKeywords(symptom);
  const orConditions = keywords.flatMap((kw) => [
    { "$catalog.service_name$": { [Op.iLike]: `%${kw.trim()}%` } },
    { "$quotationItem.issue.error_description$": { [Op.iLike]: `%${kw.trim()}%` } },
    { "$quotationItem.issue.component.name$": { [Op.iLike]: `%${kw.trim()}%` } },
    { "$repairNotes.content$": { [Op.iLike]: `%${kw.trim()}%` } },
  ]);

  const rows = await Tasks.findAll({
    where: { type: "REPAIR", status: "COMPLETED", [Op.or]: orConditions },
    attributes: ["id", "createdAt"],
    subQuery: false,
    include: [
      { model: Service_Catalog, as: "catalog", attributes: ["id", "service_name"] },
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
            include: [{ model: Components, as: "component", attributes: ["id", "name"] }],
          },
        ],
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
        include: [{ model: db.User, as: "technician", attributes: ["id", "fullName"] }],
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
              { model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] },
            ],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });

  return { symptom: symptom.trim(), keywords, results: rows };
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
        where: { type: "INSPECTION", status: "COMPLETED" },
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
        attributes: ["id", "type", "status", "quotation_item_id"],
        required: true,
        include: [
          {
            model: Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name"],
          },
          {
            model: db.Quotation_Details,
            as: "quotationItem",
            attributes: ["id", "repair_price", "unit_price", "quantity", "amount"],
            required: false,
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
