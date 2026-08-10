"use strict";

module.exports = {
  async up(queryInterface) {
    await queryInterface.removeColumn("Custom_Part_Orders", "deposit_amount");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Custom_Part_Orders", "deposit_amount", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },
};
