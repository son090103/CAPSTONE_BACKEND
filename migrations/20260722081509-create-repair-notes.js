"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Repair_Notes", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      model_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Vehicle_Models", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      technician_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      task_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Tasks", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Repair_Notes");
  },
};
