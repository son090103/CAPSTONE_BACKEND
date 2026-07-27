"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Quotations", "deposit_amount", {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.addColumn("Quotations", "deposit_paid_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Quotations", "deposit_amount");
    await queryInterface.removeColumn("Quotations", "deposit_paid_at");
  },
};
