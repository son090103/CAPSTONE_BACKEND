'use strict';

module.exports = {
  async up(queryInterface) {
    // Postgres không cho ADD VALUE bên trong transaction block thông thường của Sequelize CLI,
    // nhưng chạy trực tiếp qua raw query (autocommit) thì được.
    await queryInterface.sequelize.query(
      `ALTER TYPE "enum_Rescue_Requests_status" ADD VALUE IF NOT EXISTS 'TOWING' AFTER 'ARRIVED';`
    );
  },

  async down() {
    // Postgres không hỗ trợ xoá 1 giá trị khỏi enum type — bỏ qua, chấp nhận giữ giá trị này
    // lại nếu rollback (an toàn, không có dữ liệu nào bị mất).
  },
};
