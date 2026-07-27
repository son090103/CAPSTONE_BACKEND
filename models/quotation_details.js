"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Quotation_Details extends Model {
    static associate(models) {
      this.belongsTo(models.Quotations, {
        foreignKey: "quotation_id",
        as: "quotation",
      });
      if (models.Spare_Parts) {
        this.belongsTo(models.Spare_Parts, {
          foreignKey: "spare_part_id",
          as: "sparePart",
        });
      }
      if (models.Service_Catalog) {
        this.belongsTo(models.Service_Catalog, {
          foreignKey: "service_id",
          as: "service_catalog",
        });
      }
      if (models.Vehicle_Issues) {
        this.belongsTo(models.Vehicle_Issues, {
          foreignKey: "issue_id",
          as: "issue",
        });
      }
    }
  }
  Quotation_Details.init(
    {
      quotation_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },

      issue_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // null nếu dòng báo giá không gắn với lỗi cụ thể (VD: phí công chung, phụ phí)
      },
      service_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      spare_part_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      unit_price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      repair_price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0,
      },
      amount: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        validate: {
          isIn: [["PENDING", "EXPORTED", "WAITING_DEPOSIT"]],
        },
      },
      custom_item_name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Quotation_Details",
      tableName: "Quotation_Details",
      timestamps: true,
    },
  );

  return Quotation_Details;
};
