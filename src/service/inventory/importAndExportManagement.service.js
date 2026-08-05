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

// Thủ kho duyệt yêu cầu xuất kho của kỹ thuật viên. Mỗi yêu cầu vốn đã gắn với đúng 1 KTV
// (requested_by ghi từ lúc KTV gửi yêu cầu), nên không cần suy luận lại qua Task_Assignment.
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
      // Chưa EXPORTED ngay - chờ KTV ký tên xác nhận tại quầy (xem signExportReceipt)
      await item.update({ status: "WAITING_SIGNATURE" }, { transaction: t });
      logsData.push({
        receipt_code,
        part_id: part.id,
        service_order_id: serviceOrderId,
        type: "OUT",
        quantity: item.quantity,
        unit_price: item.unit_price,
        manager_id: managerId,
        requested_technician_id: technicianId,
      });
    }
    await InventoryLog.bulkCreate(logsData, { transaction: t });

    return { receipt_code, exported_count: logsData.length, technicianId, serviceOrderId };
  }).then(async (result) => {
    await notifyUser(
      result.technicianId,
      {
        title: "Phụ tùng đã xuất kho - cần ký xác nhận",
        content: `Kho đã chuẩn bị ${result.exported_count} phụ tùng (phiếu ${result.receipt_code}). Vui lòng ký tên tại quầy kho để hoàn tất.`,
        notificationType: "SERVICE_ORDER",
        referenceId: result.serviceOrderId,
      },
      "new_notification",
      { type: "PARTS_EXPORTED_WAITING_SIGNATURE", serviceOrderId: result.serviceOrderId, receiptCode: result.receipt_code },
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

// Kỹ thuật viên vẽ chữ ký tay ngay trên màn hình thủ kho để xác nhận đã nhận phụ tùng.
// Đây là bước hoàn tất cuối cùng - không cần thao tác gì thêm sau đó (không có bước
// "xác nhận nhận hàng" riêng như luồng cũ).
module.exports.signExportReceipt = async (receiptCode, signatureBuffer) => {
  if (!signatureBuffer) {
    throw { status: 400, message: "Vui lòng ký tên để xác nhận nhận phụ tùng" };
  }
  return await db.sequelize.transaction(async (t) => {
    const logs = await InventoryLog.findAll({
      where: { receipt_code: receiptCode, type: "OUT" },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (logs.length === 0) {
      throw { status: 404, message: "Không tìm thấy phiếu xuất kho này" };
    }
    const firstLog = logs[0];
    if (firstLog.received_by) {
      throw { status: 400, message: "Phiếu xuất kho này đã được ký nhận" };
    }
    const technicianId = firstLog.requested_technician_id;
    if (!technicianId) {
      throw { status: 400, message: "Không xác định được kỹ thuật viên nhận phiếu này" };
    }
    const serviceOrderId = firstLog.service_order_id;
    const partIds = logs.map((log) => log.part_id);

    const uploadResult = await uploadToCloudinary(signatureBuffer, "inventory-signatures");
    const now = new Date();
    await InventoryLog.update(
      {
        received_by: technicianId,
        received_at: now,
        signature_method: "SIGNATURE",
        proof_image_url: uploadResult.secure_url,
      },
      { where: { receipt_code: receiptCode, type: "OUT" }, transaction: t },
    );

    await QuotationDetail.update(
      { status: "EXPORTED" },
      { where: { spare_part_id: partIds, status: "WAITING_SIGNATURE" }, transaction: t },
    );

    // Chỉ resume công việc SAU KHI đã ký xong - đúng tinh thần "ký nhận mới coi là đã nhận hàng"
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

    return { receipt_code: receiptCode, technicianId, part_count: logs.length, serviceOrderId };
  }).then(async (result) => {
    await notifyUser(
      result.technicianId,
      {
        title: "Đã ký nhận phụ tùng thành công",
        content: `Bạn đã ký nhận ${result.part_count} phụ tùng theo phiếu ${result.receipt_code}.`,
        notificationType: "SERVICE_ORDER",
        referenceId: result.serviceOrderId,
      },
      "new_notification",
      { type: "PARTS_EXPORT_SIGNED", serviceOrderId: result.serviceOrderId },
    );
    return { receipt_code: result.receipt_code, part_count: result.part_count };
  });
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
