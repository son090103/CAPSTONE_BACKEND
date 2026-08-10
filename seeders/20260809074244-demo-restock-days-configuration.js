'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    return queryInterface.bulkInsert('Garage_Configurations', [
      {
        config_key: 'RESTOCK_DAYS',
        config_value: '14',
        description: 'Số ngày muốn đảm bảo đủ tồn kho phụ tùng, dùng để tính đề xuất nhập hàng thông minh',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ], {});
  },

  async down(queryInterface, Sequelize) {
    return queryInterface.bulkDelete('Garage_Configurations', {
      config_key: 'RESTOCK_DAYS'
    }, {});
  }
};
