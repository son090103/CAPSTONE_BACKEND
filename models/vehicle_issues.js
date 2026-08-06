"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Vehicle_Issues extends Model {
    static associate(models) {
      this.belongsTo(models.Task, {
        foreignKey: "task_id",
        as: "task",
      });
      this.belongsTo(models.Vehicle_Components, {
        foreignKey: "component_id",
        as: "component",
      });
      if (models.Quotation_Details) {
        this.hasMany(models.Quotation_Details, {
          foreignKey: "issue_id",
          as: "quotationDetails",
        });
      }
    }
  }
  Vehicle_Issues.init(
    {
      component_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // để null nếu technician báo lỗi chung, không rõ bộ phận cụ thể
      },
      task_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      error_description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Vehicle_Issues",
      tableName: "Vehicle_Issues",
      timestamps: true,
    },
  );

  return Vehicle_Issues;
};
