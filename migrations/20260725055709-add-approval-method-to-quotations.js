"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Quotations", "approval_method", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await queryInterface.addColumn("Quotations", "approved_phone", {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Quotations", "approval_method");
    await queryInterface.removeColumn("Quotations", "approved_phone");
  },
};
