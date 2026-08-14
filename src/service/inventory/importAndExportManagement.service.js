const db = require("../../../models");
const { Op } = require("sequelize");
const InventoryLog = db.Inventory_Logs;
const InventoryBatch = db.Inventory_Batches;
const SparePart = db.Spare_Parts;
const PartCategory = db.Part_Categories;
const Supplier = db.Suppliers;
const User = db.User;
const Quotation = db.Quotations;
const QuotationDetail = db.Quotation_Details;
const CustomPartOrder = db.Custom_Part_Orders;
const RestockRequest = db.Restock_Requests;
const sparePartService = require("../../service/inventory/sparePartManagement.service");
const geminiClient = require("../../config/gemini.config");
const Task = db.Task;
const xlsx = require("xlsx");
const ExcelJS = require("exceljs");
const { normalizeRow, parseNumber } = require("../admin/serviceCatalog.service");
const Service_Orders = db.Service_Orders;
const Vehicles = db.Vehicles;
const Vehicle_Models = db.Vehicle_Models;
const Customers = db.Customers;
const { notifyUser, notifyRole } = require("../../util/notification.util");
const { uploadToCloudinary } = require("../../helper/uploadToCloudinary.helper");

const normalizeName = (str) =>
  (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Thuật toán Levenshtein Distance
function similarity(a, b) {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++)
    for (let j = 1; j <= a.length; j++)
      m[i][j] =
        b[i - 1] === a[j - 1]
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j - 1], m[i][j - 1], m[i - 1][j]) + 1;
  return 1 - m[b.length][a.length] / Math.max(a.length, b.length);
}

const buildPrompt = (categoryList, supplierList) => `Đây là hóa đơn nhập kho phụ tùng ô tô.
    Danh sách category hiện có:
    ${categoryList}
    Danh sách nhà cung cấp hiện có:
    ${supplierList}
    So sánh tên nhà cung cấp trên hóa đơn với danh sách trên:
    - Khớp chính xác (chỉ khác hoa thường): supplier_match = "exact", supplier_id = id tương ứng, supplier_suggestion = null
    - Tên gần giống nhưng không chắc: supplier_match = "similar", supplier_id = null, supplier_suggestion = { "id": id, "name": tên }
    - Không tìm thấy: supplier_match = "none", supplier_id = null, supplier_suggestion = null
    Lưu ý: category_id chỉ chọn khi chắc chắn phù hợp, không chắc thì để null.
    Trả về JSON theo đúng format sau, không giải thích gì thêm:
    {
      "supplier_name": "tên trên hóa đơn",
      "supplier_id": null,
      "supplier_match": "exact | similar | none",
      "supplier_suggestion": { "id": 1, "name": "tên gần giống" } hoặc null,
      "items": [
        {
          "name": "tên phụ tùng",
          "brand": "thương hiệu nếu có, hoặc null",
          "quantity": số_lượng,
          "unit_price": đơn_giá_số,
          "category_id": null
        }
      ]
    }`;
const enrichItems = async (items) => {
  const allParts = await SparePart.findAll({
    attributes: ["id", "sku", "name", "brand", "retail_price", "warranty_period_months", "warranty_km_limit"],
  });
  return Promise.all(
    items.map(async (item) => {
      let part = null;
      const normItem = normalizeName(item.name);
      console.log("AI name:", item.name, "| normalized:", normItem);
      console.log("DB parts:", allParts.map(p => normalizeName(p.name)));
      const sameBrand = (b1, b2) =>
        (b1 || "").trim().toLowerCase() === (b2 || "").trim().toLowerCase();
      const exactPart = allParts.find(
        (p) => normalizeName(p.name) === normItem && sameBrand(p.brand, item.brand)
      );
      if (exactPart) {
        part = exactPart;
      } else {
        const matched = allParts
          .map((p) => ({ p, score: similarity(normItem, normalizeName(p.name)) }))
          .filter((x) => x.score >= 0.9 && sameBrand(x.p.brand, item.brand))
          .sort((a, b) => b.score - a.score)[0];
        if (matched) part = matched.p;
      }
      if (part) {
        const lastLog = await InventoryLog.findOne({
          where: { part_id: part.id, type: "IN" },
          order: [["createdAt", "DESC"]],
          attributes: ["unit_price"],
        });
        return {
          ...item,
          part_id: part.id,
          sku: part.sku,
          retail_price: part.retail_price,
          warranty_period_months: part.warranty_period_months,
          warranty_km_limit: part.warranty_km_limit,
          last_unit_price: lastLog ? lastLog.unit_price : null,
          is_existing: true,
        };
      }
      return { ...item, part_id: null, is_existing: false };
    })
  );
};

module.exports.scanInvoice = async (files) => {
  const [categories, suppliers] = await Promise.all([
    PartCategory.findAll({ attributes: ["id", "category_name"] }),
    Supplier.findAll({ attributes: ["id", "name"] }),
  ]);
  const categoryList = categories.map((c) => `- ${c.category_name} (id: ${c.id})`).join("\n");
  const supplierList = suppliers.map((s) => `- ${s.name} (id: ${s.id})`).join("\n");
  const model = geminiClient.getGenerativeModel({ model: "gemini-2.5-flash" });
  const prompt = buildPrompt(categoryList, supplierList);
  const scanResults = await Promise.all(
    files.map(async (file) => {
      const result = await model.generateContent([
        { inlineData: { mimeType: file.mimeType, data: file.imageBase64 } },
        prompt,
      ]);
      const text = result.response.text().trim();
      return JSON.parse(text.replace(/```json|```/g, "").trim());
    })
  );
  // Merge items từ tất cả ảnh, gộp số lượng nếu trùng tên + brand
  const mergedItems = [];
  for (const invoice of scanResults) {
    for (const item of invoice.items) {
      const existing = mergedItems.find(
        (i) => i.name === item.name && i.brand === item.brand
      );
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        mergedItems.push({ ...item });
      }
    }
  }

  const enrichedItems = await enrichItems(mergedItems);
  return { invoices: scanResults, merged: { items: enrichedItems } };
};

module.exports.importSparePart = async (manager_id, supplier_id, items) => {
  return await db.sequelize.transaction(async (t) => {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, "0");
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const year = now.getFullYear();
    const prefix = `PN-${year}${month}${day}-`;
    const last = await InventoryLog.findOne({
      where: {
        receipt_code: {
          [Op.like]: `${prefix}%`,
        },
      },
      order: [["receipt_code", "DESC"]],
      transaction: t,
    });
    let next = 1;
    if (last?.receipt_code) {
      next = parseInt(last.receipt_code.slice(prefix.length), 10) + 1;
    }
    const receipt_code = `${prefix}${String(next).padStart(4, "0")}`;
    const parts = [];
    const logsData = [];
    for (const item of items) {
      const {
        quantity,
        unit_price,
        retail_price,
        part_id,
        name,
        brand,
        category_id,
        warranty_period_months,
        warranty_km_limit,
        force,
      } = item;
      let part;
      if (part_id) {
        part = await SparePart.findByPk(part_id, {
          transaction: t,
        });
        if (!part) {
          throw {
            status: 404,
            message: `Sản phẩm #${part_id} không tồn tại`,
          };
        }
        await part.increment("stock_quantity", {
          by: quantity,
          transaction: t,
        });
        if (retail_price != null) {
          await part.update(
            {
              retail_price,
            },
            {
              transaction: t,
            },
          );
        }
      } else {
        const normName = normalizeName(name);
        const samePart = await SparePart.findAll({
          where: {
            category_id,
          },
          attributes: ["id", "sku", "name", "brand"],
          transaction: t,
        });
        const sameBrand = (b1, b2) =>
          (b1 || "").trim().toLowerCase() === (b2 || "").trim().toLowerCase();
        const exactPart = samePart.find(
          (p) =>
            normalizeName(p.name) === normName && sameBrand(p.brand, brand),
        );
        if (exactPart) {
          throw {
            status: 409,
            message: `Sản phẩm "${name}" đã tồn tại, vui lòng chọn từ danh sách`,
            part: {
              id: exactPart.id,
              sku: exactPart.sku,
              name: exactPart.name,
              brand: exactPart.brand,
            },
          };
        }
        const candidateParts = samePart
          .map((p) => ({
            p,
            score: similarity(normName, normalizeName(p.name)),
          }))
          .filter((x) => x.score >= 0.8)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5)
          .map((x) => ({
            id: x.p.id,
            sku: x.p.sku,
            name: x.p.name,
            brand: x.p.brand,
          }));
        if (!force && candidateParts.length) {
          throw {
            status: 409,
            message: `Có sản phẩm gần giống "${name}". Kiểm tra lại trước khi tạo mới`,
            part: candidateParts,
          };
        }
        part = await sparePartService.createSparePart(
          name,
          brand,
          category_id,
          warranty_period_months,
          warranty_km_limit,
          t,
        );
        await part.update(
          {
            stock_quantity: quantity,
            retail_price: retail_price,
          },
          {
            transaction: t,
          },
        );
      }
      logsData.push({
        receipt_code,
        part_id: part.id,
        supplier_id,
        type: "IN",
        quantity,
        unit_price,
        manager_id,
      });
      await part.reload({
        transaction: t,
      });
      parts.push(part);
    }
    const logs = await InventoryLog.bulkCreate(logsData, {
      transaction: t,
      returning: true,
    });
    const batchData = logs.map((log, index) => ({
      inventory_log_id: log.id,
      unit_cost: items[index].unit_price,
      remaining_quantity: items[index].quantity,
    }));
    await InventoryBatch.bulkCreate(batchData, {
      transaction: t,
    });
    const results = parts.map((part, index) => ({
      part,
      importLog: logs[index],
    }));
    return {
      receipt_code,
      items: results,
    };
  });
};

const generateReceiptCode = async (t) => {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const prefix = `PX-${year}${month}${day}-`;
  const last = await InventoryLog.findOne({
    where: { receipt_code: { [Op.like]: `${prefix}%` } },
    order: [["receipt_code", "DESC"]],
    transaction: t,
  });
  const next = last?.receipt_code
    ? parseInt(last.receipt_code.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(next).padStart(4, "0")}`;
};


module.exports.getExportRequests = async () => {
  return await QuotationDetail.findAll({
    where: { status: "REQUESTED", spare_part_id: { [Op.ne]: null } },
    attributes: ["id", "quantity", "unit_price", "amount", "requested_by", "createdAt"],
    include: [
      { model: SparePart, as: "sparePart", attributes: ["id", "sku", "name", "brand", "stock_quantity"] },
      { model: User, as: "requestedByUser", attributes: ["id", "fullName"] },
      {
        model: Quotation,
        as: "quotation",
        attributes: ["id"],
        required: true,
        include: [
          {
            model: Task,
            as: "task",
            attributes: ["id", "service_order_id"],
            required: true,
            include: [
              {
                model: Service_Orders,
                as: "serviceOrder",
                attributes: ["id"],
                required: true,
                include: [
                  {
                    model: Vehicles,
                    as: "vehicle",
                    attributes: ["id", "license_plate", "color"],
                    include: [{ model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] }],
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
};


module.exports.approveExportRequest = async (detailIds, managerId) => {
  return await db.sequelize.transaction(async (t) => {
    const items = await QuotationDetail.findAll({
      where: { id: detailIds, spare_part_id: { [Op.ne]: null }, status: "REQUESTED" },
      include: [
        { model: SparePart, as: "sparePart" },
        {
          model: Quotation,
          as: "quotation",
          attributes: ["id"],
          required: true,

          include: [{ model: Task, as: "task", attributes: ["id", "service_order_id"], required: true }],
        },
      ],
      transaction: t,
    });
    if (items.length !== detailIds.length) {
      throw {
        status: 400,
        message: "Có dòng không hợp lệ hoặc không còn ở trạng thái chờ duyệt",
      };
    }
    const technicianIds = [...new Set(items.map((item) => item.requested_by))];
    if (technicianIds.length > 1) {
      throw {
        status: 400,
        message: "Các dòng đã chọn thuộc nhiều kỹ thuật viên khác nhau. Vui lòng duyệt riêng theo từng yêu cầu.",
      };
    }
    const technicianId = technicianIds[0];
    if (!technicianId) {
      throw { status: 400, message: "Không xác định được kỹ thuật viên đã yêu cầu" };
    }
    const serviceOrderId = items[0].quotation.task.service_order_id;

    const receipt_code = await generateReceiptCode(t);

    const logsData = [];
    for (const item of items) {
      const part = item.sparePart;
      if (part.stock_quantity < item.quantity) {
        throw {
          status: 400,
          message: `Phụ tùng "${part.name}" không đủ tồn kho (còn ${part.stock_quantity}, cần ${item.quantity})`,
        };
      }
      await part.decrement("stock_quantity", { by: item.quantity, transaction: t });
      await item.update({ status: "EXPORTED" }, { transaction: t });
      logsData.push({
        receipt_code,
        part_id: part.id,
        service_order_id: serviceOrderId,
        type: "OUT",
        quantity: item.quantity,
        unit_price: item.unit_price,
        manager_id: managerId,
        requested_technician_id: technicianId,
        received_by: technicianId,
        received_at: new Date(),
      });
    }
    await InventoryLog.bulkCreate(logsData, { transaction: t });
    const affectedIssueIds = [...new Set(items.map((item) => item.issue_id).filter(Boolean))];
    const affectedTasks = affectedIssueIds.length
      ? await Task.findAll({
        attributes: ["id"],
        where: { service_order_id: serviceOrderId },
        include: [
          {
            model: QuotationDetail,
            as: "quotationItem",
            attributes: [],
            required: true,
            where: { issue_id: affectedIssueIds },
          },
        ],
        transaction: t,
      })
      : [];
    const affectedTaskIds = affectedTasks.map((task) => task.id);
    const stockReadyAssignments = await db.Task_Assignment.findAll({
      where: { technician_id: technicianId, status: "WAITING_STOCK" },
      include: [
        {
          model: Task,
          as: "task",
          attributes: ["id", "quotation_item_id"],
          where: { service_order_id: serviceOrderId, id: affectedTaskIds },
          required: true,
        },
      ],
      transaction: t,
    });
    for (const assignment of stockReadyAssignments) {
      const ownQuotationItem = assignment.task.quotation_item_id
        ? await QuotationDetail.findByPk(assignment.task.quotation_item_id, {
          attributes: ["issue_id"],
          transaction: t,
        })
        : null;
      if (!ownQuotationItem?.issue_id) {
        await assignment.update({ status: "IN_PROGRESS" }, { transaction: t });
        await Task.update({ status: "IN_PROGRESS" }, { where: { id: assignment.task.id }, transaction: t });
        continue;
      }
      const readyCount = await QuotationDetail.count({
        where: {
          issue_id: ownQuotationItem.issue_id,
          status: { [Op.in]: ["EXPORTED", "RECEIVED"] },
          service_id: null,
        },
        transaction: t,
      });
      if (readyCount === 0) continue;
      await assignment.update({ status: "IN_PROGRESS" }, { transaction: t });
      await Task.update({ status: "IN_PROGRESS" }, { where: { id: assignment.task.id }, transaction: t });
    }

    return { receipt_code, exported_count: logsData.length, technicianId, serviceOrderId };
  }).then(async (result) => {
    await notifyUser(
      result.technicianId,
      {
        title: "Phụ tùng đã xuất kho",
        content: `Kho đã xuất ${result.exported_count} phụ tùng (phiếu ${result.receipt_code}) cho công việc của bạn.`,
        notificationType: "SERVICE_ORDER",
        referenceId: result.serviceOrderId,
      },
      "new_notification",
      { type: "PARTS_EXPORTED", serviceOrderId: result.serviceOrderId, receiptCode: result.receipt_code },
    );
    return {
      receipt_code: result.receipt_code,
      exported_count: result.exported_count,
      technicianId: result.technicianId,
    };
  });
};

// Thủ kho từ chối yêu cầu xuất kho (vd hết hàng) - trả về PENDING để KTV biết và gửi lại sau
module.exports.rejectExportRequest = async (detailIds, reason) => {
  const items = await QuotationDetail.findAll({
    where: { id: detailIds, status: "REQUESTED" },
  });
  if (items.length === 0) {
    throw { status: 404, message: "Không tìm thấy yêu cầu xuất kho này" };
  }
  const technicianId = items[0].requested_by;
  await QuotationDetail.update(
    { status: "PENDING", requested_by: null },
    { where: { id: detailIds, status: "REQUESTED" } },
  );
  if (technicianId) {
    await notifyUser(
      technicianId,
      {
        title: "Yêu cầu xuất kho bị từ chối",
        content: reason
          ? `Kho từ chối yêu cầu xuất phụ tùng. Lý do: ${reason}`
          : "Kho từ chối yêu cầu xuất phụ tùng, vui lòng liên hệ thủ kho để biết thêm chi tiết.",
        notificationType: "SERVICE_ORDER",
      },
      "new_notification",
      { type: "PARTS_EXPORT_REJECTED" },
    );
  }
  return { rejected_count: items.length };
};

module.exports.getExportReceiptDetail = async (receiptCode) => {
  const logs = await InventoryLog.findAll({
    where: { receipt_code: receiptCode, type: "OUT" },
    attributes: ["id", "quantity", "unit_price", "createdAt", "requested_technician_id"],
    include: [
      { model: SparePart, as: "part", attributes: ["id", "sku", "name", "brand"] },
      { model: User, as: "manager", attributes: ["id", "fullName"] },
      {
        model: Service_Orders,
        as: "serviceOrder",
        attributes: ["id"],
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
                include: [{ model: User, as: "user", attributes: ["id", "fullName", "phoneNumber"] }],
              },
            ],
          },
        ],
      },
    ],
    order: [["id", "ASC"]],
  });
  if (logs.length === 0) {
    throw { status: 404, message: "Không tìm thấy phiếu xuất kho này" };
  }
  const technicianId = logs[0].requested_technician_id;
  const technician = technicianId ? await User.findByPk(technicianId, { attributes: ["id", "fullName"] }) : null;
  return { receipt_code: receiptCode, logs, technician };
};

module.exports.viewImportHistory = async () => {
  const result = await InventoryLog.findAll({
    where: { type: "IN" },
    attributes: [
      "receipt_code",
      [db.sequelize.fn("MAX", db.sequelize.col("Inventory_Logs.createdAt")), "imported_at"],
      [db.sequelize.fn("COUNT", db.sequelize.col("Inventory_Logs.id")), "item_count"],
      [db.sequelize.fn("SUM", db.sequelize.literal("quantity * unit_price")), "total_amount"],
      [db.sequelize.fn("MAX", db.sequelize.col("manager.fullName")), "manager_name"],
    ],
    include: [{ model: User, as: "manager", attributes: [] }],
    group: ["Inventory_Logs.receipt_code"],
    order: [[db.sequelize.fn("MAX", db.sequelize.col("Inventory_Logs.createdAt")), "DESC"]],
    raw: true,
  });
  return result;
};

module.exports.viewImportDetail = async (receiptCode) => {
  const result = await InventoryLog.findAll({
    where: { type: "IN", receipt_code: receiptCode },
    attributes: ["id", "receipt_code", "createdAt", "quantity", "unit_price"],
    include: [
      { model: SparePart, as: "part", attributes: ["sku", "name", "brand"] },
      { model: Supplier, as: "supplier", attributes: ["name"] },
    ],
    order: [["id", "ASC"]],
  });
  return result;
};

module.exports.viewExportHistory = async () => {
  const result = await InventoryLog.findAll({
    where: { type: "OUT" },
    attributes: [
      "receipt_code",
      [db.sequelize.fn("MAX", db.sequelize.col("Inventory_Logs.createdAt")), "exported_at"],
      [db.sequelize.fn("COUNT", db.sequelize.col("Inventory_Logs.id")), "item_count"],
      [db.sequelize.fn("SUM", db.sequelize.literal("quantity * unit_price")), "total_amount"],
      [db.sequelize.fn("MAX", db.sequelize.col("manager.fullName")), "manager_name"],
      [db.sequelize.fn("MAX", db.sequelize.col("receiver.fullName")), "technician_name"],
      [db.sequelize.fn("MAX", db.sequelize.col("Inventory_Logs.signature_method")), "signature_method"],
      [db.sequelize.fn("MAX", db.sequelize.col("Inventory_Logs.received_at")), "signed_at"],
    ],
    include: [
      { model: User, as: "manager", attributes: [] },
      { model: User, as: "receiver", attributes: [] },
    ],
    group: ["Inventory_Logs.receipt_code"],
    order: [[db.sequelize.fn("MAX", db.sequelize.col("Inventory_Logs.createdAt")), "DESC"]],
    raw: true,
  });
  return result;
};


module.exports.viewExportDetail = async (receiptCode) => {
  const result = await InventoryLog.findAll({
    where: { type: "OUT", receipt_code: receiptCode },
    attributes: [
      "id",
      "receipt_code",
      "createdAt",
      "quantity",
      "unit_price",
      "signature_method",
      "proof_image_url",
      "received_at",
    ],
    include: [
      { model: SparePart, as: "part", attributes: ["sku", "name"] },
      { model: User, as: "receiver", attributes: ["id", "fullName"] },
      { model: User, as: "manager", attributes: ["id", "fullName"] },
    ],
    order: [["id", "ASC"]],
  });
  return result;
};

// Đề xuất nhập hàng thông minh: không chỉ dựa vào ngưỡng min_threshold cố định, mà tính nhu
// cầu thực tế dựa trên xu hướng tiêu thụ gần đây so với giai đoạn trước đó.
//
// Chia lịch sử xuất kho 30 ngày gần nhất thành 2 nửa (mỗi nửa 15 ngày):
//   - "recent"   = 15 ngày gần nhất  -> phản ánh nhu cầu HIỆN TẠI
//   - "previous" = 15 ngày trước đó  -> làm mốc so sánh xu hướng
// Nếu recentRate cao hơn previousRate (nhu cầu đang tăng), tốc độ dự đoán sẽ nghiêng về
// recentRate để không đề xuất thiếu. Nếu phụ tùng chỉ có dữ liệu ở 1 nửa (mới bắt đầu bán
// chạy hoặc đã ngừng dùng gần đây), dùng thẳng tốc độ của nửa có dữ liệu, không suy diễn.
// Trọng số 70/30 (nghiêng về gần đây) là cách làm mượt phổ biến (giống EWMA đơn giản) để
// một ngày xuất đột biến không làm lệch hẳn dự đoán, nhưng vẫn ưu tiên xu hướng mới nhất.
//
// Nhu cầu dự kiến = tốc độ dự đoán/ngày x RESTOCK_DAYS (cấu hình trong Garage_Configurations,
// mặc định 14 ngày) - trừ đi tồn kho khả dụng thực tế (đã trừ phần đang bị giữ chỗ cho các
// yêu cầu xuất kho REQUESTED/WAITING_STOCK chưa xuất xong).
const CONSUMPTION_WINDOW_DAYS = 90;
const DEFAULT_RESTOCK_DAYS = 14;


const computeRestockAnalysis = async () => {
  const restockDaysConfig = await db.Garage_Configurations.findOne({
    where: { config_key: "RESTOCK_DAYS" },
    attributes: ["config_value"],
  });
  const restockDays = Number(restockDaysConfig?.config_value) > 0
    ? Number(restockDaysConfig.config_value)
    : DEFAULT_RESTOCK_DAYS;

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - CONSUMPTION_WINDOW_DAYS);
  
  const month1Start = new Date();
  month1Start.setDate(month1Start.getDate() - 30);
  
  const month2Start = new Date();
  month2Start.setDate(month2Start.getDate() - 60);

  const [parts, consumptionLogs, heldRows] = await Promise.all([
    SparePart.findAll({
      attributes: ["id", "sku", "name", "brand", "stock_quantity", "min_threshold"],
    }),
    InventoryLog.findAll({
      where: { type: "OUT", createdAt: { [Op.gte]: windowStart } },
      attributes: ["part_id", "quantity", "createdAt"],
      raw: true,
    }),
    QuotationDetail.findAll({
      where: {
        status: { [Op.in]: ["REQUESTED"] },
        spare_part_id: { [Op.ne]: null },
      },
      attributes: [
        "spare_part_id",
        [db.sequelize.fn("SUM", db.sequelize.col("quantity")), "total_held"],
      ],
      group: ["spare_part_id"],
      raw: true,
    }),
  ]);

  // Gộp tổng xuất kho theo từng phụ tùng chia làm 3 tháng gần nhất để so sánh xu hướng:
  // month1 = 30 ngày gần nhất
  // month2 = từ ngày 31 đến 60
  // month3 = từ ngày 61 đến 90
  const consumptionByPart = new Map();
  for (const log of consumptionLogs) {
    const entry = consumptionByPart.get(log.part_id) ?? { month1: 0, month2: 0, month3: 0 };
    const logDate = new Date(log.createdAt);
    if (logDate >= month1Start) {
      entry.month1 += Number(log.quantity);
    } else if (logDate >= month2Start) {
      entry.month2 += Number(log.quantity);
    } else {
      entry.month3 += Number(log.quantity);
    }
    consumptionByPart.set(log.part_id, entry);
  }

  const heldByPart = new Map(
    heldRows.map((row) => [row.spare_part_id, Number(row.total_held)]),
  );

  const items = parts
    .map((part) => {
      const consumption = consumptionByPart.get(part.id) ?? { month1: 0, month2: 0, month3: 0 };
      
      // Tính tốc độ tiêu thụ hàng ngày dự đoán bằng WMA 3 tháng (Trọng số 60% tháng gần nhất, 30% tháng thứ 2, 10% tháng thứ 3)
      const predictedRate = (consumption.month1 / 30) * 0.6 + (consumption.month2 / 30) * 0.3 + (consumption.month3 / 30) * 0.1;

      // Tính xu hướng tiêu thụ của tháng gần nhất so với trung bình 2 tháng trước đó
      const avgPrev = (consumption.month2 + consumption.month3) / 2;
      const trend = avgPrev > 0
        ? Number((((consumption.month1 - avgPrev) / avgPrev) * 100).toFixed(0))
        : (consumption.month1 > 0 ? 100 : null);

      const held = heldByPart.get(part.id) ?? 0;
      const availableStock = part.stock_quantity - held;
      const projectedDemand = predictedRate * restockDays;
      const targetDemand = Math.max(projectedDemand, part.min_threshold || 0);
      let suggestedQuantity = 0;
      if (availableStock < targetDemand) {
        const targetStockLevel = Math.max((part.min_threshold || 0) * 2, projectedDemand * 1.5);
        suggestedQuantity = Math.max(0, Math.ceil(targetStockLevel - availableStock));
      }

      return {
        part_id: part.id,
        sku: part.sku,
        name: part.name,
        brand: part.brand,
        stock_quantity: part.stock_quantity,
        held_quantity: held,
        available_stock: availableStock,
        daily_consumption: Number(predictedRate.toFixed(2)),
        trend_percent: trend,
        restock_days: restockDays,
        projected_demand: Math.ceil(projectedDemand),
        suggested_quantity: suggestedQuantity,
        month1_consumption: consumption.month1,
        month2_consumption: consumption.month2,
        month3_consumption: consumption.month3,
      };
    });

  return { restock_days: restockDays, consumption_window_days: CONSUMPTION_WINDOW_DAYS, items };
};

module.exports.getRestockSuggestions = async () => {
  const { restock_days, consumption_window_days, items } = await computeRestockAnalysis();
  const suggestions = items
    .filter((item) => item.suggested_quantity > 0)
    .sort((a, b) => b.suggested_quantity - a.suggested_quantity);

  return { restock_days, consumption_window_days, suggestions };
};

module.exports.getWaitingStockItems = async () => {
  const orders = await CustomPartOrder.findAll({
    where: { status: { [Op.in]: ["WAITING_ARRIVAL", "READY_FOR_USE"] } },
    attributes: ["id", "item_name", "quantity", "unit_price", "actual_unit_price", "arrived_at", "status", "createdAt"],
    include: [
      {
        model: QuotationDetail,
        as: "quotationDetail",
        attributes: ["id"],
        required: true,
        include: [
          {
            model: Quotation,
            as: "quotation",
            attributes: ["id", "deposit_amount", "deposit_paid_at"],
            required: true,
            include: [
              {
                model: Task,
                as: "task",
                attributes: ["id", "service_order_id"],
                required: true,
              },
            ],
          },
        ],
      },
    ],
    order: [["createdAt", "ASC"]],
  });

  const taskIds = [...new Set(orders.map((o) => o.quotationDetail?.quotation?.task?.service_order_id).filter(Boolean))];
  const serviceOrders = taskIds.length
    ? await Service_Orders.findAll({
      where: { id: taskIds },
      attributes: ["id"],
      include: [
        {
          model: Vehicles,
          as: "vehicle",
          attributes: ["id", "license_plate", "color"],
          required: true,
          include: [
            { model: Vehicle_Models, as: "model", attributes: ["id", "model_name"] },
            {
              model: Customers,
              as: "customer",
              attributes: ["id", "name", "phone"],
              include: [{ model: User, as: "user", attributes: ["id", "fullName", "phoneNumber"] }],
            },
          ],
        },
      ],
    })
    : [];
  const serviceOrderById = new Map(serviceOrders.map((so) => [so.id, so]));

  return orders.map((order) => {
    const data = order.toJSON();
    const serviceOrderId = order.quotationDetail?.quotation?.task?.service_order_id;
    if (data.quotationDetail?.quotation?.task) {
      data.quotationDetail.quotation.task.serviceOrder = serviceOrderById.get(serviceOrderId)?.toJSON() ?? null;
    }
    return data;
  });
};


module.exports.confirmCustomPartArrival = async (manager_id, customPartOrderId, actualUnitPrice) => {
  const order = await CustomPartOrder.findByPk(customPartOrderId, {
    include: [
      {
        model: QuotationDetail,
        as: "quotationDetail",
        attributes: ["id", "unit_price", "issue_id"],
        include: [{ model: db.Quotations, as: "quotation", attributes: ["id", "task_id"] }],
      },
    ],
  });
  if (!order) {
    throw { status: 404, message: "Không tìm thấy đơn phụ tùng đặt riêng" };
  }
  if (order.status !== "WAITING_ARRIVAL") {
    throw { status: 400, message: `Đơn "${order.item_name}" không ở trạng thái chờ về hàng` };
  }
  if (actualUnitPrice != null && Number(actualUnitPrice) > Number(order.quotationDetail.unit_price)) {
    throw {
      status: 400,
      message: `Giá nhập (${actualUnitPrice}) cao hơn giá đã báo khách (${order.quotationDetail.unit_price}) cho "${order.item_name}". Không thể xác nhận.`,
    };
  }
  await order.update({
    status: "READY_FOR_USE",
    actual_unit_price: actualUnitPrice ?? order.unit_price,
    arrived_at: new Date(),
  });

  {
    // Đi qua Quotation.task_id (luôn tồn tại, không phụ thuộc issue có gắn Task hay không)
    // thay vì issue.task_id — báo giá phụ tùng đặt riêng luôn thuộc 1 Quotation/Task cụ thể.
    const quotationTaskId = order.quotationDetail?.quotation?.task_id;
    const task = quotationTaskId
      ? await Task.findByPk(quotationTaskId, { attributes: ["id", "service_order_id"] })
      : null;
    if (task?.service_order_id) {
      const assignments = await db.Task_Assignment.findAll({
        attributes: ["technician_id"],
        include: [{ model: Task, as: "task", attributes: [], where: { service_order_id: task.service_order_id }, required: true }],
      });
      const technicianIds = [...new Set(assignments.map((a) => a.technician_id))];
      for (const technicianId of technicianIds) {
        await notifyUser(
          technicianId,
          {
            title: "Phụ tùng đặt riêng đã về kho",
            content: `Phụ tùng "${order.item_name}" bạn đang chờ đã về, kho sẽ sớm xuất cho bạn.`,
            notificationType: "SERVICE_ORDER",
          },
          "new_notification",
          { type: "CUSTOM_PART_ARRIVED", customPartOrderId: order.id },
        );
      }
    }
  }

  return order;
};


module.exports.exportCustomPartOrder = async (manager_id, customPartOrderId) => {
  return await db.sequelize.transaction(async (t) => {
    const order = await CustomPartOrder.findByPk(customPartOrderId, {
      include: [
        {
          model: QuotationDetail,
          as: "quotationDetail",
          attributes: ["id", "issue_id", "task_id"],
          include: [{ model: db.Quotations, as: "quotation", attributes: ["id", "task_id"] }],
        },
      ],
      transaction: t,
    });
    if (!order) {
      throw { status: 404, message: "Không tìm thấy đơn phụ tùng đặt riêng" };
    }
    if (order.status !== "READY_FOR_USE") {
      throw { status: 400, message: `Đơn "${order.item_name}" chưa sẵn sàng để xuất` };
    }
    await order.update({ status: "EXPORTED" }, { transaction: t });
    await QuotationDetail.update(
      { status: "EXPORTED" },
      { where: { id: order.quotation_detail_id }, transaction: t },
    );

    let technicianIds = [];
    let serviceOrderId = null;
    const issueId = order.quotationDetail?.issue_id;
    // Task thật sự đang chờ phụ tùng này: ưu tiên quotationDetail.task_id (gán chính xác lúc
    // approveQuotation) — không dùng quotation.task_id vì đó chỉ là điểm neo kỹ thuật, có thể
    // không phải Task thật khi báo giá được tạo từ lỗi phát sinh không gắn Task cụ thể.
    const targetTaskId = order.quotationDetail?.task_id ?? order.quotationDetail?.quotation?.task_id;
    if (targetTaskId) {
      const task = await Task.findByPk(targetTaskId, {
        attributes: ["id", "service_order_id"],
        transaction: t,
      });
      serviceOrderId = task?.service_order_id ?? null;
      if (serviceOrderId) {
        const assignments = await db.Task_Assignment.findAll({
          attributes: ["technician_id"],
          include: [{ model: Task, as: "task", attributes: [], where: { service_order_id: serviceOrderId }, required: true }],
          transaction: t,
        });
        technicianIds = [...new Set(assignments.map((a) => a.technician_id))];
      }
      if (task?.id) {
        const readyCount = await QuotationDetail.count({
          where: {
            issue_id: issueId,
            status: { [Op.in]: ["EXPORTED", "RECEIVED"] },
            service_id: null,
          },
          transaction: t,
        });
        if (readyCount > 0) {
          await db.Task_Assignment.update(
            { status: "IN_PROGRESS" },
            { where: { task_id: task.id, status: "WAITING_STOCK" }, transaction: t },
          );
          await Task.update(
            { status: "IN_PROGRESS" },
            { where: { id: task.id, status: "WAITING_STOCK" }, transaction: t },
          );
        }
      }
    }

    return { order, technicianIds, serviceOrderId };
  }).then(async (result) => {
    for (const technicianId of result.technicianIds) {
      await notifyUser(
        technicianId,
        {
          title: "Phụ tùng đặt riêng đã được giao",
          content: `Kho đã giao phụ tùng "${result.order.item_name}" cho công việc của bạn.`,
          notificationType: "SERVICE_ORDER",
          referenceId: result.serviceOrderId,
        },
        "new_notification",
        { type: "CUSTOM_PART_EXPORTED", customPartOrderId: result.order.id },
      );
    }
    return result.order;
  });
};


module.exports.createRestockRequest = async (requestedBy, spare_part_id, quantity_needed, quotation_detail_id) => {
  const part = await SparePart.findByPk(spare_part_id);
  if (!part) {
    throw { status: 404, message: `Phụ tùng #${spare_part_id} không tồn tại` };
  }
  const request = await RestockRequest.create({
    spare_part_id,
    quotation_detail_id: quotation_detail_id || null,
    quantity_needed,
    requested_by: requestedBy,
    status: "PENDING",
  });
  await notifyRole(
    "INVENTORY_MANAGER",
    {
      title: "Yêu cầu bổ sung phụ tùng",
      content: `Cần bổ sung ${quantity_needed} "${part.name}" — đang thiếu tồn khi lập báo giá.`,
      notificationType: "SYSTEM",
      referenceId: request.id,
    },
    "new_notification",
    { type: "RESTOCK_REQUESTED", restockRequestId: request.id },
  );
  return request;
};

module.exports.getRestockRequests = async () => {
  return await RestockRequest.findAll({
    where: { status: "PENDING" },
    include: [
      { model: SparePart, as: "sparePart", attributes: ["id", "sku", "name", "brand", "stock_quantity"] },
      { model: User, as: "requestedByUser", attributes: ["id", "fullName"] },
    ],
    order: [["createdAt", "ASC"]],
  });
};

module.exports.resolveRestockRequest = async (id) => {
  const request = await RestockRequest.findByPk(id);
  if (!request) {
    throw { status: 404, message: "Không tìm thấy yêu cầu bổ sung phụ tùng" };
  }
  if (request.status !== "PENDING") {
    throw { status: 400, message: "Yêu cầu này đã được xử lý" };
  }
  await request.update({ status: "RESOLVED" });
  return request;
};
const restockRequestServiceOrderInclude = {
  model: QuotationDetail,
  as: "quotationDetail",
  attributes: ["id"],
  required: false,
  include: [
    {
      model: Quotation,
      as: "quotation",
      attributes: ["id"],
      required: false,
      include: [
        {
          model: Task,
          as: "task",
          attributes: ["id", "service_order_id"],
          required: false,
          include: [
            {
              model: Service_Orders,
              as: "serviceOrder",
              attributes: ["id"],
              required: false,
              include: [
                {
                  model: Vehicles,
                  as: "vehicle",
                  attributes: ["id", "license_plate"],
                  required: false,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

module.exports.getRestockRequestsSummary = async () => {
  const requests = await RestockRequest.findAll({
    where: { status: "PENDING" },
    include: [
      { model: SparePart, as: "sparePart", attributes: ["id", "sku", "name", "brand", "stock_quantity"] },
      { model: User, as: "requestedByUser", attributes: ["id", "fullName"] },
      restockRequestServiceOrderInclude,
    ],
    order: [["createdAt", "ASC"]],
  });

  const byServiceOrder = requests.map((r) => {
    const serviceOrder = r.quotationDetail?.quotation?.task?.serviceOrder;
    return {
      id: r.id,
      spare_part_id: r.spare_part_id,
      sparePart: r.sparePart,
      quantity_needed: r.quantity_needed,
      requestedByUser: r.requestedByUser,
      createdAt: r.createdAt,
      serviceOrderId: serviceOrder?.id ?? null,
      vehiclePlate: serviceOrder?.vehicle?.license_plate ?? null,
    };
  });

  const bySparePartMap = new Map();
  for (const r of requests) {
    const key = r.spare_part_id;
    if (!bySparePartMap.has(key)) {
      bySparePartMap.set(key, {
        spare_part_id: key,
        sparePart: r.sparePart,
        stock_quantity: r.sparePart?.stock_quantity ?? 0,
        total_quantity_needed: 0,
        request_ids: [],
      });
    }
    const entry = bySparePartMap.get(key);
    entry.total_quantity_needed += r.quantity_needed;
    entry.request_ids.push(r.id);
  }

  return {
    byServiceOrder,
    bySparePart: Array.from(bySparePartMap.values()),
  };
};

module.exports.getRestockRequestsHistory = async () => {
  const requests = await RestockRequest.findAll({
    where: { status: { [Op.in]: ["FULFILLED", "RESOLVED", "CANCELLED"] } },
    include: [
      { model: SparePart, as: "sparePart", attributes: ["id", "sku", "name", "brand"] },
      { model: User, as: "requestedByUser", attributes: ["id", "fullName"] },
      restockRequestServiceOrderInclude,
    ],
    order: [["updatedAt", "DESC"]],
  });
  return requests.map((r) => {
    const serviceOrder = r.quotationDetail?.quotation?.task?.serviceOrder;
    return {
      id: r.id,
      spare_part_id: r.spare_part_id,
      sparePart: r.sparePart,
      quantity_needed: r.quantity_needed,
      status: r.status,
      requestedByUser: r.requestedByUser,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      serviceOrderId: serviceOrder?.id ?? null,
      vehiclePlate: serviceOrder?.vehicle?.license_plate ?? null,
    };
  });
};

module.exports.exportRestockRequestsExcel = async () => {
  const { bySparePart } = await module.exports.getRestockRequestsSummary();
  if (bySparePart.length === 0) {
    throw { status: 400, message: "Không có yêu cầu bổ sung phụ tùng nào đang chờ" };
  }
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Don dat hang");
  sheet.columns = [
    { width: 16 },
    { width: 36 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
  ];
  const thinBorder = { style: "thin", color: { argb: "FFB8C2CC" } };
  const cellBorder = { top: thinBorder, left: thinBorder, bottom: thinBorder, right: thinBorder };
  sheet.mergeCells("A1:E1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "PHIẾU ĐẶT HÀNG BỔ SUNG PHỤ TÙNG";
  titleCell.font = { bold: true, size: 14, color: { argb: "FF00285E" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 26;
  sheet.mergeCells("A2:E2");
  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = `Ngày xuất: ${new Date().toLocaleDateString("vi-VN")}`;
  subtitleCell.font = { italic: true, size: 10, color: { argb: "FF64748B" } };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };
  const headerValues = ["SKU", "Tên phụ tùng", "Số lượng", "Đơn giá nhập", "Giá bán"];
  const headerRow = sheet.addRow(headerValues);
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF00285E" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = cellBorder;
  });
  headerRow.height = 20;
  bySparePart.forEach((item, index) => {
    const row = sheet.addRow([
      item.sparePart?.sku ?? "",
      item.sparePart?.name ?? "",
      item.total_quantity_needed,
      null,
      null,
    ]);
    const isEvenRow = index % 2 === 1;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = cellBorder;
      if (isEvenRow) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
      }
      cell.alignment = { horizontal: colNumber === 2 ? "left" : "center", vertical: "middle" };
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

module.exports.previewImportRestockExcel = async (fileBuffer) => {
  if (!fileBuffer) {
    throw { status: 400, message: "Không có dữ liệu file để import" };
  }
  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw { status: 400, message: "File không chứa sheet hợp lệ" };
  }
  const sheet = workbook.Sheets[sheetName];
  const rawGrid = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false });
  if (!Array.isArray(rawGrid) || rawGrid.length === 0) {
    throw { status: 400, message: "File không chứa dữ liệu" };
  }
  const normalizeHeaderCell = (cell) =>
    String(cell ?? "")
      .trim()
      .toLowerCase()
      .replace(/đ/g, "d")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  const headerRowIndex = rawGrid.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => normalizeHeaderCell(cell) === "sku"),
  );
  if (headerRowIndex === -1) {
    throw { status: 400, message: 'Không tìm thấy dòng tiêu đề chứa cột "SKU" trong file' };
  }
  const headerCells = rawGrid[headerRowIndex].map(normalizeHeaderCell);
  const colIndex = {
    sku: headerCells.indexOf("sku"),
    name: headerCells.findIndex((h) => h === "ten_phu_tung"),
    quantity: headerCells.findIndex((h) => h === "so_luong"),
    unitPrice: headerCells.findIndex((h) => h === "don_gia_nhap"),
    retailPrice: headerCells.findIndex((h) => h === "gia_ban"),
  };
  if (colIndex.sku === -1) {
    throw { status: 400, message: 'Không tìm thấy cột "SKU" trong file' };
  }
  const dataRows = rawGrid.slice(headerRowIndex + 1);
  const previewList = [];
  for (let i = 0; i < dataRows.length; i += 1) {
    const rawRow = dataRows[i];
    const rowIndex = headerRowIndex + 2 + i + 1; // vị trí dòng thật trong Excel (1-based)
    const sku = String(rawRow[colIndex.sku] ?? "").trim();
    const quantity = parseNumber(rawRow[colIndex.quantity], 0) || 0;
    const unitPrice = parseNumber(rawRow[colIndex.unitPrice], 0) || 0;
    const retailPrice = colIndex.retailPrice !== -1 ? parseNumber(rawRow[colIndex.retailPrice], undefined) : undefined;
    if (!sku) continue; 
    if (quantity <= 0) {
      previewList.push({
        row_index: rowIndex,
        sku,
        isValid: false,
        error: "Số lượng phải lớn hơn 0 — bỏ trống dòng này nếu chưa mua",
      });
      continue;
    }
    const part = await SparePart.findOne({
      where: { sku },
      include: [{ model: PartCategory, as: "category", attributes: ["id", "category_name"] }],
    });
    if (!part) {
      previewList.push({
        row_index: rowIndex,
        sku,
        isValid: false,
        error: `Không tìm thấy phụ tùng với SKU "${sku}" trong danh mục`,
      });
      continue;
    }
    // File Excel không điền "Giá bán" (để trống cho thủ kho tự cân nhắc) -> mặc định hiện giá
    // bán HIỆN TẠI của phụ tùng, không phải để trống — thủ kho nhìn thấy số thật, sửa nếu muốn
    // đổi giá, còn không sửa thì confirmRestockImport vẫn ghi lại đúng giá này (không đổi gì).
    const currentRetailPrice = part.retail_price != null ? Number(part.retail_price) : 0;
    previewList.push({
      row_index: rowIndex,
      spare_part_id: part.id,
      sku: part.sku,
      name: part.name,
      quantity,
      unit_price: unitPrice,
      retail_price: retailPrice != null ? retailPrice : currentRetailPrice,
      category_name: part.category?.category_name ?? null,
      warranty_period_months: part.warranty_period_months ?? null,
      warranty_km_limit: part.warranty_km_limit ?? null,
      isValid: true,
    });
  }

  return previewList;
};

module.exports.confirmRestockImport = async (manager_id, supplier_id, items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw { status: 400, message: "Không có phụ tùng nào để nhập kho" };
  }

  const importResult = await module.exports.importSparePart(
    manager_id,
    supplier_id,
    items.map((i) => ({
      part_id: i.spare_part_id,
      quantity: i.quantity,
      unit_price: i.unit_price,
      retail_price: i.retail_price != null && i.retail_price !== "" ? Number(i.retail_price) : undefined,
    })),
  );

  const sparePartIds = [...new Set(items.map((i) => i.spare_part_id))];
  const fulfilled = [];
  const stillPending = [];

  for (const sparePartId of sparePartIds) {
    const part = await SparePart.findByPk(sparePartId, { attributes: ["id", "name", "stock_quantity"] });
    const pendingRequests = await RestockRequest.findAll({
      where: { spare_part_id: sparePartId, status: "PENDING" },
      attributes: ["id", "quantity_needed", "quotation_detail_id"],
    });
    if (pendingRequests.length === 0) continue;

    const totalNeeded = pendingRequests.reduce((sum, r) => sum + r.quantity_needed, 0);
    if (part && part.stock_quantity >= totalNeeded) {
      await RestockRequest.update(
        { status: "FULFILLED" },
        { where: { id: pendingRequests.map((r) => r.id) } },
      );
      const detailIds = pendingRequests.map((r) => r.quotation_detail_id).filter(Boolean);
      if (detailIds.length > 0) {
        await QuotationDetail.update(
          { status: "PENDING" },
          { where: { id: detailIds, status: "WAITING_STOCK" } },
        );
      }
      fulfilled.push({ spare_part_id: sparePartId, name: part.name, count: pendingRequests.length });
    } else {
      stillPending.push({
        spare_part_id: sparePartId,
        name: part?.name,
        stillNeeded: totalNeeded - (part?.stock_quantity ?? 0),
      });
    }
  }

  return {
    receipt_code: importResult.receipt_code,
    fulfilled,
    stillPending,
  };
};

module.exports.analyzeRestockSuggestions = async (managerId) => {
  const analysisData = await computeRestockAnalysis();
  const candidateParts = analysisData.items.map(item => ({
    part_id: item.part_id,
    sku: item.sku || 'N/A',
    name: item.name,
    brand: item.brand || 'N/A',
    stock_quantity: item.stock_quantity,
    available_stock: item.available_stock,
    daily_consumption: item.daily_consumption,
    projected_demand: item.projected_demand,
    suggested_quantity: item.suggested_quantity,
    min_threshold: item.min_threshold || 0,
    monthly_history: {
      last_30_days: item.month1_consumption || 0,
      days_31_to_60: item.month2_consumption || 0,
      days_61_to_90: item.month3_consumption || 0
    }
  }));

  const suggestions = candidateParts
    .filter(p => p.suggested_quantity > 0)
    .map(p => {
      let reason = "Cần bổ sung hàng.";
      const avail = p.available_stock !== undefined ? p.available_stock : p.stock_quantity;
      if (avail <= 0) {
        reason = "Hết hàng trong kho.";
      } else if (avail <= p.min_threshold) {
        reason = `Tồn kho (${avail}) dưới mức tối thiểu (${p.min_threshold}).`;
      } else if (p.projected_demand > avail) {
        reason = `Nhu cầu dự báo (${p.projected_demand}) vượt quá tồn kho (${avail}).`;
      }
      return { ...p, reason };
    })
    .sort((a, b) => b.suggested_quantity - a.suggested_quantity);

  const outOfStockCount = suggestions.filter((p) => (p.available_stock ?? p.stock_quantity) <= 0).length;
  const lowStockCount = suggestions.length - outOfStockCount;
  const analysisResult = suggestions.length === 0
    ? "Tồn kho hiện tại đáp ứng đủ nhu cầu dự báo, chưa cần nhập thêm phụ tùng nào."
    : `Phát hiện ${suggestions.length} phụ tùng cần nhập thêm` +
      (outOfStockCount > 0 ? `, trong đó ${outOfStockCount} mặt hàng đã hết sạch trong kho` : "") +
      (lowStockCount > 0 ? `${outOfStockCount > 0 ? " và" : ","} ${lowStockCount} mặt hàng dưới ngưỡng tồn kho an toàn` : "") +
      " (dựa trên tốc độ tiêu thụ trung bình có trọng số 3 tháng gần nhất).";

  const aiResult = { analysis_result: analysisResult, suggestions };

  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const prefix = `DXNH-${year}${month}${day}-`;

  const lastProposal = await db.AI_Restock_Proposals.findOne({
    where: {
      proposal_code: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [["proposal_code", "DESC"]]
  });

  let next = 1;
  if (lastProposal) {
    const lastNum = parseInt(lastProposal.proposal_code.slice(prefix.length), 10);
    if (!isNaN(lastNum)) {
      next = lastNum + 1;
    }
  }
  const proposal_code = `${prefix}${String(next).padStart(4, "0")}`;

  const proposal = await db.AI_Restock_Proposals.create({
    proposal_code,
    analysis_result: aiResult.analysis_result,
    items: aiResult.suggestions,
    created_by: managerId
  });

  return await db.AI_Restock_Proposals.findByPk(proposal.id, {
    include: [
      {
        model: db.User,
        as: "creator",
        attributes: ["id", "fullName"]
      }
    ]
  });
};

module.exports.getRestockProposals = async () => {
  return await db.AI_Restock_Proposals.findAll({
    include: [
      {
        model: db.User,
        as: "creator",
        attributes: ["id", "fullName"]
      }
    ],
    order: [["createdAt", "DESC"]]
  });
};

module.exports.getRestockProposalDetail = async (id) => {
  const proposal = await db.AI_Restock_Proposals.findByPk(id, {
    include: [
      {
        model: db.User,
        as: "creator",
        attributes: ["id", "fullName"]
      }
    ]
  });
  if (!proposal) {
    throw { status: 404, message: "Không tìm thấy đề xuất nhập hàng này" };
  }
  return proposal;
};
