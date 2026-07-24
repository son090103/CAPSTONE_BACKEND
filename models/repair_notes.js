"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Repair_Notes extends Model {
    static associate(models) {
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
      task_id: {
        type: DataTypes.INTEGER,
        allowNull: false, // ghi từ ca sửa nào, để truy nguồn
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
