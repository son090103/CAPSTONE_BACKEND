'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Service_Combos', 'discount_percentage', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 10,
      comment: 'Phần trăm giảm giá của gói combo (mặc định 10%)'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Service_Combos', 'discount_percentage');
  }
};
