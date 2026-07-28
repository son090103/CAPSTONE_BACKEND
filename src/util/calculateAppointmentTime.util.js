const { Service_Catalog, Service_Combo_Catalogs } = require('../../models');
const { Op } = require('sequelize');

const calculateAppointmentTime = async (details, startTime) => {
  try {
    const start = new Date(startTime);

    if (isNaN(start.getTime())) {
      throw new Error("Invalid start time provided");
    }

    if (!details || details.length === 0) {
      return { totalDurationMinutes: 0, startTime: start, endTime: start };
    }

    const catalogIds = new Set();
    const comboIds = new Set();

    details.forEach(detail => {
      if (detail.catalog_id) catalogIds.add(Number(detail.catalog_id));
      if (detail.combo_id) comboIds.add(Number(detail.combo_id));
    });

    if (comboIds.size > 0) {
      const comboCatalogs = await Service_Combo_Catalogs.findAll({
        where: { combo_id: { [Op.in]: Array.from(comboIds) } },
        attributes: ['catalog_id']
      });

      comboCatalogs.forEach(cc => {
        if (cc.catalog_id) {
          catalogIds.add(Number(cc.catalog_id));
        }
      });
    }

    let totalDurationMinutes = 0;

    if (catalogIds.size > 0) {
      const catalogs = await Service_Catalog.findAll({
        where: { id: { [Op.in]: Array.from(catalogIds) } },
        attributes: ['id', 'estimated_duration']
      });

      catalogs.forEach(catalog => {
        const duration = catalog.estimated_duration ? Number(catalog.estimated_duration) : 30;
        totalDurationMinutes += duration;
      });
    }

    const endTime = new Date(start.getTime() + totalDurationMinutes * 60000);
    return {
      totalDurationMinutes,
      startTime: start,
      endTime
    };
  } catch (error) {
    console.error("Lỗi khi tính toán thời gian lịch hẹn:", error);
    throw error;
  }
};

module.exports = {
  calculateAppointmentTime
};
