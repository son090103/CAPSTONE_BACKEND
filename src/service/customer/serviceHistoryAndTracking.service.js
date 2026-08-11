const db = require("../../../models");

module.exports.getRepairProgress = async (userId) => {
  const customer = await db.Customers.findOne({ where: { user_id: userId } });
  if (!customer) {
    throw { status: 404, message: "Không tìm thấy thông tin khách hàng" };
  };
  const orders = await db.Service_Orders.findAll({
    attributes: [
      "id",
      "status",
      "entry_time",
      "promised_finish_time",
      "actual_finish_time",
    ],
    include: [
      {
        model: db.Vehicles,
        as: "vehicle",
        attributes: ["id", "license_plate", "color"],
        where: { customer_id: customer.id },
        required: true,
        include: [
          {
            model: db.Vehicle_Models,
            as: "model",
            attributes: ["id", "model_name"],
          },
        ],
      },
      {
        model: db.Task,
        as: "tasks",
        attributes: ["id", "status", "type"],
        required: false,
        include: [
          {
            model: db.Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name", "estimated_duration"],
          },
          {
            model: db.Task_Assignment,
            as: "assignments",
            attributes: ["id", "status"],
            required: false,
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
    ],
    order: [["entry_time", "DESC"]],
  });

  return orders;
};

// Lịch sử dịch vụ đã hoàn thành và đã thanh toán: mỗi lệnh sửa chữa COMPLETED/DELIVERED có
// payment PAID gộp toàn bộ báo giá đã duyệt (dịch vụ + phụ tùng) thành 1 "hóa đơn" để khách xem lại/tải PDF.
module.exports.getServiceHistory = async (userId) => {
  const customer = await db.Customers.findOne({ where: { user_id: userId } });
  if (!customer) {
    throw { status: 404, message: "Không tìm thấy thông tin khách hàng" };
  }

  const orders = await db.Service_Orders.findAll({
    attributes: ["id", "status", "entry_time", "actual_finish_time", "exit_time"],
    where: { status: ["COMPLETED", "DELIVERED"] },
    include: [
      {
        model: db.Vehicles,
        as: "vehicle",
        attributes: ["id", "license_plate", "color"],
        where: { customer_id: customer.id },
        required: true,
        include: [{ model: db.Vehicle_Models, as: "model", attributes: ["id", "model_name"] }],
      },
      {
        model: db.Booking_Payments,
        as: "payment",
        attributes: ["id", "payment_status", "amount", "payment_method"],
        where: { payment_status: "PAID" },
        required: true,
      },
      {
        model: db.Feedback,
        as: "feedback",
        attributes: ["id", "rating"],
      },
      {
        model: db.Task,
        as: "tasks",
        attributes: ["id", "service_catalog_id"],
        required: false,
        include: [
          {
            model: db.Service_Catalog,
            as: "catalog",
            attributes: ["id", "service_name", "labor_price"],
          },
          {
            model: db.Task_Assignment,
            as: "assignments",
            attributes: ["id"],
            required: false,
            include: [{ model: db.User, as: "technician", attributes: ["id", "fullName"] }],
          },
          {
            model: db.Quotations,
            as: "quotations",
            attributes: ["id", "total_amount", "deposit_amount", "deposit_paid_at", "approved_at"],
            where: { status: "APPROVED" },
            required: false,
            include: [
              {
                model: db.Quotation_Details,
                as: "items",
                attributes: ["id", "quantity", "unit_price", "repair_price", "amount", "custom_item_name"],
                include: [
                  { model: db.Spare_Parts, as: "sparePart", attributes: ["id", "name", "sku"] },
                  { model: db.Service_Catalog, as: "service_catalog", attributes: ["id", "service_name"] },
                  { model: db.Custom_Part_Orders, as: "customPartOrder", attributes: ["id", "item_name", "status"] },
                ],
              },
            ],
          },
        ],
      },
      {
        model: db.Appointments,
        as: "appointment",
        attributes: ["id", "booking_type"],
        required: false,
        include: [
          {
            model: db.Appointment_Details,
            as: "appointmentDetails",
            required: false,
            include: [
              { model: db.Service_Catalog, as: "catalog", attributes: ["id", "service_name", "labor_price"] },
              { model: db.Service_Combo, as: "combo", attributes: ["id", "combo_name"] },
            ],
          },
        ],
      },
    ],
    order: [["actual_finish_time", "DESC"]],
  });

  return orders;
};
