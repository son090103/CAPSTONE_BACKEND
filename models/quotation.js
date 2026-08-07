"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Quotations extends Model {
    static associate(models) {
      this.belongsTo(models.Task, {
        foreignKey: "task_id",
        as: "task",
      });
      this.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "creator",
      });
      this.belongsTo(models.User, {
        foreignKey: "updated_by",
        as: "updater",
      });
      if (models.Quotation_Details) {
        this.hasMany(models.Quotation_Details, {
          foreignKey: "quotation_id",
          as: "items",
        });
      }
    }
  }
  Quotations.init(
    {
      task_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      total_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        validate: {
          isIn: [["PENDING", "APPROVED", "REJECTED"]],
        },
      },
      approved_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      approval_method: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      approved_phone: {
        type: DataTypes.STRING(20),
        allowNull: true,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },

      deposit_amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
        defaultValue: 0,
      },
      deposit_paid_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Quotations",
      tableName: "Quotations",
      timestamps: true,
    },
  );

  return Quotations;
};
