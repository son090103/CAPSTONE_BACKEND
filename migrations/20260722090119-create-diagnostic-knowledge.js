"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Diagnostic_Knowledge", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      symptom: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      possible_causes: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      model_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Vehicle_Models", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
        make_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Vehicle_Makes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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
    await queryInterface.dropTable("Diagnostic_Knowledge");
  },
};
