const db = require('../../models');
const getGarageCapacity = async () => {
  try {
    const technicianCount = await db.User.count({
      include: [{
        model: db.Role,
        as: 'role',
        where: { roleCode: 'TECHNICIAN' }
      }],
      where: { status: 'ACTIVE' }
    });

    const busyTechnicians = await db.Task_Assignment.count({
      distinct: true,
      col: 'technician_id',
      where: {
        status: {
          [db.Sequelize.Op.in]: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED']
        }
      }
    });

    const idleTechnicians = technicianCount - busyTechnicians;
    const availableCapacity = idleTechnicians > 0 ? idleTechnicians : 0;
    const maxCapacity = technicianCount;

    console.log(`Thợ: Tổng ${technicianCount}, Bận ${busyTechnicians}, Rảnh ${idleTechnicians}`);
    console.log(`=> Sức chứa tối đa: ${maxCapacity}, Sức chứa hiện tại: ${availableCapacity}`);

    return {
      availableCapacity,
      maxCapacity
    };
  } catch (error) {
    console.error("Lỗi khi tính toán sức chứa garage:", error);
    throw error;
  }
};

module.exports = getGarageCapacity;
