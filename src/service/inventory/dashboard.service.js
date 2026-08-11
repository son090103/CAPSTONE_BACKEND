const db = require("../../../models");
const { Op, fn, col, literal } = require("sequelize");

const SparePart = db.Spare_Parts;
const PartCategory = db.Part_Categories;
const InventoryLog = db.Inventory_Logs;
const InventoryBatch = db.Inventory_Batches;

module.exports.getInventoryDashboardSummary = async () => {
    const [parts, categories, lowStock, todayIn, todayOut, recentLogs, importExportTrend, topConsumed, topAgingStock] = await Promise.all([
        SparePart.findAll({
            attributes: ["id", "name", "stock_quantity", "min_threshold", "retail_price", "category_id"],
            raw: true,
        }),
        PartCategory.findAll({
            attributes: ["id", "category_name"],
            raw: true,
        }),
        SparePart.findAll({
            where: {
                stock_quantity: { [Op.lte]: col("min_threshold") },
            },
            attributes: ["id", "name", "stock_quantity", "min_threshold"],
            limit: 8,
            raw: true,
        }),
        InventoryLog.count({
            where: { type: "IN", createdAt: { [Op.gte]: startOfDay() } },
        }),
        InventoryLog.count({
            where: { type: "OUT", createdAt: { [Op.gte]: startOfDay() } },
        }),
        InventoryLog.findAll({
            attributes: ["receipt_code", "type", "quantity", "unit_price", "createdAt"],
            include: [{ model: SparePart, as: "part", attributes: ["name", "sku"] }],
            order: [["createdAt", "DESC"]],
            limit: 8,
            raw: true,
            nest: true,
        }),
        getImportExportTrend(),
        getTopConsumed(),
        getTopAgingStock(),
    ]);

    const totalValue = parts.reduce((sum, item) => sum + Number(item.stock_quantity || 0) * Number(item.retail_price || 0), 0);
    const totalSku = parts.length;
    const lowStockCount = lowStock.length;
    const stockByCategory = categories.map((category) => {
        const categoryParts = parts.filter((item) => Number(item.category_id) === Number(category.id));
        const totalQty = categoryParts.reduce((sum, item) => sum + Number(item.stock_quantity || 0), 0);
        return {
            name: category.category_name,
            value: totalQty,
        };
    }).filter((item) => item.value > 0);

    return {
        summary: {
            totalValue,
            totalSku,
            lowStockCount,
            transactionsToday: todayIn + todayOut,
            importsToday: todayIn,
            exportsToday: todayOut,
        },
        stockByCategory,
        lowStock,
        importExportTrend,
        recentTransactions: recentLogs,
        topConsumed,
        topAgingStock,
    };
};

async function getTopConsumed() {
    const rows = await InventoryLog.findAll({
        attributes: [
            "part_id",
            [fn("SUM", col("quantity")), "totalQty"],
        ],
        where: { type: "OUT" },
        include: [{ model: SparePart, as: "part", attributes: ["name", "brand", "sku"] }],
        group: ["part_id", "part.id", "part.name", "part.brand", "part.sku"],
        order: [[fn("SUM", col("quantity")), "DESC"]],
        limit: 10,
        raw: true,
        nest: true,
    });

    return rows.map((row) => ({
        name: row.part?.brand ? `${row.part.name} (${row.part.brand})` : (row.part?.name || "Phụ tùng"),
        sku: row.part?.sku || null,
        qty: Number(row.totalQty || 0),
    }));
}

// Top 10 phụ tùng còn tồn kho (stock_quantity > 0) nhưng lâu nhất chưa có ai xuất ra dùng -
// tính bằng số ngày kể từ lần xuất kho (type OUT) gần nhất đến nay. Nếu phụ tùng chưa từng
// được xuất lần nào, tính từ lần nhập kho (type IN) gần nhất - coi như "nằm im từ lúc nhập".
async function getTopAgingStock() {
    const parts = await SparePart.findAll({
        where: { stock_quantity: { [Op.gt]: 0 } },
        attributes: ["id", "name", "brand", "sku", "stock_quantity"],
        raw: true,
    });
    if (parts.length === 0) return [];

    const partIds = parts.map((p) => p.id);
    const [lastOutRows, lastInRows] = await Promise.all([
        InventoryLog.findAll({
            where: { part_id: { [Op.in]: partIds }, type: "OUT" },
            attributes: ["part_id", [fn("MAX", col("createdAt")), "lastAt"]],
            group: ["part_id"],
            raw: true,
        }),
        InventoryLog.findAll({
            where: { part_id: { [Op.in]: partIds }, type: "IN" },
            attributes: ["part_id", [fn("MAX", col("createdAt")), "lastAt"]],
            group: ["part_id"],
            raw: true,
        }),
    ]);

    const lastOutByPart = new Map(lastOutRows.map((row) => [row.part_id, row.lastAt]));
    const lastInByPart = new Map(lastInRows.map((row) => [row.part_id, row.lastAt]));
    const now = new Date();

    const aging = parts
        .map((part) => {
            const referenceDate = lastOutByPart.get(part.id) ?? lastInByPart.get(part.id);
            if (!referenceDate) return null;
            const days = Math.floor((now - new Date(referenceDate)) / (1000 * 60 * 60 * 24));
            return {
                name: part.brand ? `${part.name} (${part.brand})` : part.name,
                sku: part.sku || null,
                days,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.days - a.days)
        .slice(0, 10);

    return aging;
}

async function getImportExportTrend() {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    const rows = await InventoryLog.findAll({
        attributes: [
            [fn('DATE', col('createdAt')), 'date'],
            [fn('SUM', literal('CASE WHEN "Inventory_Logs"."type" = \'IN\' THEN "Inventory_Logs"."quantity" ELSE 0 END')), 'importQty'],
            [fn('SUM', literal('CASE WHEN "Inventory_Logs"."type" = \'OUT\' THEN "Inventory_Logs"."quantity" ELSE 0 END')), 'exportQty'],
            [fn('SUM', col('quantity')), 'totalQty'],
        ],
        where: { createdAt: { [Op.gte]: startDate } },
        group: [fn('DATE', col('createdAt'))],
        order: [[fn('DATE', col('createdAt')), 'ASC']],
        raw: true,
    });

    const map = new Map(rows.map((item) => [item.date, item]));
    const labels = [];
    const importQty = [];
    const exportQty = [];

    for (let i = 6; i >= 0; i -= 1) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        const row = map.get(key);
        labels.push(`${date.getDate()}/${date.getMonth() + 1}`);
        importQty.push(Number(row?.importQty || 0));
        exportQty.push(Number(row?.exportQty || 0));
    }

    return { labels, importQty, exportQty };
}

function startOfDay() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
}
