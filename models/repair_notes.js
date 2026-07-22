"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Repair_Notes extends Model {
    static associate(models) {
      if (models.Vehicle_Models) {
        this.belongsTo(models.Vehicle_Models, {
          foreignKey: "model_id",
          as: "model",
        });
      }
      if (models.User) {
        this.belongsTo(models.User, {
          foreignKey: "technician_id",
          as: "technician",
        });
      }
      if (models.Task) {
        this.belongsTo(models.Task, {
          foreignKey: "task_id",
          as: "task",
        });
      }
    }
  }
  Repair_Notes.init(
    {
      model_id: {
        type: DataTypes.INTEGER,
        allowNull: false, // kinh nghiệm gắn với dòng xe
      },
      technician_id: {
        type: DataTypes.INTEGER,
        allowNull: false, // ai ghi
      },
      task_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // ghi từ ca sửa nào, để truy nguồn
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "Repair_Notes",
      tableName: "Repair_Notes",
      timestamps: true,
    },
  );

  return Repair_Notes;
};
