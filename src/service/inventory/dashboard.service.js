const db = require("../../../models");
const { Op, fn, col, literal } = require("sequelize");

const SparePart = db.Spare_Parts;
const PartCategory = db.Part_Categories;
const InventoryLog = db.Inventory_Logs;
const InventoryBatch = db.Inventory_Batches;

module.exports.getInventoryDashboardSummary = async () => {
    const [parts, categories, lowStock, todayIn, todayOut, recentLogs, importExportTrend, topConsumed] = await Promise.all([
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
            where: { createdAt: { [Op.gte]: startOfDay() } },
            attributes: ["receipt_code", "type", "quantity", "unit_price", "createdAt"],
            include: [{ model: SparePart, as: "part", attributes: ["name", "sku"] }],
            order: [["createdAt", "DESC"]],
            limit: 8,
            raw: true,
            nest: true,
        }),
        getImportExportTrend(),
        getTopConsumed(),
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
    };
};

async function getTopConsumed() {
    const rows = await InventoryLog.findAll({
        attributes: [
            "part_id",
            [fn("SUM", col("quantity")), "totalQty"],
        ],
        where: { type: "OUT" },
        include: [{ model: SparePart, as: "part", attributes: ["name", "brand"] }],
        group: ["part_id", "part.id", "part.name", "part.brand"],
        order: [[fn("SUM", col("quantity")), "DESC"]],
        limit: 7,
        raw: true,
        nest: true,
    });

    return rows.map((row) => ({
        name: row.part?.brand ? `${row.part.name} (${row.part.brand})` : (row.part?.name || "Phụ tùng"),
        qty: Number(row.totalQty || 0),
    }));
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
