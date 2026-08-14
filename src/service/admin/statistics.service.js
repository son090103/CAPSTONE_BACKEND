const db = require("../../../models");
const { Op } = require("sequelize");

const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function getVietnamDateKey(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(value));
  const dateParts = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function getChartData(payments, timeframe, start, end) {
  const days = [];
  const revenueMap = {};
  const ordersMap = {};

  if (timeframe === 'today') {
    const slots = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00'];
    slots.forEach(slot => {
      days.push(slot);
      revenueMap[slot] = 0;
      ordersMap[slot] = 0;
    });

    payments.forEach(p => {
      const hour = new Date(p.paid_at).getHours();
      let slot = '08:00';
      if (hour >= 9 && hour <= 10) slot = '10:00';
      else if (hour >= 11 && hour <= 12) slot = '12:00';
      else if (hour >= 13 && hour <= 14) slot = '14:00';
      else if (hour >= 15 && hour <= 16) slot = '16:00';
      else if (hour >= 17) slot = '18:00';

      revenueMap[slot] += parseFloat(p.amount || 0);
      ordersMap[slot] += 1;
    });

  } else if (timeframe === '7days') {
    // Generate last 7 days labels
    const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
      const label = dayNames[d.getDay()];
      const key = getVietnamDateKey(d);
      days.push(label);
      revenueMap[key] = 0;
      ordersMap[key] = 0;
    }

    payments.forEach(p => {
      const key = getVietnamDateKey(p.paid_at);
      if (revenueMap[key] !== undefined) {
        revenueMap[key] += parseFloat(p.amount || 0);
        ordersMap[key] += 1;
      }
    });

    const revenueList = [];
    const ordersList = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
      const key = getVietnamDateKey(d);
      revenueList.push(Number((revenueMap[key] / 1000000).toFixed(2))); // In Million VND
      ordersList.push(ordersMap[key]);
    }

    return { days, revenue: revenueList, orders: ordersList };

  } else if (timeframe === 'month' || timeframe === 'lastMonth') {
    // Group by weeks: Tuần 1, Tuần 2, Tuần 3, Tuần 4
    const slots = ['Tuần 1', 'Tuần 2', 'Tuần 3', 'Tuần 4'];
    slots.forEach(slot => {
      days.push(slot);
      revenueMap[slot] = 0;
      ordersMap[slot] = 0;
    });

    payments.forEach(p => {
      const date = new Date(p.paid_at).getDate();
      let slot = 'Tuần 1';
      if (date >= 8 && date <= 14) slot = 'Tuần 2';
      else if (date >= 15 && date <= 21) slot = 'Tuần 3';
      else if (date >= 22) slot = 'Tuần 4';

      revenueMap[slot] += parseFloat(p.amount || 0);
      ordersMap[slot] += 1;
    });

  } else if (timeframe === 'year' || timeframe === 'lastYear') {
    const monthNames = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ];
    monthNames.forEach(m => {
      days.push(m);
    });

    const yearRevenueMap = {};
    const yearOrdersMap = {};
    for (let mIdx = 0; mIdx < 12; mIdx++) {
      yearRevenueMap[mIdx] = 0;
      yearOrdersMap[mIdx] = 0;
    }

    payments.forEach(p => {
      const mIdx = new Date(p.paid_at).getMonth();
      yearRevenueMap[mIdx] += parseFloat(p.amount || 0);
      yearOrdersMap[mIdx] += 1;
    });

    const revenueList = [];
    const ordersList = [];
    for (let mIdx = 0; mIdx < 12; mIdx++) {
      revenueList.push(Number((yearRevenueMap[mIdx] / 1000000).toFixed(2)));
      ordersList.push(yearOrdersMap[mIdx]);
    }

    return { days, revenue: revenueList, orders: ordersList };

  } else if (timeframe === 'quarter') {
    const monthNames = [
      'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
      'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
    ];

    const startMonth = start.getMonth();
    for (let i = 0; i < 3; i++) {
      const mIdx = (startMonth + i) % 12;
      const label = monthNames[mIdx];
      days.push(label);
      revenueMap[mIdx] = 0;
      ordersMap[mIdx] = 0;
    }

    payments.forEach(p => {
      const mIdx = new Date(p.paid_at).getMonth();
      if (revenueMap[mIdx] !== undefined) {
        revenueMap[mIdx] += parseFloat(p.amount || 0);
        ordersMap[mIdx] += 1;
      }
    });

    const revenueList = [];
    const ordersList = [];
    for (let i = 0; i < 3; i++) {
      const mIdx = (startMonth + i) % 12;
      revenueList.push(Number((revenueMap[mIdx] / 1000000).toFixed(2)));
      ordersList.push(ordersMap[mIdx]);
    }

    return { days, revenue: revenueList, orders: ordersList };

  } else {
    // Custom range: Group by Date
    // If range is <= 7 days, show day names, else show date DD/MM
    const diffTime = Math.abs(end - start);
    // Include both startDate and endDate in the chart.
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;

    const dayNames = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

    for (let i = 0; i < diffDays; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = getVietnamDateKey(d);
      const label = diffDays <= 7
        ? dayNames[d.getDay()]
        : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

      days.push(label);
      revenueMap[key] = 0;
      ordersMap[key] = 0;
    }

    payments.forEach(p => {
      const key = getVietnamDateKey(p.paid_at);
      if (revenueMap[key] !== undefined) {
        revenueMap[key] += parseFloat(p.amount || 0);
        ordersMap[key] += 1;
      }
    });

    const revenueList = [];
    const ordersList = [];
    for (let i = 0; i < diffDays; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = getVietnamDateKey(d);
      revenueList.push(Number((revenueMap[key] / 1000000).toFixed(2)));
      ordersList.push(ordersMap[key]);
    }

    return { days, revenue: revenueList, orders: ordersList };
  }

  // Map for today, month, custom
  const revenueList = days.map(day => Number((revenueMap[day] / 1000000).toFixed(2)));
  const ordersList = days.map(day => ordersMap[day]);

  return { days, revenue: revenueList, orders: ordersList };
}

module.exports.getAdminDashboardStats = async (query) => {
  const { timeframe, startDate, endDate, year, month, week } = query;

  // 1. Calculate Date bounds
  let start, end;
  let computedTimeframe = timeframe;
  const now = new Date();

  if (year) {
    const y = parseInt(year, 10);
    if (month) {
      const m = parseInt(month, 10) - 1; // 0-indexed month
      if (week) {
        const w = parseInt(week, 10);
        // Week ranges:
        // w=1: 1-7
        // w=2: 8-14
        // w=3: 15-21
        // w=4: 22-end
        const startDay = w === 1 ? 1 : w === 2 ? 8 : w === 3 ? 15 : 22;
        start = new Date(y, m, startDay, 0, 0, 0, 0);
        if (w < 4) {
          end = new Date(y, m, startDay + 6, 23, 59, 59, 999);
        } else {
          end = new Date(y, m + 1, 0, 23, 59, 59, 999); // last day of month
        }
        computedTimeframe = 'week';
      } else {
        start = new Date(y, m, 1, 0, 0, 0, 0);
        end = new Date(y, m + 1, 0, 23, 59, 59, 999);
        computedTimeframe = 'month';
      }
    } else {
      start = new Date(y, 0, 1, 0, 0, 0, 0);
      end = new Date(y, 11, 31, 23, 59, 59, 999);
      computedTimeframe = 'year';
    }
  } else {
    if (timeframe === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    } else if (timeframe === '7days') {
      start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
    } else if (timeframe === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else if (timeframe === 'lastMonth') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    } else if (timeframe === 'quarter') {
      const currentQuarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), currentQuarter * 3, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0, 23, 59, 59, 999);
    } else if (timeframe === 'year') {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (timeframe === 'lastYear') {
      start = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999);
    } else if (startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      computedTimeframe = 'custom';
    } else {
      // default to 7days
      start = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      start.setHours(0, 0, 0, 0);
      end = new Date(now);
      end.setHours(23, 59, 59, 999);
      computedTimeframe = '7days';
    }
  }

  // 2. Query PAID Payments in the time range
  const payments = await db.Booking_Payments.findAll({
    where: {
      payment_status: 'PAID',
      paid_at: {
        [Op.between]: [start, end]
      }
    },
    raw: true
  });

  const periodDurationMs = end.getTime() - start.getTime() + 1;
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - periodDurationMs + 1);
  const previousPayments = await db.Booking_Payments.findAll({
    where: {
      payment_status: 'PAID',
      paid_at: { [Op.between]: [previousStart, previousEnd] }
    },
    raw: true
  });

  // Calculate Chart data
  const chartData = getChartData(payments, computedTimeframe, start, end);

  // Calculate KPIs
  const totalRevenue = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const totalOrders = payments.length;
  const avgRevPerOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  const paidOrderIds = [...new Set(payments.map(p => p.order_id).filter(Boolean))];
  let totalCost = 0;
  if (paidOrderIds.length > 0) {
    const costRows = await db.sequelize.query(`
      SELECT
        qd.spare_part_id AS "sparePartId",
        SUM(qd.quantity) AS "quantitySold"
      FROM "Quotation_Details" qd
      INNER JOIN "Quotations" q ON q.id = qd.quotation_id
      INNER JOIN "Tasks" t ON t.id = q.task_id
      WHERE t.service_order_id IN (:orderIds)
        AND qd.spare_part_id IS NOT NULL
        AND qd.status != 'CANCELLED'
        AND q.status = 'APPROVED'
      GROUP BY qd.spare_part_id
    `, {
      replacements: { orderIds: paidOrderIds },
      type: db.Sequelize.QueryTypes.SELECT
    });

    if (costRows.length > 0) {
      const avgCostRows = await db.sequelize.query(`
        SELECT part_id AS "sparePartId", AVG(unit_cost) AS "avgUnitCost"
        FROM "Inventory_Batches" ib
        INNER JOIN "Inventory_Logs" il ON il.id = ib.inventory_log_id
        WHERE il.part_id IN (:sparePartIds)
        GROUP BY part_id
      `, {
        replacements: { sparePartIds: costRows.map(r => r.sparePartId) },
        type: db.Sequelize.QueryTypes.SELECT
      });
      const avgCostBySparePartId = new Map(avgCostRows.map(r => [r.sparePartId, parseFloat(r.avgUnitCost || 0)]));
      totalCost = costRows.reduce((sum, row) => {
        const avgCost = avgCostBySparePartId.get(row.sparePartId) || 0;
        return sum + avgCost * Number(row.quantitySold || 0);
      }, 0);
    }
  }
  const totalProfit = totalRevenue - totalCost;
  const previousRevenue = previousPayments.reduce((sum, payment) => sum + parseFloat(payment.amount || 0), 0);
  const previousOrders = previousPayments.length;
  const previousAvgRevPerOrder = previousOrders > 0 ? Math.round(previousRevenue / previousOrders) : 0;
  const percentageChange = (current, previous) => previous > 0
    ? Number((((current - previous) / previous) * 100).toFixed(1))
    : null;

  // Allocate actual paid revenue back to approved quotation lines. This keeps the
  // source breakdown reconciled to cash collected instead of presenting quotation
  // value as if it were paid revenue.
  const [revenueSourceRow] = await db.sequelize.query(`
    WITH paid_orders AS (
      SELECT order_id, amount::numeric AS paid_amount
      FROM "Booking_Payments"
      WHERE payment_status = 'PAID' AND paid_at BETWEEN :start AND :end
    ), order_lines AS (
      SELECT
        t.service_order_id,
        COALESCE(SUM(qd.amount) FILTER (WHERE qd.status <> 'CANCELLED'), 0) AS quoted_total,
        COALESCE(SUM(qd.amount) FILTER (WHERE qd.service_id IS NOT NULL AND qd.spare_part_id IS NULL AND qd.custom_item_name IS NULL AND qd.status <> 'CANCELLED'), 0) AS service_amount,
        COALESCE(SUM(qd.amount) FILTER (WHERE (qd.spare_part_id IS NOT NULL OR qd.custom_item_name IS NOT NULL) AND qd.status <> 'CANCELLED'), 0) AS parts_amount
      FROM "Tasks" t
      INNER JOIN "Quotations" q ON q.task_id = t.id AND q.status = 'APPROVED'
      INNER JOIN "Quotation_Details" qd ON qd.quotation_id = q.id
      GROUP BY t.service_order_id
    )
    SELECT
      COALESCE(SUM(po.paid_amount * ol.service_amount / NULLIF(ol.quoted_total, 0)), 0) AS service_revenue,
      COALESCE(SUM(po.paid_amount * ol.parts_amount / NULLIF(ol.quoted_total, 0)), 0) AS parts_revenue,
      COALESCE(SUM(CASE WHEN ol.quoted_total IS NULL OR ol.quoted_total = 0 THEN po.paid_amount ELSE 0 END), 0) AS unallocated_revenue
    FROM paid_orders po
    LEFT JOIN order_lines ol ON ol.service_order_id = po.order_id
  `, {
    replacements: { start, end },
    type: db.Sequelize.QueryTypes.SELECT
  });

  const allocatedServiceRevenue = Number(revenueSourceRow?.service_revenue || 0);
  const allocatedPartsRevenue = Number(revenueSourceRow?.parts_revenue || 0);
  const explicitUnallocatedRevenue = Number(revenueSourceRow?.unallocated_revenue || 0);
  const roundingOrOtherRevenue = Math.max(0, totalRevenue - allocatedServiceRevenue - allocatedPartsRevenue - explicitUnallocatedRevenue);
  const unallocatedRevenue = explicitUnallocatedRevenue + roundingOrOtherRevenue;

  const topPaidServices = await db.sequelize.query(`
    WITH paid_orders AS (
      SELECT order_id, amount::numeric AS paid_amount
      FROM "Booking_Payments"
      WHERE payment_status = 'PAID' AND paid_at BETWEEN :start AND :end
    ), order_totals AS (
      SELECT t.service_order_id, SUM(qd.amount)::numeric AS quoted_total
      FROM "Tasks" t
      INNER JOIN "Quotations" q ON q.task_id = t.id AND q.status = 'APPROVED'
      INNER JOIN "Quotation_Details" qd ON qd.quotation_id = q.id AND qd.status <> 'CANCELLED'
      GROUP BY t.service_order_id
    )
    SELECT
      sc.service_name AS name,
      COALESCE(cat.category_name, 'Chưa phân loại') AS category,
      COUNT(DISTINCT t.service_order_id)::int AS "orderCount",
      COALESCE(SUM(qd.quantity), 0)::int AS quantity,
      COALESCE(SUM(po.paid_amount * qd.amount / NULLIF(ot.quoted_total, 0)), 0) AS revenue,
      COALESCE(AVG(sc.estimated_duration), 0) AS "durationAvg"
    FROM paid_orders po
    INNER JOIN "Tasks" t ON t.service_order_id = po.order_id
    INNER JOIN "Quotations" q ON q.task_id = t.id AND q.status = 'APPROVED'
    INNER JOIN "Quotation_Details" qd ON qd.quotation_id = q.id AND qd.service_id IS NOT NULL AND qd.spare_part_id IS NULL AND qd.custom_item_name IS NULL AND qd.status <> 'CANCELLED'
    INNER JOIN "Service_Catalogs" sc ON sc.id = qd.service_id
    LEFT JOIN "Service_Categories" cat ON cat.id = sc.category_id
    INNER JOIN order_totals ot ON ot.service_order_id = po.order_id
    GROUP BY sc.id, sc.service_name, cat.category_name
    ORDER BY revenue DESC
    LIMIT 10
  `, { replacements: { start, end }, type: db.Sequelize.QueryTypes.SELECT });

  const topPaidParts = await db.sequelize.query(`
    WITH paid_orders AS (
      SELECT order_id, amount::numeric AS paid_amount
      FROM "Booking_Payments"
      WHERE payment_status = 'PAID' AND paid_at BETWEEN :start AND :end
    ), order_totals AS (
      SELECT t.service_order_id, SUM(qd.amount)::numeric AS quoted_total
      FROM "Tasks" t
      INNER JOIN "Quotations" q ON q.task_id = t.id AND q.status = 'APPROVED'
      INNER JOIN "Quotation_Details" qd ON qd.quotation_id = q.id AND qd.status <> 'CANCELLED'
      GROUP BY t.service_order_id
    ), average_cost AS (
      SELECT il.part_id, SUM(ib.unit_cost * il.quantity) / NULLIF(SUM(il.quantity), 0) AS unit_cost
      FROM "Inventory_Batches" ib
      INNER JOIN "Inventory_Logs" il ON il.id = ib.inventory_log_id AND il.type = 'IN'
      GROUP BY il.part_id
    )
    SELECT
      COALESCE(sp.name, qd.custom_item_name, 'Phụ tùng khác') AS name,
      COALESCE(SUM(qd.quantity), 0)::int AS quantity,
      COUNT(DISTINCT t.service_order_id)::int AS "orderCount",
      COALESCE(SUM(po.paid_amount * qd.amount / NULLIF(ot.quoted_total, 0)), 0) AS revenue,
      COALESCE(MAX(ac.unit_cost), 0) AS "averageInputPrice",
      COALESCE(SUM(qd.quantity * ac.unit_cost), 0) AS cost
    FROM paid_orders po
    INNER JOIN "Tasks" t ON t.service_order_id = po.order_id
    INNER JOIN "Quotations" q ON q.task_id = t.id AND q.status = 'APPROVED'
    INNER JOIN "Quotation_Details" qd ON qd.quotation_id = q.id
      AND (qd.spare_part_id IS NOT NULL OR qd.custom_item_name IS NOT NULL)
      AND qd.status <> 'CANCELLED'
    LEFT JOIN "Spare_Parts" sp ON sp.id = qd.spare_part_id
    LEFT JOIN average_cost ac ON ac.part_id = qd.spare_part_id
    INNER JOIN order_totals ot ON ot.service_order_id = po.order_id
    GROUP BY COALESCE(sp.name, qd.custom_item_name, 'Phụ tùng khác')
    ORDER BY revenue DESC
    LIMIT 10
  `, { replacements: { start, end }, type: db.Sequelize.QueryTypes.SELECT });

  const importLogs = await db.Inventory_Logs.findAll({
    where: { type: 'IN', createdAt: { [Op.between]: [start, end] } },
    attributes: ['quantity', 'unit_price'],
    raw: true
  });
  const inventoryImportValue = importLogs.reduce(
    (sum, log) => sum + Number(log.quantity || 0) * Number(log.unit_price || 0),
    0
  );

  const [workflowRow] = await db.sequelize.query(`
    SELECT
      COUNT(*) FILTER (WHERE status IN ('PENDING', 'INSPECTING', 'PENDING_QUOTATION'))::int AS received,
      COUNT(*) FILTER (WHERE status IN ('IN_PROGRESS', 'WAITING_FOR_PARTS'))::int AS repairing,
      COUNT(*) FILTER (WHERE status IN ('COMPLETED', 'DELIVERED'))::int AS completed
    FROM "Service_Orders"
  `, { type: db.Sequelize.QueryTypes.SELECT });

  const paymentStatusRows = await db.Booking_Payments.findAll({
    attributes: [
      'payment_status',
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']
    ],
    group: ['payment_status'],
    raw: true
  });

  const [taskSummary] = await db.sequelize.query(`
    SELECT
      COUNT(*) FILTER (WHERE t.status IN ('PENDING', 'ASSIGNED'))::int AS pending,
      COUNT(*) FILTER (WHERE t.status = 'IN_PROGRESS')::int AS in_progress,
      COUNT(*) FILTER (WHERE t.status IN ('WAITING_STOCK', 'WAITING_FOR_PARTS'))::int AS waiting_parts,
      COUNT(*) FILTER (
        WHERE t.status IN ('PENDING', 'ASSIGNED', 'IN_PROGRESS', 'WAITING_STOCK', 'WAITING_FOR_PARTS')
          AND NOT EXISTS (
            SELECT 1 FROM "Task_Assignments" ta
            WHERE ta.task_id = t.id AND ta.status IN ('ASSIGNED', 'IN_PROGRESS')
          )
      )::int AS unassigned
    FROM "Tasks" t
  `, { type: db.Sequelize.QueryTypes.SELECT });

  const technicianWorkload = await db.sequelize.query(`
    SELECT
      u.id AS "technicianId",
      COALESCE(NULLIF(u."fullName", ''), u.email, 'Kỹ thuật viên') AS name,
      COUNT(ta.id)::int AS "activeTasks"
    FROM "Users" u
    LEFT JOIN "Task_Assignments" ta ON ta.technician_id = u.id AND ta.status IN ('ASSIGNED', 'IN_PROGRESS')
    WHERE u."roleId" = 4
    GROUP BY u.id, u."fullName", u.email
    ORDER BY "activeTasks" DESC, name ASC
  `, { type: db.Sequelize.QueryTypes.SELECT });
  const totalActiveAssignments = technicianWorkload.reduce((sum, row) => sum + Number(row.activeTasks || 0), 0);
  const averageActiveTasks = technicianWorkload.length > 0 ? totalActiveAssignments / technicianWorkload.length : 0;

  // start is 00:00 and end is 23:59:59; rounding their distance gives the
  // correct inclusive calendar-day count (14/07 -> 12/08 = 30 days).
  const consumptionDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
  const inventoryForecast = await db.sequelize.query(`
    SELECT
      sp.id AS "partId", sp.name, sp.stock_quantity AS stock, sp.min_threshold AS "minimumStock",
      COALESCE(SUM(il.quantity), 0)::numeric AS "consumedQuantity"
    FROM "Spare_Parts" sp
    LEFT JOIN "Inventory_Logs" il ON il.part_id = sp.id AND il.type = 'OUT' AND il."createdAt" BETWEEN :start AND :end
    GROUP BY sp.id, sp.name, sp.stock_quantity, sp.min_threshold
    HAVING COALESCE(SUM(il.quantity), 0) > 0 OR sp.stock_quantity <= sp.min_threshold
    ORDER BY "consumedQuantity" DESC, sp.stock_quantity ASC
    LIMIT 10
  `, { replacements: { start, end }, type: db.Sequelize.QueryTypes.SELECT });

  const paidServiceOrders = await db.sequelize.query(`
    SELECT
      so.id AS "orderId",
      bp.paid_at AS "paidAt",
      bp.amount AS "paidAmount",
      COALESCE(SUM(qd.amount) FILTER (WHERE qd.service_id IS NOT NULL AND qd.spare_part_id IS NULL AND qd.status <> 'CANCELLED'), 0) AS "laborAmount",
      COALESCE(SUM(qd.amount) FILTER (WHERE qd.spare_part_id IS NOT NULL AND qd.status <> 'CANCELLED'), 0) AS "partsAmount"
    FROM "Booking_Payments" bp
    INNER JOIN "Service_Orders" so ON so.id = bp.order_id
    LEFT JOIN "Tasks" t ON t.service_order_id = so.id
    LEFT JOIN "Quotations" q ON q.task_id = t.id AND q.status = 'APPROVED'
    LEFT JOIN "Quotation_Details" qd ON qd.quotation_id = q.id
    WHERE bp.payment_status = 'PAID' AND bp.paid_at BETWEEN :start AND :end
    GROUP BY so.id, bp.id, bp.paid_at, bp.amount
    ORDER BY bp.paid_at DESC
  `, { replacements: { start, end }, type: db.Sequelize.QueryTypes.SELECT });

  // Existing schema does not link an OUT log to a specific inventory batch. Use
  // the weighted-average purchase cost recorded for that part and expose the
  // coverage ratio so the UI never presents this as exact FIFO/LIFO costing.
  const [partsCostRow] = await db.sequelize.query(`
    WITH paid_orders AS (
      SELECT order_id
      FROM "Booking_Payments"
      WHERE payment_status = 'PAID' AND paid_at BETWEEN :start AND :end
    ), average_cost AS (
      SELECT
        il.part_id,
        SUM(ib.unit_cost * il.quantity) / NULLIF(SUM(il.quantity), 0) AS unit_cost
      FROM "Inventory_Batches" ib
      INNER JOIN "Inventory_Logs" il ON il.id = ib.inventory_log_id AND il.type = 'IN'
      GROUP BY il.part_id
    ), parts_out AS (
      SELECT il.service_order_id, il.part_id, SUM(il.quantity)::numeric AS quantity
      FROM "Inventory_Logs" il
      INNER JOIN paid_orders po ON po.order_id = il.service_order_id
      WHERE il.type = 'OUT'
      GROUP BY il.service_order_id, il.part_id
    )
    SELECT
      COALESCE(SUM(po.quantity * ac.unit_cost), 0) AS parts_cost,
      COALESCE(SUM(po.quantity), 0) AS total_quantity,
      COALESCE(SUM(po.quantity) FILTER (WHERE ac.unit_cost IS NOT NULL), 0) AS costed_quantity
    FROM parts_out po
    LEFT JOIN average_cost ac ON ac.part_id = po.part_id
  `, { replacements: { start, end }, type: db.Sequelize.QueryTypes.SELECT });

  const partsCost = Number(partsCostRow?.parts_cost || 0);
  const totalPartsOut = Number(partsCostRow?.total_quantity || 0);
  const costedPartsOut = Number(partsCostRow?.costed_quantity || 0);
  const costCoveragePct = totalPartsOut > 0
    ? Number(((costedPartsOut / totalPartsOut) * 100).toFixed(1))
    : 0;
  const contributionAfterPartsCost = totalRevenue - partsCost;

  // Active Customers: Unique customer_id from Vehicles of Completed Service Orders in time range
  const activeCustomerRows = await db.Service_Orders.findAll({
    attributes: ['vehicle_id'],
    where: {
      status: { [Op.in]: ['COMPLETED', 'DELIVERED'] },
      actual_finish_time: {
        [Op.between]: [start, end]
      }
    },
    include: [{
      model: db.Vehicles,
      as: 'vehicle',
      attributes: ['customer_id']
    }],
    raw: true
  });

  const customerIds = [...new Set(activeCustomerRows.map(row => row['vehicle.customer_id']).filter(Boolean))];
  const activeCustomersCount = customerIds.length;

  // Completed Appointments in time range
  const completedAppointmentsCount = await db.Appointments.count({
    where: {
      status: 'COMPLETED',
      updatedAt: {
        [Op.between]: [start, end]
      }
    }
  });

  // Customers Breakdown (New vs Returning)
  // New customers: Customers created within the range
  const newCustomersCount = await db.Customers.count({
    where: {
      createdAt: {
        [Op.between]: [start, end]
      }
    }
  });

  // Returning customers: Total unique customers in timeframe minus new ones, or count customers with order who existed before
  const totalUniqueCustomersThisPeriod = customerIds.length;
  const returningCustomersCount = Math.max(0, totalUniqueCustomersThisPeriod - newCustomersCount);

  // Appointment Status Breakdown
  const apptStatusBreakdown = {
    completed: completedAppointmentsCount,
    pending: await db.Appointments.count({
      where: {
        status: { [Op.in]: ['CONFIRMED', 'PENDING', 'ASSIGNED', 'IN_PROGRESS'] },
        scheduled_time: {
          [Op.between]: [start, end]
        }
      }
    }),
    cancelled: await db.Appointments.count({
      where: {
        status: 'CANCELLED',
        updatedAt: {
          [Op.between]: [start, end]
        }
      }
    })
  };

  // Top Services (Hiệu suất dịch vụ chuẩn)
  // Group by service_id from Quotation_Details linked to APPROVED Quotations in range
  const serviceStatsRows = await db.Quotation_Details.findAll({
    attributes: [
      'service_id',
      [db.sequelize.fn('COUNT', db.sequelize.col('Quotation_Details.id')), 'bookingCount'],
      [db.sequelize.fn('SUM', db.sequelize.col('Quotation_Details.amount')), 'revenue']
    ],
    where: {
      // Chỉ dòng dịch vụ (service_id) mới hợp lệ ở đây — status EXPORTED/RECEIVED là vòng đời
      // xuất kho chỉ áp dụng cho dòng phụ tùng (spare_part_id), dịch vụ (công lao động) không
      // "xuất kho" nên never đạt các status đó. Dựa vào Quotation.status = APPROVED là đủ.
      service_id: { [Op.ne]: null }
    },
    include: [
      {
        model: db.Quotations,
        as: 'quotation',
        attributes: [],
        where: {
          status: 'APPROVED',
          approved_at: {
            [Op.between]: [start, end]
          }
        }
      },
      {
        model: db.Service_Catalog,
        as: 'service_catalog',
        attributes: ['service_name', 'estimated_duration'],
        include: [{
          model: db.Service_Categories,
          as: 'category',
          attributes: ['category_name']
        }]
      }
    ],
    group: [
      'Quotation_Details.service_id',
      'service_catalog.id',
      'service_catalog.service_name',
      'service_catalog.estimated_duration',
      'service_catalog->category.id',
      'service_catalog->category.category_name'
    ],
    order: [[db.sequelize.literal('count(distinct "Quotation_Details"."id")'), 'DESC']],
    limit: 5,
    raw: true
  });

  const topServices = serviceStatsRows.map(row => ({
    name: row['service_catalog.service_name'] || 'Dịch vụ khác',
    category: row['service_catalog.category.category_name'] || 'Chưa phân loại',
    bookingCount: parseInt(row.bookingCount, 10),
    revenue: parseFloat(row.revenue || 0),
    durationAvg: parseInt(row['service_catalog.estimated_duration'] || 30, 10)
  }));

  // Customers with the most paid service orders in the selected period.
  // Revenue is based on the amount actually paid, not quotation estimates.
  const topCustomerRows = await db.sequelize.query(`
    SELECT
      c.id AS "customerId",
      COALESCE(NULLIF(u."fullName", ''), NULLIF(c.name, ''), 'Khách hàng') AS name,
      COALESCE(NULLIF(c.phone, ''), u."phoneNumber", '') AS phone,
      COUNT(DISTINCT so.id) AS "serviceCount",
      COALESCE(SUM(bp.amount), 0) AS "totalPaid"
    FROM "Service_Orders" so
    INNER JOIN "Vehicles" v ON v.id = so.vehicle_id
    INNER JOIN "Customers" c ON c.id = v.customer_id
    LEFT JOIN "Users" u ON u.id = c.user_id
    INNER JOIN "Booking_Payments" bp ON bp.order_id = so.id
    WHERE bp.payment_status = 'PAID'
      AND bp.paid_at BETWEEN :start AND :end
      AND so.status IN ('COMPLETED', 'DELIVERED')
    GROUP BY c.id, u.id, u."fullName", u."phoneNumber", c.name, c.phone
    ORDER BY "serviceCount" DESC, "totalPaid" DESC
    LIMIT 5
  `, {
    replacements: { start, end },
    type: db.Sequelize.QueryTypes.SELECT
  });

  const topCustomers = topCustomerRows.map(row => ({
    customerId: row.customerId,
    name: row.name,
    phone: row.phone,
    serviceCount: parseInt(row.serviceCount, 10),
    totalPaid: parseFloat(row.totalPaid || 0)
  }));

  return {
    revenueChart: chartData,
    kpis: {
      totalRevenue,
      totalProfit,
      totalOrders,
      avgRevenuePerOrder: avgRevPerOrder,
      activeCustomers: activeCustomersCount,
      completedAppointments: completedAppointmentsCount
    },
    businessOverview: {
      period: { startDate: getVietnamDateKey(start), endDate: getVietnamDateKey(end) },
      previousPeriod: { startDate: getVietnamDateKey(previousStart), endDate: getVietnamDateKey(previousEnd) },
      comparisons: {
        revenue: { current: totalRevenue, previous: previousRevenue, changePct: percentageChange(totalRevenue, previousRevenue) },
        paidOrders: { current: totalOrders, previous: previousOrders, changePct: percentageChange(totalOrders, previousOrders) },
        averagePaidPerOrder: { current: avgRevPerOrder, previous: previousAvgRevPerOrder, changePct: percentageChange(avgRevPerOrder, previousAvgRevPerOrder) }
      },
      workflow: {
        received: Number(workflowRow?.received || 0),
        repairing: Number(workflowRow?.repairing || 0),
        completed: Number(workflowRow?.completed || 0),
        note: 'Đếm toàn bộ phiếu sửa chữa theo trạng thái hiện tại; không phụ thuộc bộ lọc ngày của doanh thu'
      },
      paymentStatuses: paymentStatusRows.map(row => ({
        status: row.payment_status || 'PENDING',
        count: Number(row.count || 0)
      })),
      operationalRisks: {
        tasks: {
          pending: Number(taskSummary?.pending || 0),
          inProgress: Number(taskSummary?.in_progress || 0),
          waitingParts: Number(taskSummary?.waiting_parts || 0),
          unassigned: Number(taskSummary?.unassigned || 0)
        },
        workload: {
          teamAverage: Number(averageActiveTasks.toFixed(1)),
          technicians: technicianWorkload.map(row => ({
            technicianId: Number(row.technicianId), name: row.name,
            activeTasks: Number(row.activeTasks || 0),
            aboveTeamAverage: Number(row.activeTasks || 0) > averageActiveTasks && Number(row.activeTasks || 0) >= 2
          }))
        },
        inventoryForecast: inventoryForecast.map(row => {
          const consumed = Number(row.consumedQuantity || 0);
          const stock = Number(row.stock || 0);
          const dailyUsage = consumed / consumptionDays;
          const projected30Days = Math.ceil(dailyUsage * 30);
          return {
            partId: Number(row.partId), name: row.name, stock,
            minimumStock: Number(row.minimumStock || 0), consumedQuantity: consumed,
            analysisDays: consumptionDays,
            dailyUsage: Number(dailyUsage.toFixed(2)), projected30Days,
            requiredWithSafetyStock: projected30Days + Number(row.minimumStock || 0),
            projectedShortage: Math.max(0, projected30Days + Number(row.minimumStock || 0) - stock),
            coverageDays: dailyUsage > 0 ? Number((stock / dailyUsage).toFixed(1)) : null
          };
        })
      },
      revenueSources: {
        serviceRevenue: allocatedServiceRevenue,
        partsRevenue: allocatedPartsRevenue,
        unallocatedRevenue,
        totalPaidRevenue: totalRevenue,
        method: 'Phân bổ tiền đã thanh toán theo tỷ trọng từng dòng trong báo giá được duyệt'
      },
      paidServiceOrders: paidServiceOrders.map(row => ({
        orderId: Number(row.orderId),
        paidAt: row.paidAt,
        paidAmount: Number(row.paidAmount || 0),
        laborAmount: Number(row.laborAmount || 0),
        partsAmount: Number(row.partsAmount || 0)
      })),
      inventory: {
        importValue: inventoryImportValue,
        importLineCount: importLogs.length,
        note: 'Giá trị hàng nhập kho, không đồng nghĩa tiền đã trả nhà cung cấp và không phải giá vốn hàng đã bán'
      },
      profitability: {
        partsCost,
        contributionAfterPartsCost,
        costCoveragePct,
        totalPartsOut,
        costedPartsOut,
        costingMethod: 'Giá nhập bình quân gia quyền từ các lô nhập hiện có của từng phụ tùng',
        grossProfit: null,
        netProfit: null,
        status: 'PARTIAL_COST_DATA',
        missingData: ['Liên kết lần xuất với lô nhập cụ thể', 'Lương nhân viên', 'Thuê mặt bằng', 'Điện nước', 'Marketing và chi phí vận hành khác']
      },
      topPaidServices: topPaidServices.map(row => ({
        ...row,
        orderCount: Number(row.orderCount || 0),
        quantity: Number(row.quantity || 0),
        revenue: Number(row.revenue || 0),
        durationAvg: Math.round(Number(row.durationAvg || 0))
      })),
      topPaidParts: topPaidParts.map(row => ({
        ...row,
        quantity: Number(row.quantity || 0),
        orderCount: Number(row.orderCount || 0),
        revenue: Number(row.revenue || 0),
        averageInputPrice: Number(row.averageInputPrice || 0),
        averageOutputPrice: Number(row.quantity || 0) > 0 ? Number(row.revenue || 0) / Number(row.quantity) : 0,
        cost: Number(row.cost || 0),
        marginAfterPartCost: Number(row.revenue || 0) - Number(row.cost || 0)
      }))
    },
    customersBreakdown: {
      newCustomers: newCustomersCount,
      returningCustomers: returningCustomersCount
    },
    appointmentsBreakdown: apptStatusBreakdown,
    topServices,
    topCustomers
  };
};

module.exports.getAdvancedAnalysisStats = async ({ generateAi, timeframe = 'custom', startDate, endDate, planHorizon = '1_month' } = {}) => {
  try {
    const pythonServiceUrl = process.env.PYTHON_MICROSERVICE_URL || 'http://127.0.0.1:5000';
    console.log("bắt đầu phân tích ");

    // Node.js is the only service allowed to read the application database.
    // Python receives plain JSON and performs analytics without DB credentials.
    if (!startDate || !endDate) {
      throw new Error('Phân tích chuyên sâu yêu cầu đầy đủ startDate và endDate');
    }

    const selectedStart = new Date(`${startDate}T00:00:00+07:00`);
    const selectedEnd = new Date(`${endDate}T23:59:59.999+07:00`);
    if (Number.isNaN(selectedStart.getTime()) || Number.isNaN(selectedEnd.getTime()) || selectedStart > selectedEnd) {
      throw new Error('Khoảng ngày phân tích không hợp lệ');
    }

    const dayMs = 24 * 60 * 60 * 1000;
    const periodDays = Math.floor((selectedEnd - selectedStart) / dayMs) + 1;
    let previousEnd = new Date(selectedStart.getTime() - 1);
    let previousStart = new Date(previousEnd.getTime() - (periodDays * dayMs) + 1);
    const [selectedYearNumber, selectedMonthNumber, selectedDayNumber] = startDate.split('-').map(Number);
    const [endYearNumber, endMonthNumber, endDayNumber] = endDate.split('-').map(Number);
    const selectedMonthLastDay = new Date(selectedYearNumber, selectedMonthNumber, 0).getDate();
    const isFullCalendarMonth = selectedDayNumber === 1
      && selectedYearNumber === endYearNumber
      && selectedMonthNumber === endMonthNumber
      && endDayNumber === selectedMonthLastDay;
    const isMonthToDate = selectedDayNumber === 1
      && selectedYearNumber === endYearNumber
      && selectedMonthNumber === endMonthNumber
      && endDayNumber < selectedMonthLastDay;
    if (isFullCalendarMonth || isMonthToDate) {
      const previousMonthDate = new Date(selectedYearNumber, selectedMonthNumber - 2, 1);
      const previousYearNumber = previousMonthDate.getFullYear();
      const previousMonthNumber = previousMonthDate.getMonth() + 1;
      const previousMonthLastDay = new Date(previousYearNumber, previousMonthNumber, 0).getDate();
      const previousMonthText = String(previousMonthNumber).padStart(2, '0');
      const previousEndDay = isFullCalendarMonth
        ? previousMonthLastDay
        : Math.min(endDayNumber, previousMonthLastDay);
      previousStart = new Date(`${previousYearNumber}-${previousMonthText}-01T00:00:00+07:00`);
      previousEnd = new Date(`${previousYearNumber}-${previousMonthText}-${String(previousEndDay).padStart(2, '0')}T23:59:59.999+07:00`);
    }
    const samePeriodLastYearStart = new Date(selectedStart);
    const samePeriodLastYearEnd = new Date(selectedEnd);
    samePeriodLastYearStart.setFullYear(samePeriodLastYearStart.getFullYear() - 1);
    samePeriodLastYearEnd.setFullYear(samePeriodLastYearEnd.getFullYear() - 1);

    const periods = {
      selected: { startDate, endDate },
      previous: {
        startDate: getVietnamDateKey(previousStart),
        endDate: getVietnamDateKey(previousEnd)
      },
      samePeriodLastYear: {
        startDate: getVietnamDateKey(samePeriodLastYearStart),
        endDate: getVietnamDateKey(samePeriodLastYearEnd)
      }
    };

    const [dashboardStats, previousDashboardStats, lastYearDashboardStats] = await Promise.all([
      module.exports.getAdminDashboardStats({ timeframe: 'custom', ...periods.selected }),
      module.exports.getAdminDashboardStats({ timeframe: 'custom', ...periods.previous }),
      module.exports.getAdminDashboardStats({ timeframe: 'custom', ...periods.samePeriodLastYear })
    ]);

    // Keep one complete prior year for seasonality, plus the selected/current period.
    const comparisonYear = samePeriodLastYearStart.getFullYear();
    const historyStart = new Date(`${comparisonYear}-01-01T00:00:00+07:00`);
    const lastComparisonYearEnd = new Date(`${comparisonYear}-12-31T23:59:59.999+07:00`);
    const historyEnd = selectedEnd > lastComparisonYearEnd ? selectedEnd : lastComparisonYearEnd;

    const payments = await db.Booking_Payments.findAll({
      where: {
        payment_status: 'PAID',
        paid_at: { [Op.between]: [historyStart, historyEnd] }
      },
      raw: true
    });
    const orderIds = [...new Set(payments.map(payment => payment.order_id).filter(Boolean))];
    const orders = orderIds.length
      ? await db.Service_Orders.findAll({ where: { id: { [Op.in]: orderIds } }, raw: true })
      : [];
    const tasks = orderIds.length
      ? await db.Task.findAll({ where: { service_order_id: { [Op.in]: orderIds } }, raw: true })
      : [];
    const taskIds = tasks.map(task => task.id);
    const quotations = taskIds.length
      ? await db.Quotations.findAll({ where: { task_id: { [Op.in]: taskIds } }, raw: true })
      : [];
    const quotationIds = quotations.map(quotation => quotation.id);
    const [quotationDetails, parts, services] = await Promise.all([
      quotationIds.length
        ? db.Quotation_Details.findAll({ where: { quotation_id: { [Op.in]: quotationIds } }, raw: true })
        : Promise.resolve([]),
      db.Spare_Parts.findAll({ raw: true }),
      db.Service_Catalog.findAll({ raw: true })
    ]);

    const response = await fetch(`${pythonServiceUrl}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filters: { timeframe: 'custom', startDate, endDate },
        periods,
        dashboardStats,
        comparisonStats: {
          previousPeriod: previousDashboardStats,
          samePeriodLastYear: lastYearDashboardStats
        },
        tables: {
          Booking_Payments: payments,
          Service_Orders: orders,
          Tasks: tasks,
          Quotations: quotations,
          Quotation_Details: quotationDetails,
          Spare_Parts: parts,
          Service_Catalogs: services
        }
      })
    });
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Python Microservice returned status ${response.status}: ${errorBody}`);
    }
    const data = await response.json();
    if (data && data.success) {
      const reportData = data.data;

      // Chỉ gọi Gemini API khi người dùng yêu cầu phân tích kế hoạch (generateAi = true)
      if (generateAi) {
        const geminiKey = process.env.GEMINI_API_KEY_STATIC;
        if (geminiKey) {
          try {
            console.log("Đang gửi yêu cầu phân tích tới Gemini API từ Node.js...");
            const summary = reportData.summary || {};
            const normalizedPlanHorizon = planHorizon === '3_months' ? '3_months' : '1_month';
            const planHorizonLabel = normalizedPlanHorizon === '3_months' ? '3 tháng tới' : '1 tháng tới';
            const filteredKpis = reportData.dashboard_stats?.kpis || {};
            const previousKpis = reportData.comparison_stats?.previousPeriod?.kpis || {};
            const lastYearKpis = reportData.comparison_stats?.samePeriodLastYear?.kpis || {};
            const appliedFilters = reportData.filters || {};
            const growingSvcs = (reportData.yoy_service_drivers?.growing || []).map(s => `- ${s.service_name}: Khoảng đang xem đạt ${(s.this_year_rev / 1e6).toFixed(1)} Tr.đ (tăng ${(s.growth_amount / 1e6).toFixed(1)} Tr.đ so với cùng khoảng thời gian năm trước)`).join('\n');
            const decliningSvcs = (reportData.yoy_service_drivers?.declining || []).map(s => `- ${s.service_name}: Khoảng đang xem đạt ${(s.this_year_rev / 1e6).toFixed(1)} Tr.đ (giảm ${Math.abs(s.growth_amount / 1e6).toFixed(1)} Tr.đ so với cùng khoảng thời gian năm trước)`).join('\n');
            const growingParts = (reportData.yoy_part_drivers?.growing || []).map(p => `- ${p.name}: Tiêu thụ ${p.this_year_qty} cái (tăng +${p.growth_qty} cái vs năm ngoái)`).join('\n');
            const decliningParts = (reportData.yoy_part_drivers?.declining || []).map(p => `- ${p.name}: Tiêu thụ ${p.this_year_qty} cái (giảm ${p.growth_qty} cái vs năm ngoái)`).join('\n');
            const lowSvcs = (reportData.ai_planner?.low_demand_plans || []).map(p => `- ${p.service_name}: Cả năm ngoái làm ${p.annual_count} lượt (chiếm tỷ trọng ${p.share_pct}%)`).join('\n');
            const combos = (reportData.ai_planner?.top_combos || []).map(c => `- ${c.combo_name}: ${c.service_name} + ${c.part_name} (Có ${c.co_occurrence} lượt xe làm chung năm ngoái)`).join('\n');
            const operationalRisks = dashboardStats.businessOverview?.operationalRisks || {};
            const taskRisks = operationalRisks.tasks || {};
            const workloadEvidence = (operationalRisks.workload?.technicians || []).map(tech =>
              `- ${tech.name}: ${tech.activeTasks} công việc đang hoạt động${tech.aboveTeamAverage ? `, cao hơn trung bình đội ${operationalRisks.workload.teamAverage}` : ''}`
            ).join('\n');
            const inventoryEvidence = (operationalRisks.inventoryForecast || []).filter(part => part.consumedQuantity > 0).map(part =>
              `- ${part.name}: đã xuất ${part.consumedQuantity} trong ${part.analysisDays} ngày; tồn ${part.stock}; tồn tối thiểu ${part.minimumStock}; nhu cầu 30 ngày ${part.projected30Days}; cần có cả tồn an toàn ${part.requiredWithSafetyStock}; ${part.projectedShortage > 0 ? `thiếu dự kiến ${part.projectedShortage}` : `không thiếu, đủ khoảng ${part.coverageDays} ngày`}`
            ).join('\n');

            // Weather is supporting context only. It must never be presented as a proven
            // cause of historical revenue changes.
            let weatherContext = 'Không lấy được dự báo thời tiết; không sử dụng thời tiết trong khuyến nghị.';
            try {
              const weatherUrl = 'https://api.open-meteo.com/v1/forecast?latitude=16.0544&longitude=108.2022&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=Asia%2FHo_Chi_Minh&forecast_days=14';
              const weatherResponse = await fetch(weatherUrl);
              if (weatherResponse.ok) {
                const weather = await weatherResponse.json();
                const daily = weather.daily || {};
                const dates = daily.time || [];
                const maxTemperatures = daily.temperature_2m_max || [];
                const minTemperatures = daily.temperature_2m_min || [];
                const precipitation = daily.precipitation_sum || [];
                const rainProbabilities = daily.precipitation_probability_max || [];
                const rainyDays = dates.filter((_, index) => Number(precipitation[index] || 0) >= 1 || Number(rainProbabilities[index] || 0) >= 50).length;
                const totalRain = precipitation.reduce((sum, value) => sum + Number(value || 0), 0);
                const highestTemperature = maxTemperatures.length ? Math.max(...maxTemperatures.map(Number)) : null;
                const lowestTemperature = minTemperatures.length ? Math.min(...minTemperatures.map(Number)) : null;
                weatherContext = [
                  `Dự báo Đà Nẵng từ ${dates[0] || 'không xác định'} đến ${dates[dates.length - 1] || 'không xác định'}`,
                  `${rainyDays}/${dates.length || 14} ngày có mưa hoặc xác suất mưa từ 50%`,
                  `tổng lượng mưa dự báo ${totalRain.toFixed(1)} mm`,
                  highestTemperature === null ? null : `nhiệt độ cao nhất ${highestTemperature.toFixed(1)}°C`,
                  lowestTemperature === null ? null : `thấp nhất ${lowestTemperature.toFixed(1)}°C`,
                ].filter(Boolean).join('; ');
                reportData.weather_context = {
                  location: 'Đà Nẵng',
                  startDate: dates[0] || null,
                  endDate: dates[dates.length - 1] || null,
                  rainyDays,
                  totalDays: dates.length,
                  totalRainMm: Number(totalRain.toFixed(1)),
                  maxTemperatureC: highestTemperature,
                  minTemperatureC: lowestTemperature,
                  source: 'Open-Meteo',
                };
              }
            } catch (weatherError) {
              console.warn('Không lấy được dự báo thời tiết Đà Nẵng:', weatherError.message);
            }

            const prompt = `
Bạn là quản lý vận hành Gara ô tô. Hãy lập kế hoạch xử lý trực tiếp các vấn đề hệ thống vừa phát hiện cho ${planHorizonLabel}. Không tự tạo số liệu, không đưa lời khuyên chung chung và không đề xuất việc không có căn cứ bên dưới.

DỮ LIỆU HOẠT ĐỘNG:
- Khoảng ngày đang xem: ${appliedFilters.startDate || 'không xác định'} đến ${appliedFilters.endDate || 'không xác định'}
- Doanh thu trong khoảng đang xem: ${Number(filteredKpis.totalRevenue || 0).toLocaleString('vi-VN')} đ
- Số lượt dịch vụ trong khoảng đang xem: ${Number(filteredKpis.totalOrders || 0).toLocaleString('vi-VN')} lượt
- Hóa đơn trung bình trong khoảng đang xem: ${Number(filteredKpis.avgRevenuePerOrder || 0).toLocaleString('vi-VN')} đ
- Khách hàng hoạt động trong khoảng đang xem: ${Number(filteredKpis.activeCustomers || 0).toLocaleString('vi-VN')} khách
- Khoảng thời gian dài tương đương ngay trước đó: ${Number(previousKpis.totalRevenue || 0).toLocaleString('vi-VN')} đ / ${Number(previousKpis.totalOrders || 0)} lượt
- Cùng khoảng ngày của năm trước: ${Number(lastYearKpis.totalRevenue || 0).toLocaleString('vi-VN')} đ / ${Number(lastYearKpis.totalOrders || 0)} lượt
- Tăng trưởng so với khoảng trước đó: ${summary.previous_period_growth_pct}%
- Tăng trưởng so với cùng khoảng thời gian năm trước: ${summary.yoy_growth_pct}%
- Doanh thu thay đổi do số lượng đơn: ${summary.volume_effect?.toLocaleString('vi-VN')} đ
- Doanh thu thay đổi do giá trị trung bình mỗi đơn: ${summary.ticket_effect?.toLocaleString('vi-VN')} đ

DỊCH VỤ SỬA CHỮA TĂNG TRƯỞNG MẠNH NHẤT:
${growingSvcs || "Chưa ghi nhận dịch vụ tăng trưởng đáng kể."}

DỊCH VỤ SỬA CHỮA BÌ SỤT GIẢM MẠNH NHẤT:
${decliningSvcs || "Không có dịch vụ nào sụt giảm nhiều."}

LINH KIỆN TIÊU THỤ TĂNG CAO NHẤT:
${growingParts || "Chưa ghi nhận linh kiện tăng mạnh."}

LINH KIỆN TIÊU THỤ GIẢM SÚT NHẤT:
${decliningParts || "Không có linh kiện nào giảm nhiều."}

DỊCH VỤ ÍT KHÁCH LÀM NHẤT (CẦN GIẢI CỨU):
${lowSvcs}

CÁC GÓI DỊCH VỤ THƯỜNG XUYÊN ĐƯỢC THANH TOÁN CÙNG NHAU:
${combos}

VẤN ĐỀ CÔNG VIỆC ĐÃ PHÁT HIỆN:
- ${Number(taskRisks.pending || 0)} công việc đang chờ thực hiện
- ${Number(taskRisks.inProgress || 0)} công việc đang thực hiện
- ${Number(taskRisks.waitingParts || 0)} công việc chờ linh kiện
- ${Number(taskRisks.unassigned || 0)} công việc chưa phân công

PHÂN BỔ CÔNG VIỆC THEO KỸ THUẬT VIÊN:
${workloadEvidence || '- Chưa có dữ liệu phân công'}

TỐC ĐỘ TIÊU THỤ VÀ SỨC ĐỦ TỒN KHO:
${inventoryEvidence || '- Chưa có dữ liệu xuất kho để dự báo'}

DỰ BÁO THỜI TIẾT ĐÀ NẴNG 14 NGÀY TỚI:
${weatherContext}

QUY TẮC BẮT BUỘC:
- Ưu tiên 1: công việc chưa phân công, công việc chờ linh kiện và mất cân bằng kỹ thuật viên nếu các số này lớn hơn 0.
- Ưu tiên 2: phụ tùng có số lượng thiếu dự kiến lớn hơn 0. Số đề xuất nhập không được thấp hơn lượng thiếu dự kiến; phải nói rõ đây là mức đề xuất từ tốc độ sử dụng, cần xác nhận đơn đang chờ và đơn đặt nhà cung cấp trước khi nhập.
- Ưu tiên 3: dịch vụ tăng/giảm chỉ sau khi đã xử lý hai nhóm trên.
- Không đề xuất tiếp thị, gói dịch vụ, tuyển thêm người hoặc khuyến mãi nếu dữ liệu trên không chứng minh nhu cầu.
- Không dùng thời tiết trong kế hoạch trừ khi nó trực tiếp hỗ trợ một dịch vụ/phụ tùng đã có xu hướng trong dữ liệu; nếu dùng phải ghi là ngữ cảnh tham khảo, không phải nguyên nhân.
- Mỗi hành động phải chứa ít nhất một số liệu đúng từ dữ liệu đầu vào. Không dùng các câu “tối ưu”, “nâng cao”, “tăng cường”, “duy trì” nếu không nói thao tác cụ thể.

Trả về JSON đúng schema được yêu cầu, không Markdown, không chào hỏi.
Toàn bộ giá trị văn bản phải viết bằng tiếng Việt dễ hiểu. Không dùng từ “khẩn cấp”. Tuyệt đối không dùng các thuật ngữ Volume Effect, Ticket Effect, task, workload, projectedShortage, KPI, marketing hoặc các từ tiếng Anh tương tự; hãy diễn đạt bằng tiếng Việt theo tên gọi trong dữ liệu phía trên.
- executive_summary: tối đa 3 kết luận, xếp theo mức độ cần xử lý; mỗi kết luận phải có số liệu.
- assessment: nhận định ngắn về tín hiệu doanh thu, vấn đề ảnh hưởng chính và giới hạn dữ liệu. Nếu thiếu dữ liệu đối chiếu thì phải nói rõ giới hạn, không được kết luận chắc chắn.
- actions: 3–5 hành động, thứ tự ưu tiên không trùng nhau. Phần căn cứ phải trích đúng số liệu đầu vào; phần thực hiện phải là thao tác cụ thể; người phụ trách phải là vai trò có trong gara; chỉ số kiểm tra phải đo được từ dữ liệu hệ thống.
- adjustment_conditions: tối đa 3 điều kiện định lượng buộc phải điều chỉnh kế hoạch.
`;

            const responseSchema = {
              type: 'OBJECT',
              required: ['executive_summary', 'assessment', 'actions', 'adjustment_conditions'],
              properties: {
                executive_summary: { type: 'ARRAY', minItems: 1, maxItems: 3, items: { type: 'STRING' } },
                assessment: {
                  type: 'OBJECT',
                  required: ['revenue_signal', 'primary_bottleneck', 'reasoning', 'data_limitations'],
                  properties: {
                    revenue_signal: { type: 'STRING' },
                    primary_bottleneck: { type: 'STRING' },
                    reasoning: { type: 'STRING' },
                    data_limitations: { type: 'ARRAY', maxItems: 3, items: { type: 'STRING' } }
                  }
                },
                actions: {
                  type: 'ARRAY', minItems: 3, maxItems: 5,
                  items: {
                    type: 'OBJECT',
                    required: ['priority', 'title', 'evidence', 'execution', 'owner', 'kpi'],
                    properties: {
                      priority: { type: 'INTEGER' },
                      title: { type: 'STRING' },
                      evidence: { type: 'STRING' },
                      execution: { type: 'STRING' },
                      owner: { type: 'STRING' },
                      kpi: { type: 'STRING' }
                    }
                  }
                },
                adjustment_conditions: { type: 'ARRAY', maxItems: 3, items: { type: 'STRING' } }
              }
            };

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
            const geminiRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                  responseMimeType: 'application/json',
                  responseSchema,
                  temperature: 0.2
                }
              })
            });

            if (geminiRes.ok) {
              const geminiJson = await geminiRes.json();
              const rawPlan = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
              reportData.gemini_plan = JSON.parse(rawPlan);
              reportData.gemini_insights = null;
              reportData.plan_horizon = normalizedPlanHorizon;
              console.log("Gemini phân tích chiến lược thành công!");
            } else {
              const errText = await geminiRes.text();
              console.error("Lỗi khi gọi Gemini API:", errText);
              reportData.gemini_plan = null;
              reportData.gemini_insights = `*(Không thể tải khuyến nghị tự động từ AI: Mã lỗi ${geminiRes.status})*`;
            }
          } catch (geminiError) {
            console.error("Lỗi kết nối Gemini API:", geminiError.message);
            reportData.gemini_plan = null;
            reportData.gemini_insights = `*(Lỗi kết nối API AI: ${geminiError.message})*`;
          }
        } else {
          reportData.gemini_plan = null;
          reportData.gemini_insights = "*(Vui lòng thiết lập GEMINI_API_KEY_STATIC trong file .env để kích hoạt AI)*";
        }
      } else {
        // Trả về null nếu chưa bấm nút Phân tích kế hoạch
        reportData.gemini_plan = null;
        reportData.gemini_insights = null;
      }

      return reportData;
    }
    return null;
  } catch (error) {
    console.error("Python microservice analysis failed:", error.message);
    throw error;
  }
};
