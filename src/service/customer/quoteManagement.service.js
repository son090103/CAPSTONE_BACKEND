const db = require("../../../models");
const Quotation = db.Quotations;
const QuotationDetail = db.Quotation_Details;
const Task = db.Task;
const { notifyRole } = require("../../util/notification.util");

const getQuotationInclude = (customerId) => [
  {
    model: db.Task,
    as: "task",
    attributes: ["id", "type", "service_order_id"],
    required: true,
    include: [
      {
        model: db.Service_Orders,
        as: "serviceOrder",
        attributes: ["id", "status"],
        required: true,
        include: [
          {
            model: db.Vehicles,
            as: "vehicle",
            attributes: ["id", "license_plate", "color"],
            where: { customer_id: customerId },
            required: true,
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
      },
    ],
  },
  {
    model: db.Quotation_Details,
    as: "items",
    attributes: [
      "id",
      "quantity",
      "unit_price",
      "repair_price",
      "amount",
      "custom_item_name",
      "status",
    ],
    include: [
      {
        model: db.Vehicle_Issues,
        as: "issue",
        attributes: ["id", "error_description", "note"],
      },
      {
        model: db.Spare_Parts,
        as: "sparePart",
        attributes: ["id", "name", "sku"],
      },
      {
        model: db.Service_Catalog,
        as: "service_catalog",
        attributes: ["id", "service_name"],
      },
    ],
  },
];

const getCustomerOrThrow = async (userId) => {
  const customer = await db.Customers.findOne({ where: { user_id: userId } });
  if (!customer) {
    throw { status: 404, message: "Không tìm thấy thông tin khách hàng" };
  }
  return customer;
};

module.exports.getPendingQuotations = async (userId) => {
  const customer = await getCustomerOrThrow(userId);

  const quotations = await Quotation.findAll({
    attributes: [
      "id",
      "total_amount",
      "deposit_amount",
      "note",
      "status",
      "createdAt",
    ],
    where: { status: "PENDING" },
    include: getQuotationInclude(customer.id),
    order: [["createdAt", "DESC"]],
  });

  return quotations;
};

module.exports.approveQuotation = async (userId, quotationId) => {
  const customer = await getCustomerOrThrow(userId);

  return await db.sequelize.transaction(async (t) => {
    const quotation = await Quotation.findByPk(quotationId, {
      include: [
        {
          model: QuotationDetail,
          as: "items",
          attributes: ["id", "service_id", "issue_id"],
        },
        {
          model: Task,
          as: "task",
          attributes: ["id", "service_order_id"],
          include: [
            {
              model: db.Service_Orders,
              as: "serviceOrder",
              attributes: ["id"],
              include: [
                {
                  model: db.Vehicles,
                  as: "vehicle",
                  attributes: ["id", "customer_id"],
                },
              ],
            },
          ],
        },
      ],
      transaction: t,
    });
    if (!quotation) {
      throw { status: 404, message: "Báo giá không tồn tại" };
    }
    const ownerId = quotation.task?.serviceOrder?.vehicle?.customer_id;
    if (ownerId !== customer.id) {
      throw { status: 403, message: "Bạn không có quyền duyệt báo giá này" };
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
      await db.Service_Orders.update(
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
      { status: "APPROVED", approved_at: new Date() },
      { transaction: t },
    );
    return quotation;
  });
};

module.exports.rejectQuotation = async (userId, quotationId, reason) => {
  const customer = await getCustomerOrThrow(userId);
  if (!reason || !reason.trim()) {
    throw { status: 400, message: "Vui lòng nhập lý do từ chối báo giá" };
  }
  const quotation = await Quotation.findByPk(quotationId, {
    include: [
      {
        model: Task,
        as: "task",
        attributes: ["id", "service_order_id"],
        include: [
          {
            model: db.Service_Orders,
            as: "serviceOrder",
            attributes: ["id"],
            include: [
              {
                model: db.Vehicles,
                as: "vehicle",
                attributes: ["id", "customer_id"],
              },
            ],
          },
        ],
      },
    ],
  });
  if (!quotation) {
    throw { status: 404, message: "Báo giá không tồn tại" };
  }
  const ownerId = quotation.task?.serviceOrder?.vehicle?.customer_id;
  if (ownerId !== customer.id) {
    throw { status: 403, message: "Bạn không có quyền từ chối báo giá này" };
  }
  if (quotation.status !== "PENDING") {
    throw {
      status: 400,
      message: "Báo giá đã được xử lý, không thể thay đổi",
    };
  }
  await quotation.update({ status: "REJECTED", note: reason.trim() });

  const serviceOrderId = quotation.task.service_order_id;
  await notifyRole(
    "RECEPTIONIST",
    {
      title: "Khách hàng từ chối báo giá",
      content: `Khách hàng đã từ chối báo giá #${quotation.id}. Lý do: ${reason.trim()}`,
      notificationType: "QUOTATION_REJECTED",
      referenceId: serviceOrderId,
    },
    "new_notification",
    {
      type: "QUOTATION_REJECTED",
      serviceOrderId,
      quotationId: quotation.id,
    },
  );

  return quotation;
};

module.exports.getQuotationHistory = async (userId) => {
  const customer = await getCustomerOrThrow(userId);
  const quotations = await Quotation.findAll({
    attributes: [
      "id",
      "total_amount",
      "deposit_amount",
      "deposit_paid_at",
      "status",
      "approval_method",
      "note",
      "approved_at",
      "createdAt",
    ],
    where: { status: ["APPROVED", "REJECTED"] },
    include: getQuotationInclude(customer.id),
    order: [["createdAt", "DESC"]],
  });

  return quotations;
};
