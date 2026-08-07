'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_Rescue_Requests_status" ADD VALUE IF NOT EXISTS 'SERVICE_CREATED' AFTER 'COMPLETED';`
    );
  },

  async down() {
    // Postgres không hỗ trợ xoá 1 giá trị khỏi enum type — bỏ qua, an toàn không mất dữ liệu.
  },
};
