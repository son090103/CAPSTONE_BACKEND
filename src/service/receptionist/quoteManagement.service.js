const db = require("../../../models");
const Quotation = db.Quotations;
const QuotationDetail = db.Quotation_Details;
const SparePart = db.Spare_Parts;
const Issues = db.Vehicle_Issues;
const Components = db.Vehicle_Components;
const Tasks = db.Task;
const Service_Order = db.Service_Orders;
const Customers = db.Customers;
const Users = db.User;
const Vehicles = db.Vehicles;
const Vehicle_Models = db.Vehicle_Models;
const Service_Catalog = db.Service_Catalog;

// Chỉ đọc, dùng trong khung chat lễ tân trả lời khách về báo giá đã có (không sửa/duyệt —
// việc đó thuộc kỹ thuật viên trưởng, xem service/technicianLeader/quoteManagement.service.js).
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
        ],
      },
    ],
  });
  if (!quotation) {
    throw { status: 404, message: "Không tìm thấy báo giá" };
  }
  return quotation;
};

// Lễ tân xử lý các báo giá Leader không tự duyệt tại chỗ được (khách không có mặt) — gọi
// điện/gửi PDF qua Zalo xác nhận với khách rồi hỗ trợ duyệt hộ. Dùng lại đúng logic nghiệp vụ
// bên technicianLeader (tạo Task REPAIR, cập nhật Service_Order...), chỉ khác approval_method.
module.exports.getQuoteHistory = async () => {
  const leaderQuoteService = require("../technicianLeader/quoteManagement.service");
  return leaderQuoteService.getQuoteHistory();
};

module.exports.approveQuotation = async (id) => {
  const leaderQuoteService = require("../technicianLeader/quoteManagement.service");
  return leaderQuoteService.approveQuotation(id, "RECEPTIONIST");
};

// Hàm lấy tổng tiền thanh toán dịch vụ — lễ tân dùng khi thu cọc/thanh toán tại quầy.
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
      {
        model: QuotationDetail,
        as: "items",
        attributes: ["id", "amount", "status"],
      },
    ],
    order: [["createdAt", "ASC"]],
  });

  // grandTotal tính động từ các dòng chưa bị hủy (đóng sớm đơn) — KHÔNG đọc total_amount,
  // vì trường đó giữ nguyên giá trị gốc lúc khách duyệt, không bị ghi đè khi đóng sớm.
  const grandTotal = quotations.reduce(
    (sum, q) => sum + q.items.filter((i) => i.status !== "CANCELLED").reduce((s, i) => s + Number(i.amount), 0),
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
