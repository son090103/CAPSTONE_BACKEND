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
    // 2-hour slots: 08:00, 10:00, 12:00, 14:00, 16:00, 18:00
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
      const key = getVietnamDateKey(d); // YYYY-MM-DD in Vietnam time
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

    // Map keys back to chronological order of days
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

  // Calculate Chart data
  const chartData = getChartData(payments, computedTimeframe, start, end);

  // Calculate KPIs
  const totalRevenue = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
  const totalOrders = payments.length;
  const avgRevPerOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

  // Active Customers: Unique customer_id from Vehicles of Completed Service Orders in time range
  const activeCustomerRows = await db.Service_Orders.findAll({
    attributes: ['vehicle_id'],
    where: {
      status: 'COMPLETED',
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
      totalOrders,
      avgRevenuePerOrder: avgRevPerOrder,
      activeCustomers: activeCustomersCount,
      completedAppointments: completedAppointmentsCount
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

module.exports.getAdvancedAnalysisStats = async ({ generateAi, timeframe = 'custom', startDate, endDate } = {}) => {
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
            const filteredKpis = reportData.dashboard_stats?.kpis || {};
            const previousKpis = reportData.comparison_stats?.previousPeriod?.kpis || {};
            const lastYearKpis = reportData.comparison_stats?.samePeriodLastYear?.kpis || {};
            const appliedFilters = reportData.filters || {};
            const growingSvcs = (reportData.yoy_service_drivers?.growing || []).map(s => `- ${s.service_name}: Kỳ đã chọn đạt ${(s.this_year_rev / 1e6).toFixed(1)} Tr.đ (tăng ${(s.growth_amount / 1e6).toFixed(1)} Tr.đ so với cùng kỳ năm trước)`).join('\n');
            const decliningSvcs = (reportData.yoy_service_drivers?.declining || []).map(s => `- ${s.service_name}: Kỳ đã chọn đạt ${(s.this_year_rev / 1e6).toFixed(1)} Tr.đ (giảm ${Math.abs(s.growth_amount / 1e6).toFixed(1)} Tr.đ so với cùng kỳ năm trước)`).join('\n');
            const growingParts = (reportData.yoy_part_drivers?.growing || []).map(p => `- ${p.name}: Tiêu thụ ${p.this_year_qty} cái (tăng +${p.growth_qty} cái vs năm ngoái)`).join('\n');
            const decliningParts = (reportData.yoy_part_drivers?.declining || []).map(p => `- ${p.name}: Tiêu thụ ${p.this_year_qty} cái (giảm ${p.growth_qty} cái vs năm ngoái)`).join('\n');
            const lowSvcs = (reportData.ai_planner?.low_demand_plans || []).map(p => `- ${p.service_name}: Cả năm ngoái làm ${p.annual_count} lượt (chiếm tỷ trọng ${p.share_pct}%)`).join('\n');
            const combos = (reportData.ai_planner?.top_combos || []).map(c => `- ${c.combo_name}: ${c.service_name} + ${c.part_name} (Có ${c.co_occurrence} lượt xe làm chung năm ngoái)`).join('\n');

            const prompt = `
Bạn là chuyên gia vận hành và tăng trưởng Gara ô tô.
Dựa trên dữ liệu đã được hệ thống tính sẵn dưới đây, hãy chọn lọc một kế hoạch NGẮN, DỄ HIỂU và CÓ THỂ ĐO LƯỜNG. Không tự tạo thêm số liệu.

DỮ LIỆU HOẠT ĐỘNG:
- Kỳ đang được quản trị viên chọn: ${appliedFilters.startDate || 'không xác định'} đến ${appliedFilters.endDate || 'không xác định'}
- Doanh thu trong kỳ đã chọn: ${Number(filteredKpis.totalRevenue || 0).toLocaleString('vi-VN')} đ
- Số lượt dịch vụ trong kỳ đã chọn: ${Number(filteredKpis.totalOrders || 0).toLocaleString('vi-VN')} lượt
- Hóa đơn trung bình trong kỳ đã chọn: ${Number(filteredKpis.avgRevenuePerOrder || 0).toLocaleString('vi-VN')} đ
- Khách hàng hoạt động trong kỳ đã chọn: ${Number(filteredKpis.activeCustomers || 0).toLocaleString('vi-VN')} khách
- Kỳ liền trước: ${Number(previousKpis.totalRevenue || 0).toLocaleString('vi-VN')} đ / ${Number(previousKpis.totalOrders || 0)} lượt
- Cùng kỳ năm trước: ${Number(lastYearKpis.totalRevenue || 0).toLocaleString('vi-VN')} đ / ${Number(lastYearKpis.totalOrders || 0)} lượt
- Tăng trưởng so với kỳ liền trước: ${summary.previous_period_growth_pct}%
- Tăng trưởng so với cùng kỳ năm trước: ${summary.yoy_growth_pct}%
- Đóng góp từ lượng xe (Volume Effect): ${summary.volume_effect?.toLocaleString('vi-VN')} đ
- Đóng góp từ hóa đơn (Ticket Effect): ${summary.ticket_effect?.toLocaleString('vi-VN')} đ

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

CÁC COMBO THƯỜNG XUYÊN ĐƯỢC THANH TOÁN CÙNG NHAU:
${combos}

CHỈ trả về đúng 3 mục Markdown sau:
### 1. Kết luận chính
- Tối đa 2 gạch đầu dòng, nêu biến động quan trọng nhất và số liệu làm căn cứ.
### 2. Ba hành động ưu tiên
- Đúng 3 gạch đầu dòng. Mỗi dòng theo mẫu: **Hành động** — Căn cứ số liệu — KPI cần đạt — Thời hạn.
### 3. Cảnh báo cần theo dõi
- Tối đa 1 gạch đầu dòng về rủi ro lớn nhất.

Tổng cộng không quá 180 từ. Không chào hỏi, không mở bài, không bảng biểu, không khuyến nghị chung chung và không nhắc lại toàn bộ dữ liệu đầu vào.
`;

            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;
            const geminiRes = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
              })
            });

            if (geminiRes.ok) {
              const geminiJson = await geminiRes.json();
              reportData.gemini_insights = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
              console.log("Gemini phân tích chiến lược thành công!");
            } else {
              const errText = await geminiRes.text();
              console.error("Lỗi khi gọi Gemini API:", errText);
              reportData.gemini_insights = `*(Không thể tải khuyến nghị tự động từ AI: Mã lỗi ${geminiRes.status})*`;
            }
          } catch (geminiError) {
            console.error("Lỗi kết nối Gemini API:", geminiError.message);
            reportData.gemini_insights = `*(Lỗi kết nối API AI: ${geminiError.message})*`;
          }
        } else {
          reportData.gemini_insights = "*(Vui lòng thiết lập GEMINI_API_KEY trong file .env để kích hoạt AI)*";
        }
      } else {
        // Trả về null nếu chưa bấm nút Phân tích kế hoạch
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
