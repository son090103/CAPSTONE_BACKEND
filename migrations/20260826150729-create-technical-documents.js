"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Technical_Documents", {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      make_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "Vehicle_Makes", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      file_url: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      extracted_text: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      status: {
        type: Sequelize.ENUM("PROCESSING", "READY", "FAILED"),
        allowNull: false,
        defaultValue: "PROCESSING",
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      uploaded_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
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
    await queryInterface.dropTable("Technical_Documents");
  },
};
