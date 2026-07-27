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

module.exports.getApprovedQuotesWithParts = async () => {
  const result = await Quotation.findAll({
    where: { status: "APPROVED" },
    attributes: ["id", "total_amount", "status","approved_at", "note", "createdAt"],
    include: [
      {
        model: QuotationDetail,
        as: "items",
        where: {
          spare_part_id: { [Op.ne]: null },
          status: "PENDING",
        },
        attributes: ["id", "spare_part_id", "quantity", "unit_price", "amount"],
        include: [
          {
            model: SparePart,
            as: "sparePart",
            attributes: ["id", "name", "sku", "stock_quantity"],
          },
        ],
      },
      {
        model: User,
        as: "creator",
        attributes: ["id", "fullName"],
      }
    ],
    order: [["approved_at", "DESC"]],
  });
  return result;
};

module.exports.approveExportByQuotation = async (quotationId, detailIds, managerId) => {
  return await db.sequelize.transaction(async (t) => {
    const quotation = await Quotation.findByPk(quotationId, {
      include: [
        {
          model: Task,
          as: "task",
          attributes: ["id", "service_order_id"],
        },
        {
          model: QuotationDetail,
          as: "items",
          where: {
            id: detailIds,
            spare_part_id: { [Op.ne]: null },
            status: "PENDING",
          },
          include: [{ model: SparePart, as: "sparePart" }],
        },
      ],
      transaction: t,
    });
    if (!quotation) {
      throw { status: 404, message: "Không tìm thấy báo giá" };
    }
    if (quotation.status !== "APPROVED") {
      throw { status: 400, message: "Chỉ có thể xuất kho cho báo giá đã được khách duyệt" };
    }
    if (quotation.items.length !== detailIds.length) {
      throw { status: 400, message: "Có dòng không hợp lệ hoặc đã được xuất kho" };
    }
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
    let next = last?.receipt_code
      ? parseInt(last.receipt_code.slice(prefix.length), 10) + 1
      : 1;
    const receipt_code = `${prefix}${String(next).padStart(4, "0")}`;

    const logsData = [];
    for (const item of quotation.items) {
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
        service_order_id: quotation.task?.service_order_id || null,
        type: "OUT",
        quantity: item.quantity,
        unit_price: item.unit_price,
        manager_id: managerId,
      });
    }
    await InventoryLog.bulkCreate(logsData, { transaction: t });
    return { receipt_code, exported_count: logsData.length };
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
      { model: SparePart, as: "part", attributes: ["sku", "name"] },
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
    ],
    include: [
      { model: User, as: "manager", attributes: [] },
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
    attributes: ["id", "receipt_code", "createdAt", "quantity", "unit_price"],
    include: [
      { model: SparePart, as: "part", attributes: ["sku", "name"] },
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

