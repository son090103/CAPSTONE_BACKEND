"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("Restock_Requests", {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      spare_part_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Spare_Parts",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      quotation_detail_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "Quotation_Details",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      quantity_needed: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      requested_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "Users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW,
      },
    });
    await queryInterface.addIndex("Restock_Requests", ["spare_part_id", "status"]);
  },

  async down(queryInterface) {
    await queryInterface.dropTable("Restock_Requests");
  },
};
