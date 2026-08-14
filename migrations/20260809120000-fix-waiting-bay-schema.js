'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Walk-in không có giờ hẹn; model đã cho phép null nên DB cũng phải đồng nhất.
    await queryInterface.changeColumn('Appointments', 'scheduled_time', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    // Chuẩn hóa dữ liệu cũ để mọi truy vấn available/in_use không phân biệt hoa thường.
    await queryInterface.sequelize.query(
      'UPDATE "Service_Bays" SET "status" = LOWER("status") WHERE "status" IS NOT NULL'
    );
    await queryInterface.changeColumn('Service_Bays', 'status', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'available',
    });
  },

  async down(queryInterface, Sequelize) {
    // Khôi phục dữ liệu hợp lệ trước khi đặt lại ràng buộc NOT NULL.
    await queryInterface.sequelize.query(
      'UPDATE "Appointments" SET "scheduled_time" = "created_at" WHERE "scheduled_time" IS NULL'
    );
    await queryInterface.changeColumn('Appointments', 'scheduled_time', {
      type: Sequelize.DATE,
      allowNull: false,
    });

    await queryInterface.sequelize.query(
      'UPDATE "Service_Bays" SET "status" = UPPER("status") WHERE "status" IS NOT NULL'
    );
    await queryInterface.changeColumn('Service_Bays', 'status', {
      type: Sequelize.STRING(30),
      allowNull: false,
      defaultValue: 'AVAILABLE',
    });
  },
};
