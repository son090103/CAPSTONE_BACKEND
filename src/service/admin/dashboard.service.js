const db = require("../../../models");
const { Op, fn, col, literal } = require("sequelize");

const User = db.User;
const Role = db.Role;
const Appointments = db.Appointments;
const Customers = db.Customers;
const Service_Orders = db.Service_Orders;
const Quotations = db.Quotations;
const Quotation_Details = db.Quotation_Details;
const Service_Catalog = db.Service_Catalog;
const Service_Categories = db.Service_Categories;
const Task_Assignment = db.Task_Assignment;
const Task = db.Task;

module.exports.getAdminDashboardSummary = async () => {
  const [customerCount, staffCount, totalAppointments, activeOrders, approvedRevenue, appointmentStatusRaw, recentAppointments, revenueTrend, appointmentTrend, topServices, topTechnicians] = await Promise.all([
    Customers.count(),
    User.count({
      include: [{
        model: Role,
        as: "role",
        where: {
          roleCode: {
            [Op.notIn]: ["CUSTOMER", "ADMIN"],
          },
        },
        attributes: [],
      }],
    }),
    Appointments.count(),
    Service_Orders.count(),
    Quotations.sum("total_amount", {
      where: { status: "APPROVED" },
    }),
    Appointments.findAll({
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true,
    }),
    Appointments.findAll({
      attributes: ["id", "status", "scheduled_time", "createdAt"],
      include: [{
        model: Customers,
        as: "customer",
        attributes: ["id", "name", "phone"],
      }],
      order: [["scheduled_time", "DESC"]],
      limit: 8,
      raw: true,
      nest: true,
    }),
    getRevenueTrend(),
    getAppointmentTrend(),
    getTopServices(),
    getTopTechnicians(),
  ]);

  const appointmentStatus = {
    completed: 0,
    pending: 0,
    cancelled: 0,
  };

  appointmentStatusRaw.forEach((item) => {
    const status = String(item.status || "").toUpperCase();
    if (status === "COMPLETED") appointmentStatus.completed = Number(item.count || 0);
    else if (status === "CANCELLED" || status === "CANCELED") appointmentStatus.cancelled = Number(item.count || 0);
    else appointmentStatus.pending += Number(item.count || 0);
  });

  return {
    summary: {
      totalCustomers: Number(customerCount || 0),
      totalStaff: Number(staffCount || 0),
      totalAppointments: Number(totalAppointments || 0),
      activeOrders: Number(activeOrders || 0),
      totalRevenue: Number(approvedRevenue || 0),
    },
    appointmentStatus,
    revenueTrend,
    appointmentsTrend: appointmentTrend,
    recentActivity: recentAppointments,
    topServices,
    topTechnicians,
  };
};

async function getTopServices() {
  const rows = await Quotation_Details.findAll({
    attributes: [
      [col('service_catalog.service_name'), 'serviceName'],
      [col('service_catalog.category.category_name'), 'category'],
      [fn('COUNT', col('Quotation_Details.id')), 'bookingCount'],
      [fn('SUM', col('Quotation_Details.amount')), 'revenue'],
      [fn('AVG', col('service_catalog.estimated_duration')), 'durationAvg'],
    ],
    include: [
      {
        model: Service_Catalog,
        as: 'service_catalog',
        attributes: [],
        include: [
          {
            model: Service_Categories,
            as: 'category',
            attributes: [],
          },
        ],
      },
    ],
    where: { service_id: { [Op.ne]: null } },
    group: [
      col('service_catalog.id'),
      col('service_catalog.service_name'),
      col('service_catalog.estimated_duration'),
      col('service_catalog.category.category_name'),
    ],
    order: [[fn('COUNT', col('Quotation_Details.id')), 'DESC']],
    limit: 5,
    raw: true,
    nest: true,
  });

  return rows.map((row) => ({
    serviceName: row.serviceName || 'Không xác định',
    category: row.category || 'Khác',
    bookingCount: Number(row.bookingCount || 0),
    revenue: Number(row.revenue || 0),
    durationAvg: Math.round(Number(row.durationAvg || 0)),
  }));
}

async function getTopTechnicians() {
  const rows = await db.sequelize.query(
    `SELECT u."fullName" AS "technicianName",
            ta."technician_id" AS "technicianId",
            COUNT(ta."id") AS "completedTasks",
            COALESCE(SUM(q."total_amount"), 0) AS "revenueContribution"
      FROM "Task_Assignments" ta
      JOIN "Users" u ON u."id" = ta."technician_id"
      LEFT JOIN "Tasks" t ON t."id" = ta."task_id"
      LEFT JOIN "Quotations" q ON q."task_id" = t."id" AND q."status" = 'APPROVED'
      WHERE ta."status" = 'COMPLETED'
      GROUP BY u."fullName", ta."technician_id"
      ORDER BY COUNT(ta."id") DESC
      LIMIT 5;`,
    {
      type: db.sequelize.QueryTypes.SELECT,
    }
  );

  return rows.map((row) => ({
    technicianName: row.technicianName || 'Không xác định',
    completedTasks: Number(row.completedTasks || 0),
    revenueContribution: Number(row.revenueContribution || 0),
  }));
}

async function getRevenueTrend() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  const rows = await Quotations.findAll({
    attributes: [
      [fn('DATE', col('approved_at')), 'date'],
      [fn('SUM', col('total_amount')), 'revenue'],
      [fn('COUNT', col('id')), 'orders'],
    ],
    where: {
      status: 'APPROVED',
      approved_at: { [Op.gte]: startDate },
    },
    group: [fn('DATE', col('approved_at'))],
    raw: true,
    order: [[fn('DATE', col('approved_at')), 'ASC']],
  });

  const map = new Map(rows.map((item) => [item.date, item]));
  const labels = [];
  const revenue = [];
  const orders = [];

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const row = map.get(key);
    labels.push(`${date.getDate()}/${date.getMonth() + 1}`);
    revenue.push(Number(row?.revenue || 0));
    orders.push(Number(row?.orders || 0));
  }

  return { labels, revenue, orders };
}

async function getAppointmentTrend() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 6);
  startDate.setHours(0, 0, 0, 0);

  const rows = await Appointments.findAll({
    attributes: [
      [fn('DATE', col('scheduled_time')), 'date'],
      [fn('COUNT', col('id')), 'count'],
    ],
    where: {
      scheduled_time: { [Op.gte]: startDate },
    },
    group: [fn('DATE', col('scheduled_time'))],
    raw: true,
    order: [[fn('DATE', col('scheduled_time')), 'ASC']],
  });

  const map = new Map(rows.map((item) => [item.date, item]));
  const labels = [];
  const counts = [];

  for (let i = 6; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    const row = map.get(key);
    labels.push(`${date.getDate()}/${date.getMonth() + 1}`);
    counts.push(Number(row?.count || 0));
  }

  return { labels, counts };
}
