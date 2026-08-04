"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Ghi nhận ngay từ lúc thủ kho duyệt xuất: KTV nào đã yêu cầu và sẽ nhận phiếu này
    // (khác received_by - vốn chỉ dùng cho luồng KTV tự chụp ảnh xác nhận trước đây)
    await queryInterface.addColumn("Inventory_Logs", "requested_technician_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Inventory_Logs", "requested_technician_id");
  },
};
