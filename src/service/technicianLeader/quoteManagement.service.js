const db = require("../../../models");
const { Op } = require("sequelize");
const Quotation = db.Quotations;
const QuotationDetail = db.Quotation_Details;
const CustomPartOrder = db.Custom_Part_Orders;
const SparePart = db.Spare_Parts;
const Task = db.Task;
const Issues = db.Vehicle_Issues;
const Components = db.Vehicle_Components;
const Tasks = db.Task;
const Service_Order = db.Service_Orders;
const Customers = db.Customers;
const Users = db.User;
const Vehicles = db.Vehicles;
const Vehicle_Models = db.Vehicle_Models;
const Service_Catalog = db.Service_Catalog;
const { notifyRole, notifyUser } = require("../../util/notification.util");

module.exports.getAllComponents = async () => {
  const components = await Components.findAll({
    attributes: ["id", "name", "parent_id"],
  });
  return components;
};

// Kỹ thuật viên trưởng cầm tablet ra hiện trường, thợ báo lỗi bằng miệng, trưởng nhóm nhập hộ
// vào hệ thống — không còn ràng buộc theo technicianId/Task_Assignment như luồng KTV tự báo cũ.
// INSPECTION chỉ hiện khi đã COMPLETED (kiểm tra xong mới biết lỗi để báo giá lần đầu).
// REPAIR hiện khi chưa xong (PENDING/IN_PROGRESS/WAITING_STOCK — Task không có PAUSED, trạng
// thái đó chỉ tồn tại ở Task_Assignment) — thợ có thể phát hiện lỗi phát sinh bất cứ lúc nào
// trong quá trình sửa, trước khi tự tay hoàn thành task.
module.exports.getActiveTasksForIssueReport = async () => {
  const serviceOrders = await Service_Order.findAll({
    attributes: ["id", "status"],
    where: { status: { [Op.in]: ["INSPECTING", "IN_PROGRESS"] } },
    include: [
      {
        model: Vehicles,
        as: "vehicle",
        attributes: ["id", "license_plate", "color"],
        include: [
          { model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] },
          {
            model: Customers,
            as: "customer",
            attributes: ["id", "name", "phone"],
            include: [{ model: Users, as: "user", attributes: ["id", "fullName", "phoneNumber"] }],
          },
        ],
      },
      {
        model: Tasks,
        as: "tasks",
        required: true,
        where: {
          [Op.or]: [
            { type: "INSPECTION", status: "COMPLETED" },
            { type: "REPAIR", status: { [Op.in]: ["PENDING", "IN_PROGRESS", "WAITING_STOCK"] } },
          ],
        },
        attributes: ["id", "type", "status", "createdAt"],
        include: [
          { model: Service_Catalog, as: "catalog", attributes: ["id", "service_name"] },
          {
            model: db.Task_Assignment,
            as: "assignments",
            attributes: ["id", "role_in_task"],
            include: [{ model: Users, as: "technician", attributes: ["id", "fullName"] }],
          },
        ],
      },
    ],
    order: [["createdAt", "DESC"]],
  });
  return serviceOrders;
};

module.exports.createIssueReports = async (task_id, issues, note) => {
  const task = await Tasks.findOne({
    where: { id: task_id, type: { [Op.in]: ["INSPECTION", "REPAIR"] } },
  });
  if (!task) {
    throw { status: 404, message: "Không tìm thấy công việc phù hợp để ghi nhận lỗi." };
  }
  const records = issues.map((item) => ({
    component_id: item.component_id,
    task_id: task_id,
    error_description: item.description,
    note: note,
  }));
  const issuesRecords = await Issues.bulkCreate(records);

  // Chỉ đóng task + chuyển Service_Order sang chờ báo giá khi đây là task INSPECTION đang chạy —
  // giữ đúng hành vi cũ của createIssueReports. Lỗi phát sinh trong lúc REPAIR không đóng task.
  if (task.type === "INSPECTION" && task.status !== "COMPLETED") {
    await task.update({ status: "COMPLETED" });
    await db.Task_Assignment.update(
      { status: "COMPLETED", actual_end_time: new Date() },
      { where: { task_id: task_id } },
    );
    await Service_Order.update(
      { status: "PENDING_QUOTATION" },
      { where: { id: task.service_order_id } },
    );
    const serviceOrderForBay = await Service_Order.findByPk(task.service_order_id, {
      attributes: ["id", "bay_id"],
    });
    if (serviceOrderForBay && serviceOrderForBay.bay_id) {
      const assignQueuedOrders = require("../../util/assignQueuedOrders.util");
      await db.sequelize.transaction(async (t) => {
        await db.Service_Bays.update(
          { status: "available", current_service_order_id: null },
          { where: { id: serviceOrderForBay.bay_id }, transaction: t },
        );
        await Service_Order.update(
          { bay_id: null, bay_status: "NOT_NEEDED" },
          { where: { id: serviceOrderForBay.id }, transaction: t },
        );
        await assignQueuedOrders(t);
      });
    }
  }

  return issuesRecords;
};

// Báo cáo lỗi phát sinh gắn thẳng theo đơn dịch vụ (Service_Order) — không cần chọn Task.
// Lỗi thuộc về chiếc xe/đơn sửa chữa, không thuộc về "Task đang làm lúc phát hiện" (VD: KTV
// đang rửa xe phát hiện phanh mòn — lỗi đó không liên quan gì tới Task rửa xe). Không đụng tới
// Task/bay/status đơn — chỉ thuần tạo Vehicle_Issues để đợt báo giá kế tiếp của đơn này gom vào.
module.exports.createStandaloneIssueReport = async (service_order_id, issues, note, reported_by_technician_id) => {
  const serviceOrder = await Service_Order.findByPk(service_order_id, {
    attributes: ["id", "status"],
  });
  if (!serviceOrder) {
    throw { status: 404, message: "Không tìm thấy lệnh sửa chữa phù hợp để ghi nhận lỗi." };
  }
  if (reported_by_technician_id) {
    const technician = await Users.findByPk(reported_by_technician_id);
    if (!technician) {
      throw { status: 404, message: "Không tìm thấy kỹ thuật viên đã chọn." };
    }
  }
  const records = issues.map((item) => ({
    component_id: item.component_id,
    service_order_id: service_order_id,
    error_description: item.description,
    note: note,
    reported_by_technician_id: reported_by_technician_id || null,
  }));
  return await Issues.bulkCreate(records);
};

const buildVehicleIncludeForIssue = () => ({
  model: Vehicles,
  as: "vehicle",
  attributes: ["id", "color", "license_plate"],
  include: [
    { model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] },
    {
      model: Customers,
      as: "customer",
      attributes: ["id", "name", "phone"],
      include: [{ model: Users, as: "user", attributes: ["id", "fullName", "phoneNumber"] }],
    },
  ],
});

// Gộp chung 3 nguồn: lỗi từ Task INSPECTION đã hoàn tất (báo giá lần đầu), lỗi phát sinh từ
// Task REPAIR (báo giá bổ sung — luồng KTV/Leader báo qua Task), VÀ lỗi phát sinh gắn thẳng
// theo Service_Order không qua Task (createStandaloneIssueReport) — hiển thị cùng 1 danh sách
// duy nhất cho trưởng nhóm lập báo giá.
module.exports.getIssuesReports = async () => {
  // Task hợp lệ để báo giá: INSPECTION đã COMPLETED, hoặc REPAIR (bất kỳ status — lỗi phát
  // sinh có thể ghi nhận cả khi task đang chạy dở). Dùng subquery thay vì required:true trên
  // include để vẫn cho phép nhánh service_order_id (issue không gắn Task) đi qua where dưới.
  const validTaskIdsSubquery = db.sequelize.literal(`(
    SELECT t.id FROM "Tasks" t
    WHERE (t.type = 'INSPECTION' AND t.status = 'COMPLETED') OR t.type = 'REPAIR'
  )`);
  const issues = await Issues.findAll({
    attributes: ["id", "error_description", "note", "createdAt", "service_order_id"],
    where: {
      id: {
        [Op.notIn]: db.sequelize.literal(`(
              SELECT qd.issue_id
              FROM "Quotation_Details" qd
              WHERE qd.issue_id IS NOT NULL
            )`),
      },
      [Op.or]: [
        { task_id: { [Op.in]: validTaskIdsSubquery } },
        { task_id: null, service_order_id: { [Op.ne]: null } },
      ],
    },
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        required: false,
        include: [
          {
            model: Service_Order,
            as: "serviceOrder",
            attributes: ["id"],
            include: [buildVehicleIncludeForIssue()],
          },
        ],
      },
      {
        model: Service_Order,
        as: "serviceOrder",
        attributes: ["id"],
        required: false,
        include: [buildVehicleIncludeForIssue()],
      },
      {
        model: Components,
        as: "component",
        attributes: ["id", "name", "parent_id"],
        include: [
          { model: Components, as: "parent", attributes: ["id", "name"] },
          { model: Components, as: "children", attributes: ["id", "name"] },
        ],
      },
      {
        model: Users,
        as: "reportedByTechnician",
        attributes: ["id", "fullName"],
        required: false,
      },
    ],
    order: [["createdAt", "DESC"]],
  });
  return issues;
};

module.exports.getSpareParts = async () => {
  const parts = await SparePart.findAll({
    attributes: [
      "id",
      "sku",
      "name",
      "brand",
      "retail_price",
      "stock_quantity",
      [
        db.sequelize.literal(`(
          "Spare_Parts"."stock_quantity" - COALESCE((
            SELECT SUM(qd.quantity)
            FROM "Quotation_Details" qd
            JOIN "Quotations" q ON q.id = qd.quotation_id
            WHERE qd.spare_part_id = "Spare_Parts"."id"
              AND q.status = 'APPROVED'
              AND qd.status = 'PENDING'
          ), 0)
        )`),
        "available_quantity",
      ],
    ],
  });
  return parts;
};

module.exports.getAllService = async () => {
  const service = await Service_Catalog.findAll({
    attributes: ["id", "service_name", "labor_price"],
  });
  return service;
};

module.exports.createQuotation = async (data, leaderId) => {
  let customerUserId = null;
  const quotation = await db.sequelize.transaction(async (t) => {
    let totalAmount = 0;
    const taskInclude = {
      include: [
        {
          model: Service_Order,
          as: "serviceOrder",
          attributes: ["id"],
          include: [
            {
              model: Vehicles,
              as: "vehicle",
              attributes: ["id"],
              include: [{ model: Customers, as: "customer", attributes: ["id", "user_id"] }],
            },
          ],
        },
      ],
      transaction: t,
    };

    let task;
    if (data.task_id) {
      task = await Task.findByPk(data.task_id, taskInclude);
      if (!task) {
        throw { status: 404, message: `Công việc #${data.task_id} không tồn tại` };
      }
    } else if (data.service_order_id) {
      // Lỗi phát sinh gắn thẳng Service_Order (không qua Task) — Quotation.task_id vẫn NOT
      // NULL ở tầng DB nên cần 1 Task bất kỳ của cùng đơn làm điểm neo kỹ thuật, không mang ý
      // nghĩa "báo giá này thuộc hạng mục đó" (giống cách serviceOrder.service.js:549-551 đã
      // làm với Quotation từ dịch vụ lẻ do lễ tân chọn thẳng).
      task = await Task.findOne({
        where: { service_order_id: data.service_order_id },
        order: [["id", "ASC"]],
        ...taskInclude,
      });
      if (!task) {
        throw { status: 404, message: `Lệnh sửa chữa #${data.service_order_id} chưa có công việc nào để lập báo giá` };
      }
    } else {
      throw { status: 400, message: "Thiếu task_id hoặc service_order_id để lập báo giá" };
    }
    customerUserId = task.serviceOrder?.vehicle?.customer?.user_id ?? null;
    const issueIds = [...new Set(data.items.map((item) => item.issue_id).filter(Boolean))];
    if (issueIds.length > 0) {
      const issues = await Issues.findAll({
        where: { id: issueIds },
        attributes: ["id", "task_id", "service_order_id"],
        transaction: t,
      });
      if (issues.length !== issueIds.length) {
        const foundIds = issues.map((i) => i.id);
        const missingId = issueIds.find((id) => !foundIds.includes(id));
        throw { status: 404, message: `Lỗi #${missingId} không tồn tại` };
      }
      // Issue thuộc đúng báo giá này nếu gắn cùng task_id (luồng cũ), HOẶC không gắn Task nào
      // mà gắn thẳng cùng service_order_id (lỗi phát sinh không qua Task — createStandaloneIssueReport).
      const foreignIssue = issues.find((issue) => {
        if (issue.task_id) return issue.task_id !== task.id;
        return issue.service_order_id !== task.service_order_id;
      });
      if (foreignIssue) {
        throw { status: 400, message: `Lỗi #${foreignIssue.id} không thuộc công việc #${task.id}` };
      }
    }
    const detailsData = [];
    // Phụ tùng đặt riêng tách ra Custom_Part_Orders sau khi đã có id của dòng shell —
    // gom lại đây để tạo sau vòng lặp, đánh dấu bằng index trong detailsData.
    const customPartOrdersToCreate = [];
    const usedInThisRequest = new Map();
    for (const item of data.items) {
      let unitPrice = 0;
      let repairPrice = 0;
      let amount = 0;
      let partOutOfStock = false;
      if (item.spare_part_id) {
        const part = await SparePart.findByPk(item.spare_part_id, { transaction: t });
        if (!part) {
          throw { status: 404, message: `Phụ tùng #${item.spare_part_id} không tồn tại` };
        }
        // Tồn khả dụng = tồn kho - phần đã bị báo giá APPROVED khác giữ chỗ (giống getSpareParts).
        const heldQuantity = await QuotationDetail.sum("quantity", {
          where: { spare_part_id: item.spare_part_id, status: "PENDING" },
          include: [{ model: Quotation, as: "quotation", attributes: [], where: { status: "APPROVED" }, required: true }],
          transaction: t,
        });
        const alreadyUsed = usedInThisRequest.get(item.spare_part_id) || 0;
        const availableQuantity = Number(part.stock_quantity) - Number(heldQuantity || 0) - alreadyUsed;
        // Thiếu tồn vẫn được thêm vào báo giá bình thường (khách vẫn cần thấy đầy đủ hạng mục) —
        // chỉ đánh dấu WAITING_STOCK để tạo Restock_Requests sau khi khách duyệt báo giá.
        partOutOfStock = availableQuantity < item.quantity;
        usedInThisRequest.set(item.spare_part_id, alreadyUsed + item.quantity);
        unitPrice = part.retail_price;
        amount = item.quantity * unitPrice;
      } else if (item.custom_item_name) {
        if (!item.unit_price || item.unit_price <= 0) {
          throw { status: 400, message: "Vui lòng nhập giá cho phụ tùng đặt riêng" };
        }
        unitPrice = item.unit_price;
        amount = item.quantity * unitPrice;
      } else {
        const service = await Service_Catalog.findByPk(item.service_id, { transaction: t });
        if (!service) {
          throw { status: 404, message: `Dịch vụ #${item.service_id} không tồn tại` };
        }
        repairPrice = item.repair_price ?? service.labor_price;
        amount = item.quantity * repairPrice;
      }
      totalAmount += amount;
      const detailIndex = detailsData.length;
      detailsData.push({
        issue_id: item.issue_id || null,
        spare_part_id: item.spare_part_id || null,
        service_id: item.service_id || null,
        // custom_item_name không còn ghi ở đây — tên/giá/cọc của phụ tùng đặt riêng sống ở
        // Custom_Part_Orders, dòng này chỉ là "shell" giữ issue_id/amount cho tổng báo giá.
        custom_item_name: null,
        quantity: item.quantity,
        unit_price: unitPrice || 0,
        repair_price: repairPrice || 0,
        amount,
        status: item.custom_item_name ? "CUSTOM_ORDERED" : partOutOfStock ? "WAITING_STOCK" : "PENDING",
      });
      if (item.custom_item_name) {
        customPartOrdersToCreate.push({
          detailIndex,
          item_name: item.custom_item_name,
          quantity: item.quantity,
          unit_price: unitPrice,
        });
      }
    }
    // Gara sửa chữa không bán rời phụ tùng — mỗi hạng mục lỗi (issue) có phụ tùng đính kèm thì
    // bắt buộc phải có ít nhất 1 dòng dịch vụ/công sửa chữa đi cùng issue đó.
    const issuesWithService = new Set(
      detailsData.filter((item) => item.service_id).map((item) => item.issue_id),
    );
    const orphanPartIssueId = detailsData.find(
      (item) =>
        !item.service_id &&
        (item.spare_part_id || item.custom_item_name) &&
        item.issue_id &&
        !issuesWithService.has(item.issue_id),
    )?.issue_id;
    if (orphanPartIssueId) {
      throw {
        status: 400,
        message: `Lỗi #${orphanPartIssueId} có phụ tùng nhưng chưa có dịch vụ sửa chữa đi kèm. Vui lòng thêm dịch vụ cho hạng mục lỗi này trước khi lưu báo giá.`,
      };
    }
    const quotation = await Quotation.create(
      {
        task_id: task.id,
        created_by: leaderId,
        total_amount: totalAmount,
        deposit_amount: data.deposit_amount || 0,
        status: "PENDING",
        note: data.note || null,
      },
      { transaction: t },
    );
    const details = detailsData.map((item) => ({ ...item, quotation_id: quotation.id }));
    const createdDetails = await QuotationDetail.bulkCreate(details, { transaction: t });
    if (customPartOrdersToCreate.length > 0) {
      await CustomPartOrder.bulkCreate(
        customPartOrdersToCreate.map((row) => ({
          quotation_detail_id: createdDetails[row.detailIndex].id,
          item_name: row.item_name,
          quantity: row.quantity,
          unit_price: row.unit_price,
        })),
        { transaction: t },
      );
    }
    return quotation;
  });
  if (customerUserId) {
    await notifyUser(
      customerUserId,
      {
        title: "Có báo giá mới cần duyệt",
        content: `Xưởng đã lập báo giá #${quotation.id} cho xe của bạn, vui lòng kiểm tra và duyệt.`,
        notificationType: "SERVICE_ORDER",
        referenceId: quotation.id,
      },
      "new_notification",
      { type: "QUOTATION_CREATED", quotationId: quotation.id },
    );
  }
  return quotation;
};

module.exports.updateQuotation = async (id, data, leaderId) => {
  let customerUserId = null;
  const quotation = await db.sequelize.transaction(async (t) => {
    const quotation = await Quotation.findByPk(id, {
      include: [
        {
          model: Task,
          as: "task",
          attributes: ["id", "service_order_id"],
          include: [
            {
              model: Service_Order,
              as: "serviceOrder",
              attributes: ["id"],
              include: [
                {
                  model: Vehicles,
                  as: "vehicle",
                  attributes: ["id"],
                  include: [{ model: Customers, as: "customer", attributes: ["id", "user_id"] }],
                },
              ],
            },
          ],
        },
      ],
      transaction: t,
    });
    if (!quotation) {
      throw { status: 404, message: "Không tìm thấy báo giá" };
    }
    customerUserId = quotation.task?.serviceOrder?.vehicle?.customer?.user_id ?? null;
    if (!["PENDING", "REJECTED"].includes(quotation.status)) {
      throw { status: 400, message: "Chỉ có thể cập nhật báo giá đang ở trạng thái PENDING hoặc REJECTED" };
    }
    const issueIds = [...new Set(data.items.map((item) => item.issue_id).filter(Boolean))];
    if (issueIds.length > 0) {
      const issues = await Issues.findAll({
        where: { id: issueIds },
        attributes: ["id", "task_id", "service_order_id"],
        transaction: t,
      });
      if (issues.length !== issueIds.length) {
        const foundIds = issues.map((i) => i.id);
        const missingId = issueIds.find((id) => !foundIds.includes(id));
        throw { status: 404, message: `Lỗi #${missingId} không tồn tại` };
      }
      // Giống createQuotation: chấp nhận issue gắn cùng task_id, hoặc gắn thẳng cùng
      // service_order_id khi không có task_id (lỗi phát sinh không qua Task).
      const foreignIssue = issues.find((issue) => {
        if (issue.task_id) return issue.task_id !== quotation.task_id;
        return issue.service_order_id !== quotation.task?.service_order_id;
      });
      if (foreignIssue) {
        throw { status: 400, message: `Lỗi #${foreignIssue.id} không thuộc công việc của báo giá` };
      }
    }
    let totalAmount = 0;
    const detailsData = [];
    const customPartOrdersToCreate = [];
    const usedInThisRequest = new Map();
    for (const item of data.items) {
      let unitPrice = 0;
      let repairPrice = 0;
      let amount = 0;
      let partOutOfStock = false;
      if (item.spare_part_id) {
        const part = await SparePart.findByPk(item.spare_part_id, { transaction: t });
        if (!part) {
          throw { status: 404, message: `Phụ tùng #${item.spare_part_id} không tồn tại` };
        }
        const heldQuantity = await QuotationDetail.sum("quantity", {
          where: { spare_part_id: item.spare_part_id, status: "PENDING", quotation_id: { [Op.ne]: id } },
          include: [{ model: Quotation, as: "quotation", attributes: [], where: { status: "APPROVED" }, required: true }],
          transaction: t,
        });
        const alreadyUsed = usedInThisRequest.get(item.spare_part_id) || 0;
        const availableQuantity = Number(part.stock_quantity) - Number(heldQuantity || 0) - alreadyUsed;
        partOutOfStock = availableQuantity < item.quantity;
        usedInThisRequest.set(item.spare_part_id, alreadyUsed + item.quantity);
        unitPrice = part.retail_price;
        amount = item.quantity * unitPrice;
      } else if (item.custom_item_name) {
        if (!item.unit_price || item.unit_price <= 0) {
          throw { status: 400, message: "Vui lòng nhập giá cho phụ tùng đặt riêng" };
        }
        unitPrice = item.unit_price;
        amount = item.quantity * unitPrice;
      } else {
        const service = await Service_Catalog.findByPk(item.service_id, { transaction: t });
        if (!service) {
          throw { status: 404, message: `Dịch vụ #${item.service_id} không tồn tại` };
        }
        repairPrice = item.repair_price ?? service.labor_price;
        amount = item.quantity * repairPrice;
      }
      totalAmount += amount;
      const detailIndex = detailsData.length;
      detailsData.push({
        quotation_id: quotation.id,
        issue_id: item.issue_id || null,
        spare_part_id: item.spare_part_id || null,
        service_id: item.service_id || null,
        custom_item_name: null,
        quantity: item.quantity,
        unit_price: unitPrice || 0,
        repair_price: repairPrice || 0,
        amount,
        status: item.custom_item_name ? "CUSTOM_ORDERED" : partOutOfStock ? "WAITING_STOCK" : "PENDING",
      });
      if (item.custom_item_name) {
        customPartOrdersToCreate.push({
          detailIndex,
          item_name: item.custom_item_name,
          quantity: item.quantity,
          unit_price: unitPrice,
        });
      }
    }
    const issuesWithService = new Set(
      detailsData.filter((item) => item.service_id).map((item) => item.issue_id),
    );
    const orphanPartIssueId = detailsData.find(
      (item) =>
        !item.service_id &&
        (item.spare_part_id || item.custom_item_name) &&
        item.issue_id &&
        !issuesWithService.has(item.issue_id),
    )?.issue_id;
    if (orphanPartIssueId) {
      throw {
        status: 400,
        message: `Lỗi #${orphanPartIssueId} có phụ tùng nhưng chưa có dịch vụ sửa chữa đi kèm. Vui lòng thêm dịch vụ cho hạng mục lỗi này trước khi lưu báo giá.`,
      };
    }
    // Xóa hết dòng cũ — Custom_Part_Orders liên kết bị cascade xóa theo (FK onDelete: CASCADE).
    await QuotationDetail.destroy({ where: { quotation_id: id }, transaction: t });
    const createdDetails = await QuotationDetail.bulkCreate(detailsData, { transaction: t });
    if (customPartOrdersToCreate.length > 0) {
      await CustomPartOrder.bulkCreate(
        customPartOrdersToCreate.map((row) => ({
          quotation_detail_id: createdDetails[row.detailIndex].id,
          item_name: row.item_name,
          quantity: row.quantity,
          unit_price: row.unit_price,
        })),
        { transaction: t },
      );
    }
    await quotation.update(
      {
        total_amount: totalAmount,
        deposit_amount: data.deposit_amount !== undefined ? data.deposit_amount : quotation.deposit_amount,
        status: "PENDING",
        approved_at: null,
        updated_by: leaderId,
        note: data.note !== undefined ? data.note : quotation.note,
      },
      { transaction: t },
    );
    return quotation;
  });
  if (customerUserId) {
    await notifyUser(
      customerUserId,
      {
        title: "Báo giá đã được cập nhật",
        content: `Xưởng vừa cập nhật lại báo giá #${quotation.id} cho xe của bạn, vui lòng kiểm tra và duyệt.`,
        notificationType: "SERVICE_ORDER",
        referenceId: quotation.id,
      },
      "new_notification",
      { type: "QUOTATION_UPDATED", quotationId: quotation.id },
    );
  }
  return quotation;
};

module.exports.getQuoteHistory = async () => {
  const result = await Quotation.findAll({
    attributes: [
      "id", "task_id", "created_by", "updated_by", "total_amount", "deposit_amount",
      "deposit_paid_at", "approval_method", "approved_phone", "status", "note",
      "rejection_reason", "approved_at", "createdAt",
    ],
    include: [
      { model: Users, as: "creator", attributes: ["id", "fullName"] },
      { model: Users, as: "updater", attributes: ["id", "fullName"] },
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        include: [
          {
            model: Service_Order,
            as: "serviceOrder",
            attributes: ["id", "symptoms"],
            include: [
              {
                model: Vehicles,
                as: "vehicle",
                attributes: ["id", "color", "license_plate"],
                include: [
                  { model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] },
                  {
                    model: Customers,
                    as: "customer",
                    attributes: ["id", "name", "phone"],
                    include: [{ model: Users, as: "user", attributes: ["id", "fullName", "phoneNumber"] }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        model: QuotationDetail,
        as: "items",
        attributes: ["id", "quantity", "unit_price", "repair_price", "amount", "custom_item_name", "status"],
        include: [
          {
            model: Issues,
            as: "issue",
            attributes: ["id", "error_description", "note"],
            include: [
              {
                model: Components,
                as: "component",
                attributes: ["id", "name", "parent_id"],
                include: [
                  { model: Components, as: "parent", attributes: ["id", "name"] },
                  { model: Components, as: "children", attributes: ["id", "name"] },
                ],
              },
            ],
          },
          { model: SparePart, as: "sparePart", attributes: ["id", "name", "sku", "brand", "retail_price"] },
          { model: Service_Catalog, as: "service_catalog", attributes: ["id", "service_name", "labor_price"] },
          {
            model: CustomPartOrder,
            as: "customPartOrder",
            attributes: ["id", "item_name", "quantity", "unit_price", "actual_unit_price", "arrived_at", "status"],
          },
        ],
      },
    ],
    order: [
      [
        db.sequelize.literal(`CASE "Quotations"."status"
      WHEN 'PENDING'  THEN 1
      WHEN 'APPROVED' THEN 2
      WHEN 'EXPORTED' THEN 3
      WHEN 'REJECTED' THEN 4
      ELSE 5
    END`),
      ],
      ["createdAt", "DESC"],
    ],
  });
  return result;
};

module.exports.getQuotationById = async (id) => {
  const quotation = await Quotation.findByPk(id, {
    attributes: [
      "id", "total_amount", "deposit_amount", "deposit_paid_at", "status", "note",
      "rejection_reason", "approval_method", "approved_at", "createdAt",
    ],
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        include: [
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
                  { model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] },
                  {
                    model: Customers,
                    as: "customer",
                    attributes: ["id", "name", "phone"],
                    include: [{ model: Users, as: "user", attributes: ["id", "fullName", "phoneNumber"] }],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        model: QuotationDetail,
        as: "items",
        attributes: ["id", "quantity", "unit_price", "repair_price", "amount", "custom_item_name", "status"],
        include: [
          {
            model: Issues,
            as: "issue",
            attributes: ["id", "error_description", "note"],
            include: [
              {
                model: Components,
                as: "component",
                attributes: ["id", "name", "parent_id"],
                include: [{ model: Components, as: "parent", attributes: ["id", "name"] }],
              },
            ],
          },
          { model: SparePart, as: "sparePart", attributes: ["id", "name", "sku"] },
          { model: Service_Catalog, as: "service_catalog", attributes: ["id", "service_name"] },
          {
            model: CustomPartOrder,
            as: "customPartOrder",
            attributes: ["id", "item_name", "quantity", "unit_price", "actual_unit_price", "arrived_at", "status"],
          },
        ],
      },
    ],
  });
  if (!quotation) {
    throw { status: 404, message: "Không tìm thấy báo giá" };
  }
  return quotation;
};

// Kỹ thuật viên trưởng cầm tablet ra tận nơi cho khách xem và xác nhận tại chỗ (thay cho lễ tân
// duyệt hộ trước đây) — không OTP, giữ nguyên logic phát sinh Task REPAIR sau khi duyệt.
// approvedByRole phân biệt ai bấm duyệt để lưu đúng approval_method — Leader tự duyệt tại chỗ
// (khách đứng trước mặt) hoặc Lễ tân duyệt hộ sau khi gọi điện/gửi Zalo xác nhận với khách.
module.exports.approveQuotation = async (id, approvedByRole = "TECHNICIAN_LEADER") => {
  return await db.sequelize.transaction(async (t) => {
    const quotation = await Quotation.findByPk(id, {
      include: [{ model: QuotationDetail, as: "items", attributes: ["id", "service_id", "issue_id", "spare_part_id", "quantity", "status"] }],
      transaction: t,
    });
    if (!quotation) {
      throw { status: 404, message: "Báo giá không tồn tại" };
    }
    if (quotation.status !== "PENDING") {
      throw { status: 400, message: "Báo giá đã được xử lý, không thể thay đổi" };
    }
    const inspectionTask = await Task.findByPk(quotation.task_id, { transaction: t });
    if (!inspectionTask) {
      throw { status: 404, message: "Không tìm thấy công việc kiểm tra của báo giá" };
    }
    const serviceItems = quotation.items.filter((item) => item.service_id);
    if (serviceItems.length > 0) {
      const createdTasks = await Task.bulkCreate(
        serviceItems.map((item) => ({
          service_order_id: inspectionTask.service_order_id,
          quotation_item_id: item.id,
          service_catalog_id: item.service_id,
          type: "REPAIR",
          status: "PENDING",
        })),
        { transaction: t },
      );
      // Gán ngược task_id cho toàn bộ dòng Quotation_Details cùng issue_id với dòng dịch vụ vừa
      // sinh Task — bao gồm cả dòng phụ tùng đi kèm (spare_part_id), để xuất/nhập kho sau này
      // biết chính xác phụ tùng đó đang chờ đúng Task nào, không phải đi vòng qua Quotation.task_id.
      // issue_id null (phí chung không gắn lỗi cụ thể) thì chỉ gán đúng chính dòng dịch vụ đó,
      // tránh gộp nhầm các dòng phí chung khác cùng quotation cũng có issue_id null.
      for (let i = 0; i < serviceItems.length; i++) {
        const serviceItem = serviceItems[i];
        const createdTask = createdTasks[i];
        await QuotationDetail.update(
          { task_id: createdTask.id },
          {
            where: serviceItem.issue_id
              ? { quotation_id: quotation.id, issue_id: serviceItem.issue_id }
              : { id: serviceItem.id },
            transaction: t,
          },
        );
      }
      await Service_Order.update(
        { status: "IN_PROGRESS" },
        { where: { id: inspectionTask.service_order_id, status: "PENDING_QUOTATION" }, transaction: t },
      );
      // Xếp vào hàng đợi, chờ kỹ thuật viên trưởng tự gán cầu nâng + KTV thủ công (assignTask)
      // — không còn tự động gán ngay khi duyệt.
      await Service_Order.update(
        { bay_status: "WAITING" },
        { where: { id: inspectionTask.service_order_id }, transaction: t },
      );
    }
    await quotation.update(
      { status: "APPROVED", approved_at: new Date(), approval_method: approvedByRole },
      { transaction: t },
    );

    // Phụ tùng kho thiếu tồn được giữ nguyên trong báo giá (không chặn lúc soạn) — chỉ khi
    // báo giá thực sự được duyệt mới tạo yêu cầu nhập kho cho thủ kho xử lý.
    const waitingStockItems = quotation.items.filter((item) => item.status === "WAITING_STOCK" && item.spare_part_id);
    if (waitingStockItems.length > 0) {
      await db.Restock_Requests.bulkCreate(
        waitingStockItems.map((item) => ({
          spare_part_id: item.spare_part_id,
          quotation_detail_id: item.id,
          quantity_needed: item.quantity,
          requested_by: quotation.created_by,
          status: "PENDING",
        })),
        { transaction: t },
      );
    }
    return quotation;
  }).then(async (quotation) => {
    const approverLabel = approvedByRole === "RECEPTIONIST" ? "lễ tân" : "kỹ thuật viên trưởng";
    await notifyRole(
      "INVENTORY_MANAGER",
      {
        title: "Có báo giá cần xuất phụ tùng",
        content: `Báo giá #${quotation.id} đã được duyệt (${approverLabel}), cần chuẩn bị xuất phụ tùng.`,
        notificationType: "SERVICE_ORDER",
        referenceId: quotation.id,
      },
      "new_notification",
      { type: "QUOTATION_APPROVED", quotationId: quotation.id },
    );
    await notifyRole(
      "RECEPTIONIST",
      {
        title: "Báo giá đã được duyệt",
        content: `Báo giá #${quotation.id} đã được khách duyệt, chuẩn bị thu tiền cọc/thanh toán khi cần.`,
        notificationType: "SERVICE_ORDER",
        referenceId: quotation.id,
      },
      "new_notification",
      { type: "QUOTATION_APPROVED", quotationId: quotation.id },
    );
    return quotation;
  });
};

// Giữ nguyên cho lễ tân dùng khi thu cọc/thanh toán — không thuộc phạm vi việc chuyển giao lần này.
module.exports.getPaymentSummaryByServiceOrder = async (serviceOrderId) => {
  const quotations = await Quotation.findAll({
    attributes: ["id", "total_amount", "deposit_amount", "deposit_paid_at", "approved_at", "createdAt"],
    where: { status: "APPROVED" },
    include: [
      { model: Tasks, as: "task", attributes: ["id"], where: { service_order_id: serviceOrderId }, required: true },
      {
        model: QuotationDetail,
        as: "items",
        attributes: ["id", "amount", "status"],
        include: [{ model: CustomPartOrder, as: "customPartOrder", attributes: ["id"], required: false }],
      },
    ],
    order: [["createdAt", "ASC"]],
  });
  const grandTotal = quotations.reduce(
    (sum, q) => sum + q.items.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + Number(i.amount), 0),
    0,
  );
  // Cọc đặt riêng không hoàn khi hạng mục bị hủy (đóng sớm), nhưng cũng không được trừ vào tiền
  // phải trả của hạng mục khác còn giữ — tính lại 30% chỉ trên dòng đặt riêng CÒN GIỮ, giống
  // đúng công thức ở getServiceOrdersAwaitingPayment (serviceOrder.service.js).
  const totalDeposit = quotations.reduce((sum, q) => {
    const customItemsTotal = q.items
      .filter((i) => i.status !== "CANCELLED" && i.customPartOrder)
      .reduce((s, i) => s + Number(i.amount), 0);
    return sum + Math.round(customItemsTotal * 0.3);
  }, 0);
  return {
    serviceOrderId,
    quotations,
    grandTotal,
    totalDeposit,
    remainingAmount: grandTotal - totalDeposit,
  };
};
