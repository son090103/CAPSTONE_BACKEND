const db = require('../../models');
const getGarageCapacity = async () => {
  try {
    // 1. Lấy tổng số lượng
    const technicianCount = await db.User.count({
      include: [{
        model: db.Role,
        as: 'role',
        where: { roleCode: 'TECHNICIAN' }
      }],
      where: { status: 'ACTIVE' }
    });

    const bayCount = await db.Service_Bays.count({
      where: { is_active: true }
    });

    // 2. Tính số lượng cầu nâng đang BẬN — dựa trực tiếp vào Service_Bays.status
    const busyBays = await db.Service_Bays.count({
      where: {
        is_active: true,
        status: { [db.Sequelize.Op.ne]: 'available' }
      }
    });

    // 3. Tính số lượng thợ đang BẬN
    const busyTechnicians = await db.Task_Assignment.count({
      distinct: true,
      col: 'technician_id',
      where: {
        status: {
          [db.Sequelize.Op.in]: ['ASSIGNED', 'IN_PROGRESS', 'PAUSED']
        }
      }
    });

    // 4. Tính khả dụng
    const idleBays = bayCount - busyBays;
    const idleTechnicians = technicianCount - busyTechnicians;

    // Sức chứa hiện tại là số nhỏ hơn giữa số thợ rảnh và số cầu nâng rảnh
    const availableCapacity = Math.min(
      idleBays > 0 ? idleBays : 0,
      idleTechnicians > 0 ? idleTechnicians : 0
    );

    // Sức chứa TỐI ĐA vật lý của Gara (dành cho việc tính toán kín lịch trong tương lai)
    const maxCapacity = Math.min(bayCount, technicianCount);

    console.log(`Cầu nâng: Tổng ${bayCount}, Bận ${busyBays}, Rảnh ${idleBays}`);
    console.log(`Thợ: Tổng ${technicianCount}, Bận ${busyTechnicians}, Rảnh ${idleTechnicians}`);
    console.log(`=> Sức chứa tối đa: ${maxCapacity}, Sức chứa hiện tại: ${availableCapacity}`);
    
    // Trả về cả sức chứa tối đa và sức chứa hiện tại
    return {
      availableCapacity,
      maxCapacity: maxCapacity > 0 ? maxCapacity : 1
    };
  } catch (error) {
    console.error("Lỗi khi tính toán sức chứa garage:", error);
    throw error;
  }
};

module.exports = getGarageCapacity;
