const db = require('../models');
const { Op } = require('sequelize');

async function check() {
  const startAppDate = new Date();
  const endAppDate = new Date();
  endAppDate.setDate(startAppDate.getDate() + 7);

  const upcomingAppointments = await db.Appointments.findAll({
      where: {
          scheduled_time: { [Op.between]: [startAppDate, endAppDate] },
          status: 'CONFIRMED'
      },
      include: [{
          model: db.Appointment_Details,
          as: 'appointmentDetails',
          include: [{
              model: db.Service_Catalog,
              as: 'catalog',
              include: [{
                  model: db.Spare_Parts,
                  as: 'sparePart'
              }]
          }]
      }]
  });

  console.log(`FOUND ${upcomingAppointments.length} UPCOMING APPOINTMENTS:`);
  
  const demandMap = {};
  upcomingAppointments.forEach((app) => {
      console.log(`Appointment ID: ${app.id}, Time: ${app.scheduled_time}`);
      if (app.appointmentDetails) {
          app.appointmentDetails.forEach((detail) => {
              if (detail.catalog) {
                  console.log(`  Catalog ID: ${detail.catalog.id}, Name: ${detail.catalog.service_name}, Part: ${detail.catalog.sparePart ? detail.catalog.sparePart.name : 'None'}`);
                  if (detail.catalog.sparePart) {
                      const part = detail.catalog.sparePart;
                      if (!demandMap[part.id]) {
                          demandMap[part.id] = {
                              id: String(part.id),
                              sku: part.sku,
                              name: part.name,
                              currentStock: part.stock_quantity,
                              minThreshold: part.min_threshold,
                              weeklyForecast: 0,
                              recommendedQty: 0,
                              reason: `🤖 Dự báo AI: Có lịch hẹn bảo dưỡng tuần tới`,
                              supplier: part.brand === 'Toyota' ? 'Toyota Motor VN' : part.brand === 'Honda' ? 'Honda Parts Supplier' : 'Công ty Cổ phần Phụ tùng ô tô Hà Nội'
                          };
                      }
                      demandMap[part.id].weeklyForecast += 1;
                  }
              }
          });
      }
  });

  const upcomingDemand = [];
  Object.values(demandMap).forEach((item) => {
      const projectedStock = item.currentStock - item.weeklyForecast;
      if (item.currentStock <= item.minThreshold || projectedStock <= item.minThreshold) {
          const targetQty = item.minThreshold * 2;
          item.recommendedQty = Math.max(5, targetQty - item.currentStock + item.weeklyForecast);
          upcomingDemand.push(item);
      }
  });

  console.log('COMPUTED UPCOMING DEMAND:', JSON.stringify(upcomingDemand, null, 2));
  process.exit(0);
}

check();
