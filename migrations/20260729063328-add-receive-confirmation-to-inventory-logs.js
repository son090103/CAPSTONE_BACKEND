"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("Inventory_Logs", "received_by", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn("Inventory_Logs", "received_at", {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn("Inventory_Logs", "proof_image_url", {
      type: Sequelize.STRING(500),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("Inventory_Logs", "received_by");
    await queryInterface.removeColumn("Inventory_Logs", "received_at");
    await queryInterface.removeColumn("Inventory_Logs", "proof_image_url");
  },
};
