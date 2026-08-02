const { email } = require("zod");
const db = require("../../../models");
const { Op } = require("sequelize");
const Quotation = db.Quotations;
const QuotationDetail = db.Quotation_Details;
const SparePart = db.Spare_Parts;
const Task = db.Task;
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
const Service_Catalog = db.Service_Catalog;
const admin = require("../../config/firebase.config");
const { normalizeVnPhone } = require("../../util/phone.util");
const { notifyRole, notifyUser } = require("../../util/notification.util");

const transporter = require("../../config/mailer.config");
const {
  quotationEmailTemplate,
} = require("../../templates/quotation.template");
const { generateQuotationActionToken } = require("../../util/jwt.util");

module.exports.getIssuesReports = async () => {
  const issues = await Issues.findAll({
    attributes: ["id", "error_description", "note", "createdAt"],
    where: {
      id: {
        [Op.notIn]: db.sequelize.literal(`(
              SELECT qd.issue_id
              FROM "Quotation_Details" qd
              JOIN "Quotations" q ON q.id = qd.quotation_id
              WHERE qd.issue_id IS NOT NULL
                AND q.status != 'REJECTED'
            )`),
      },
    },
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        where: { status: "COMPLETED" },
        required: true,
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

module.exports.getAdditionalIssuesReports = async () => {
  const issues = await Issues.findAll({
    attributes: ["id", "error_description", "note", "createdAt"],
    where: {
      id: {
        [Op.notIn]: db.sequelize.literal(`(
              SELECT qd.issue_id
              FROM "Quotation_Details" qd
              JOIN "Quotations" q ON q.id = qd.quotation_id
              WHERE qd.issue_id IS NOT NULL
                AND q.status != 'REJECTED'
            )`),
      },
    },
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id", "service_order_id"],
        where: { type: "REPAIR", status: "IN_PROGRESS" },
        required: true,
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

module.exports.createQuotation = async (data, receptionistId) => {
  let customerUserId = null;
  const quotation = await db.sequelize.transaction(async (t) => {
    let totalAmount = 0;
    const task = await Task.findByPk(data.task_id, {
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
              include: [
                { model: Customers, as: "customer", attributes: ["id", "user_id"] },
              ],
            },
          ],
        },
      ],
      transaction: t,
    });
    if (!task) {
      throw {
        status: 404,
        message: `Công việc #${data.task_id} không tồn tại`,
      };
    }
    customerUserId = task.serviceOrder?.vehicle?.customer?.user_id ?? null;
    const issueIds = [
      ...new Set(data.items.map((item) => item.issue_id).filter(Boolean)),
    ];
    if (issueIds.length > 0) {
      const issues = await Issues.findAll({
        where: { id: issueIds },
        attributes: ["id", "task_id"],
        transaction: t,
      });
      if (issues.length !== issueIds.length) {
        const foundIds = issues.map((i) => i.id);
        const missingId = issueIds.find((id) => !foundIds.includes(id));
        throw { status: 404, message: `Lỗi #${missingId} không tồn tại` };
      }
      const foreignIssue = issues.find((issue) => issue.task_id !== task.id);
      if (foreignIssue) {
        throw {
          status: 400,
          message: `Lỗi #${foreignIssue.id} không thuộc công việc #${task.id}`,
        };
      }
    }
    const detailsData = [];
    for (const item of data.items) {
      let unitPrice = 0;
      let repairPrice = 0;
      let amount = 0;
      if (item.spare_part_id) {
        const part = await SparePart.findByPk(item.spare_part_id, {
          transaction: t,
        });
        if (!part) {
          throw {
            status: 404,
            message: `Phụ tùng #${item.spare_part_id} không tồn tại`,
          };
        }
        unitPrice = part.retail_price;
        amount = item.quantity * unitPrice;
      } else if (item.custom_item_name) {
        if (!item.unit_price || item.unit_price <= 0) {
          throw {
            status: 400,
            message: "Vui lòng nhập giá cho phụ tùng đặt riêng",
          };
        }
        unitPrice = item.unit_price;
        amount = item.quantity * unitPrice;
      } else {
        const service = await Service_Catalog.findByPk(item.service_id, {
          transaction: t,
        });
        if (!service) {
          throw {
            status: 404,
            message: `Dịch vụ #${item.service_id} không tồn tại`,
          };
        }
        repairPrice = item.repair_price ?? service.labor_price;
        amount = item.quantity * repairPrice;
      }
      totalAmount += amount;
      detailsData.push({
        issue_id: item.issue_id || null,
        spare_part_id: item.spare_part_id || null,
        service_id: item.service_id || null,
        custom_item_name: item.custom_item_name || null,
        quantity: item.quantity,
        unit_price: unitPrice || 0,
        repair_price: repairPrice || 0,
        amount,
        status: item.custom_item_name ? "WAITING_DEPOSIT" : "PENDING",

      });
    }
    const quotation = await Quotation.create(
      {
        task_id: data.task_id,
        created_by: receptionistId,
        total_amount: totalAmount,
        deposit_amount: data.deposit_amount || 0,
        status: "PENDING",
        note: data.note || null,
      },
      { transaction: t },
    );
    const details = detailsData.map((item) => ({
      ...item,
      quotation_id: quotation.id,
    }));
    await QuotationDetail.bulkCreate(details, { transaction: t });
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
      {
        type: "QUOTATION_CREATED",
        quotationId: quotation.id,
      },
    );
  }
  return quotation;
};

module.exports.updateQuotation = async (id, data, receptionistId) => {
  let customerUserId = null;
  const quotation = await db.sequelize.transaction(async (t) => {
    const quotation = await Quotation.findByPk(id, {
      include: [
        {
          model: Task,
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
                  attributes: ["id"],
                  include: [
                    { model: Customers, as: "customer", attributes: ["id", "user_id"] },
                  ],
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
      throw {
        status: 400,
        message:
          "Chỉ có thể cập nhật báo giá đang ở trạng thái PENDING hoặc REJECTED",
      };
    }
    const issueIds = [
      ...new Set(data.items.map((item) => item.issue_id).filter(Boolean)),
    ];
    if (issueIds.length > 0) {
      const issues = await Issues.findAll({
        where: { id: issueIds },
        attributes: ["id", "task_id"],
        transaction: t,
      });
      if (issues.length !== issueIds.length) {
        const foundIds = issues.map((i) => i.id);
        const missingId = issueIds.find((id) => !foundIds.includes(id));
        throw { status: 404, message: `Lỗi #${missingId} không tồn tại` };
      }
      const foreignIssue = issues.find(
        (issue) => issue.task_id !== quotation.task_id,
      );
      if (foreignIssue) {
        throw {
          status: 400,
          message: `Lỗi #${foreignIssue.id} không thuộc công việc của báo giá`,
        };
      }
    }
    await QuotationDetail.destroy({
      where: { quotation_id: id },
      transaction: t,
    });
    let totalAmount = 0;
    const detailsData = [];
    for (const item of data.items) {
      let unitPrice = 0;
      let repairPrice = 0;
      let amount = 0;
      if (item.spare_part_id) {
        const part = await SparePart.findByPk(item.spare_part_id, {
          transaction: t,
        });
        if (!part) {
          throw {
            status: 404,
            message: `Phụ tùng #${item.spare_part_id} không tồn tại`,
          };
        }
        unitPrice = part.retail_price;
        amount = item.quantity * unitPrice;
      } else if (item.custom_item_name) {
        if (!item.unit_price || item.unit_price <= 0) {
          throw {
            status: 400,
            message: "Vui lòng nhập giá cho phụ tùng đặt riêng",
          };
        }
        unitPrice = item.unit_price;
        amount = item.quantity * unitPrice;
      } else {
        const service = await Service_Catalog.findByPk(item.service_id, {
          transaction: t,
        });
        if (!service) {
          throw {
            status: 404,
            message: `Dịch vụ #${item.service_id} không tồn tại`,
          };
        }
        repairPrice = item.repair_price ?? service.labor_price;
        amount = item.quantity * repairPrice;
      }
      totalAmount += amount;
      detailsData.push({
        quotation_id: quotation.id,
        issue_id: item.issue_id || null,
        spare_part_id: item.spare_part_id || null,
        service_id: item.service_id || null,
        custom_item_name: item.custom_item_name || null,
        quantity: item.quantity,
        unit_price: unitPrice || 0,
        repair_price: repairPrice || 0,
        amount,
        status: item.custom_item_name ? "WAITING_DEPOSIT" : "PENDING",

      });
    }
    await QuotationDetail.bulkCreate(detailsData, { transaction: t });
    await quotation.update(
      {
        total_amount: totalAmount,
        deposit_amount: data.deposit_amount !== undefined ? data.deposit_amount : quotation.deposit_amount,
        status: "PENDING",
        approved_at: null,
        updated_by: receptionistId,
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
      {
        type: "QUOTATION_UPDATED",
        quotationId: quotation.id,
      },
    );
  }
  return quotation;
};

// Hàm lấy tổng tiền thanh toán dịch vụ
module.exports.getPaymentSummaryByServiceOrder = async (serviceOrderId) => {
  const quotations = await Quotation.findAll({
    attributes: [
      "id",
      "total_amount",
      "deposit_amount",
      "deposit_paid_at",
      "approved_at",
      "createdAt",
    ],
    where: { status: "APPROVED" },
    include: [
      {
        model: Tasks,
        as: "task",
        attributes: ["id"],
        where: { service_order_id: serviceOrderId },
        required: true,
      },
    ],
    order: [["createdAt", "ASC"]],
  });

  const grandTotal = quotations.reduce(
    (sum, q) => sum + Number(q.total_amount),
    0,
  );
  const totalDeposit = quotations.reduce(
    (sum, q) => sum + Number(q.deposit_amount || 0),
    0,
  );

  return {
    serviceOrderId,
    quotations,
    grandTotal,
    totalDeposit,
    remainingAmount: grandTotal - totalDeposit,
  };
};

// Hóa đơn tổng hợp khi trả xe: gộp toàn bộ hạng mục (dịch vụ + phụ tùng) từ TẤT CẢ báo giá
// đã duyệt của lệnh sửa chữa, kèm thông tin khách hàng/xe - chỉ để xem/in, không xử lý thanh toán.
module.exports.getServiceOrderInvoice = async (serviceOrderId) => {
  const serviceOrder = await Service_Order.findByPk(serviceOrderId, {
    attributes: ["id", "status", "entry_time", "actual_finish_time", "exit_time"],
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
    ],
  });
  if (!serviceOrder) {
    throw { status: 404, message: "Không tìm thấy lệnh sửa chữa" };
  }

  const quotations = await Quotation.findAll({
    attributes: ["id", "total_amount", "deposit_amount", "deposit_paid_at", "approved_at", "createdAt"],
    where: { status: "APPROVED" },
    include: [
      { model: Tasks, as: "task", attributes: ["id"], where: { service_order_id: serviceOrderId }, required: true },
      {
        model: QuotationDetail,
        as: "items",
        attributes: ["id", "quantity", "unit_price", "repair_price", "amount", "custom_item_name"],
        include: [
          {
            model: Issues,
            as: "issue",
            attributes: ["id", "error_description"],
            include: [{ model: Components, as: "component", attributes: ["id", "name"] }],
          },
          { model: SparePart, as: "sparePart", attributes: ["id", "name", "sku"] },
          { model: Service_Catalog, as: "service_catalog", attributes: ["id", "service_name"] },
        ],
      },
    ],
    order: [["createdAt", "ASC"]],
  });

  const items = quotations.flatMap((q) => q.items);
  const grandTotal = quotations.reduce((sum, q) => sum + Number(q.total_amount), 0);
  const totalDeposit = quotations.reduce((sum, q) => sum + Number(q.deposit_amount || 0), 0);

  return {
    serviceOrder,
    quotationIds: quotations.map((q) => q.id),
    items,
    grandTotal,
    totalDeposit,
    remainingAmount: grandTotal - totalDeposit,
  };
};

module.exports.getQuoteHistory = async () => {
  const result = await Quotation.findAll({
    attributes: [
      "id",
      "task_id",
      "created_by",
      "updated_by",
      "total_amount",
      "deposit_amount",
      "deposit_paid_at",
      "approval_method",
      "approved_phone",
      "status",
      "note",
      "approved_at",
      "createdAt",
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
        model: QuotationDetail,
        as: "items",
        attributes: ["id", "quantity", "unit_price", "repair_price", "amount", "custom_item_name", "status",
        ],
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
          },
          {
            model: SparePart,
            as: "sparePart",
            attributes: ["id", "name", "sku", "brand", "retail_price"],
          },
          {
            model: Service_Catalog,
            as: "service_catalog",
            attributes: ["id", "service_name", "labor_price"],
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
      "id",
      "total_amount",
      "deposit_amount",
      "deposit_paid_at",
      "status",
      "note",
      "approval_method",
      "approved_at",
      "createdAt",
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
                ],
              },
            ],
          },
          {
            model: SparePart,
            as: "sparePart",
            attributes: ["id", "name", "sku"],
          },
          {
            model: Service_Catalog,
            as: "service_catalog",
            attributes: ["id", "service_name"],
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

module.exports.approveQuotationByOTP = async (id, idToken) => {
  let decoded;
  try {
    console.log("Firebase Admin project:", admin.app().options.projectId);
    decoded = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    console.error("VERIFY FIREBASE TOKEN ERROR:", {
      code: e.code,
      message: e.message,
    });
    throw { status: 401, message: "Xác thực OTP không hợp lệ" };
  }
  const verifiedPhone = decoded.phone_number;
  if (!verifiedPhone) {
    throw { status: 400, message: "Không lấy được số điện thoại từ xác thực" };
  }
  return await db.sequelize.transaction(async (t) => {
    const quotation = await Quotation.findByPk(id, {
      include: [
        {
          model: QuotationDetail,
          as: "items",
          attributes: ["id", "service_id", "issue_id"],
        },
      ],
      transaction: t,
    });
    if (!quotation) {
      throw { status: 404, message: "Báo giá không tồn tại" };
    }
    if (quotation.status !== "PENDING") {
      throw {
        status: 400,
        message: "Báo giá đã được xử lý, không thể thay đổi",
      };
    }
    const inspectionTask = await Task.findByPk(quotation.task_id, {
      transaction: t,
    });
    if (!inspectionTask) {
      throw {
        status: 404,
        message: "Không tìm thấy công việc kiểm tra của báo giá",
      };
    }
    const serviceOrder = await Service_Order.findByPk(
      inspectionTask.service_order_id,
      {
        attributes: ["id"],
        include: [
          {
            model: Vehicles,
            as: "vehicle",
            attributes: ["id"],
            include: [
              { model: Customers, as: "customer", attributes: ["id", "phone"] },
            ],
          },
        ],
        transaction: t,
      },
    );
    const customerPhone = serviceOrder?.vehicle?.customer?.phone;
    if (!customerPhone) {
      throw { status: 400, message: "Không tìm thấy số điện thoại khách hàng" };
    }
    const normVerified = await normalizeVnPhone(verifiedPhone);
    const normCustomer = await normalizeVnPhone(customerPhone);
    if (normVerified !== normCustomer) {
      throw {
        status: 403,
        message: "Số điện thoại xác thực không khớp với khách hàng của báo giá",
      };
    }
    const serviceItems = quotation.items.filter((item) => item.service_id);
    if (serviceItems.length > 0) {
      await Task.bulkCreate(
        serviceItems.map((item) => ({
          service_order_id: inspectionTask.service_order_id,
          quotation_item_id: item.id,
          service_catalog_id: item.service_id,
          type: "REPAIR",
          status: "PENDING",
        })),
        { transaction: t },
      );
      await Service_Order.update(
        { status: "IN_PROGRESS" },
        {
          where: {
            id: inspectionTask.service_order_id,
            status: "PENDING_QUOTATION",
          },
          transaction: t,
        },
      );
    }
    await quotation.update(
      {
        status: "APPROVED",
        approved_at: new Date(),
        approval_method: "OTP",
        approved_phone: verifiedPhone,
      },
      { transaction: t },
    );
    return quotation;
  }).then(async (quotation) => {
    await notifyRole(
      "INVENTORY_MANAGER",
      {
        title: "Có báo giá cần xuất phụ tùng",
        content: `Báo giá #${quotation.id} đã được duyệt (OTP), cần chuẩn bị xuất phụ tùng.`,
        notificationType: "SERVICE_ORDER",
        referenceId: quotation.id,
      },
      "new_notification",
      {
        type: "QUOTATION_APPROVED",
        quotationId: quotation.id,
      },
    );
    return quotation;
  });
};


