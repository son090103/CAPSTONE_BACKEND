"use strict";

/** @type {import("sequelize-cli").Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.removeColumn("Repair_Notes", "model_id");
    await queryInterface.removeColumn("Repair_Notes", "technician_id");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.addColumn("Repair_Notes", "model_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.addColumn("Repair_Notes", "technician_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },
};