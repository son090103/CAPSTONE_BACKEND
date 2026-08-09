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
const sparePartService = require("../../service/inventory/sparePartManagement.service");
const geminiClient = require("../../config/gemini.config");
const Task = db.Task;
const Service_Orders = db.Service_Orders;
const Vehicles = db.Vehicles;
const Vehicle_Models = db.Vehicle_Models;
const Customers = db.Customers;
const { notifyUser } = require("../../util/notification.util");
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

// Danh sách các dòng phụ tùng đang chờ thủ kho duyệt xuất (kỹ thuật viên đã yêu cầu
// từ màn "Tiến độ công việc"). Gộp theo requested_by để thủ kho biết KTV nào cần.
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

// Thủ kho xác nhận xuất kho cho yêu cầu của kỹ thuật viên. Mỗi yêu cầu vốn đã gắn với đúng 1 KTV
// (requested_by ghi từ lúc KTV gửi yêu cầu), nên không cần suy luận lại qua Task_Assignment.
// Không còn bước ký nhận riêng - bấm xác nhận xuất kho là coi như đã giao xong, resume ngay
// các Task/Task_Assignment đang WAITING_STOCK của KTV đó trong lệnh sửa chữa này.
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

    const waitingAssignments = await db.Task_Assignment.findAll({
      where: { technician_id: technicianId, status: "WAITING_STOCK" },
      include: [
        { model: Task, as: "task", attributes: ["id"], where: { service_order_id: serviceOrderId }, required: true },
      ],
      transaction: t,
    });
    for (const assignment of waitingAssignments) {
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

// Dữ liệu đầy đủ cho phiếu xuất kho (để FE tự dựng PDF in ra ký tay lưu hồ sơ giấy)
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
const CONSUMPTION_WINDOW_DAYS = 30;
const RECENT_WINDOW_DAYS = 15;
const RECENT_WEIGHT = 0.7;
const DEFAULT_RESTOCK_DAYS = 14;

// Tính toán đầy đủ cho TẤT CẢ phụ tùng (không lọc suggested_quantity > 0) - dùng chung cho
// cả trang "Đề xuất nhập hàng" (chỉ hiện phần cần nhập) và widget "Tình trạng tồn kho" trên
// dashboard (cần đếm cả phụ tùng đang ổn định, không chỉ phần cần nhập).
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
  const recentStart = new Date();
  recentStart.setDate(recentStart.getDate() - RECENT_WINDOW_DAYS);

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
        status: { [Op.in]: ["REQUESTED", "WAITING_STOCK"] },
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

  // Gộp tổng xuất kho theo từng phụ tùng, tách riêng nửa gần đây (recent) và nửa trước đó
  // (previous) để so sánh xu hướng thay vì chỉ lấy 1 con số trung bình phẳng cho cả 30 ngày.
  const consumptionByPart = new Map();
  for (const log of consumptionLogs) {
    const entry = consumptionByPart.get(log.part_id) ?? { recentTotal: 0, previousTotal: 0 };
    const isRecent = new Date(log.createdAt) >= recentStart;
    if (isRecent) {
      entry.recentTotal += Number(log.quantity);
    } else {
      entry.previousTotal += Number(log.quantity);
    }
    consumptionByPart.set(log.part_id, entry);
  }

  const heldByPart = new Map(
    heldRows.map((row) => [row.spare_part_id, Number(row.total_held)]),
  );

  const previousWindowDays = CONSUMPTION_WINDOW_DAYS - RECENT_WINDOW_DAYS;

  const items = parts
    .map((part) => {
      const consumption = consumptionByPart.get(part.id);
      const recentRate = (consumption?.recentTotal ?? 0) / RECENT_WINDOW_DAYS;
      const previousRate = (consumption?.previousTotal ?? 0) / previousWindowDays;

      // Chỉ pha trộn 2 giai đoạn khi cả 2 đều có dữ liệu thực tế; nếu 1 trong 2 giai đoạn
      // không có xuất kho nào thì dùng thẳng tốc độ của giai đoạn còn lại, tránh pha loãng
      // sai (vd phụ tùng chỉ mới bắt đầu bán chạy trong 15 ngày gần đây).
      let predictedRate;
      if ((consumption?.recentTotal ?? 0) > 0 && (consumption?.previousTotal ?? 0) > 0) {
        predictedRate = recentRate * RECENT_WEIGHT + previousRate * (1 - RECENT_WEIGHT);
      } else {
        predictedRate = recentRate > 0 ? recentRate : previousRate;
      }

      const trend = previousRate > 0
        ? Number((((recentRate - previousRate) / previousRate) * 100).toFixed(0))
        : null;

      const held = heldByPart.get(part.id) ?? 0;
      const availableStock = part.stock_quantity - held;
      const projectedDemand = predictedRate * restockDays;
      const suggestedQuantity = Math.max(0, Math.ceil(projectedDemand - availableStock));

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
  return await QuotationDetail.findAll({
    where: { status: "WAITING_STOCK" },
    attributes: ["id", "custom_item_name", "quantity", "unit_price", "status", "createdAt"],
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
            attributes: ["id"],
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
                    required: true,
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
                            model: User,
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
      },
    ],
    order: [["createdAt", "ASC"]],
  });
};

module.exports.importSparePartForOrderItem = async (manager_id, supplier_id, items) => {
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
    const linkedDetails = []; // NEW: theo dõi các dòng báo giá vừa được liên kết
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
        quotation_item_id, // NEW
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
      if (quotation_item_id) {
        const detail = await QuotationDetail.findByPk(quotation_item_id, {
          transaction: t,
        });
        if (!detail || detail.status !== "WAITING_STOCK") {
          throw {
            status: 400,
            message: `Dòng báo giá #${quotation_item_id} không ở trạng thái chờ hàng`,
          };
        }
          if (Number(unit_price) > Number(detail.unit_price)) {
          throw {
            status: 400,
            message: `Giá nhập (${unit_price}) cao hơn giá đã báo khách (${detail.unit_price}) cho "${detail.custom_item_name}". Không thể nhập kho.`,
          };
        }
        await detail.update(
          { spare_part_id: part.id, status: "PENDING" },
          { transaction: t },
        );
        linkedDetails.push(detail);
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

    const issueIds = [
      ...new Set(linkedDetails.map((d) => d.issue_id).filter(Boolean)),
    ];
    let serviceOrderIds = [];
    if (issueIds.length > 0) {
      const issues = await db.Vehicle_Issues.findAll({
        where: { id: issueIds },
        attributes: ["id", "task_id"],
        transaction: t,
      });
      const taskIds = [...new Set(issues.map((i) => i.task_id).filter(Boolean))];
      if (taskIds.length > 0) {
        const relatedTasks = await Task.findAll({
          where: { id: taskIds },
          attributes: ["id", "service_order_id"],
          transaction: t,
        });
        serviceOrderIds = [
          ...new Set(relatedTasks.map((tsk) => tsk.service_order_id)),
        ];
      }
    }

    return {
      receipt_code,
      items: results,
      linkedDetails,
      serviceOrderIds,
    };
  }).then(async (result) => {
    if (result.serviceOrderIds.length > 0) {
      const assignments = await db.Task_Assignment.findAll({
        attributes: ["technician_id"],
        include: [
          {
            model: Task,
            as: "task",
            attributes: [],
            where: { service_order_id: result.serviceOrderIds },
            required: true,
          },
        ],
      });
      const technicianIds = [
        ...new Set(assignments.map((a) => a.technician_id)),
      ];
      for (const technicianId of technicianIds) {
        await notifyUser(
          technicianId,
          {
            title: "Phụ tùng đặt riêng đã về kho",
            content: "Phụ tùng đặt riêng bạn đang chờ đã nhập kho, kho sẽ sớm xuất cho bạn.",
            notificationType: "SERVICE_ORDER",
          },
          "new_notification",
          { type: "PARTS_IMPORTED" },
        );
      }
    }
    return {
      receipt_code: result.receipt_code,
      items: result.items,
      linkedDetails: result.linkedDetails,
    };
  });
};
