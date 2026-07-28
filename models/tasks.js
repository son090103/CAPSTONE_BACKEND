"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Task extends Model {
    static associate(models) {
      if (models.Service_Orders) {
        Task.belongsTo(models.Service_Orders, {
          foreignKey: "service_order_id",
          as: "serviceOrder",
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        });
      }
      if (models.Quotation_Details) {
        Task.belongsTo(models.Quotation_Details, {
          foreignKey: "quotation_item_id",
          as: "quotationItem",
        });
      }
      if (models.Service_Catalog) {
        Task.belongsTo(models.Service_Catalog, {
          foreignKey: "service_catalog_id",
          as: "catalog",
        });
      }
      if (models.Task_Assignment) {
        Task.hasMany(models.Task_Assignment, {
          foreignKey: "task_id",
          as: "assignments",
        });
      }
      if (models.Repair_Notes) {
        Task.hasMany(models.Repair_Notes, {
          foreignKey: "task_id",
          as: "repairNotes",
        });
      }
    }
  }

  Task.init(
    {
      service_order_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      quotation_item_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      service_catalog_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: 'INSPECTION',
        validate: {
          isIn: [['INSPECTION', 'REPAIR']]
        }
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        validate: {
          isIn: [["PENDING", "IN_PROGRESS", "PAUSED", "COMPLETED"]],
        },
      },
    },
    {
      sequelize,
      modelName: "Task",
      tableName: "Tasks",
      timestamps: true,
    },
  );

  return Task;
};
