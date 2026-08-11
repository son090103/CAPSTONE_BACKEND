"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Restock_Requests extends Model {
    static associate(models) {
      this.belongsTo(models.Spare_Parts, {
        foreignKey: "spare_part_id",
        as: "sparePart",
      });
      if (models.Quotation_Details) {
        this.belongsTo(models.Quotation_Details, {
          foreignKey: "quotation_detail_id",
          as: "quotationDetail",
        });
      }
      this.belongsTo(models.User, {
        foreignKey: "requested_by",
        as: "requestedByUser",
      });
    }
  }
  Restock_Requests.init(
    {
      spare_part_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      quotation_detail_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      quantity_needed: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      requested_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "PENDING",
        validate: {
          isIn: [["PENDING", "RESOLVED", "CANCELLED", "FULFILLED"]],
        },
      },
    },
    {
      sequelize,
      modelName: "Restock_Requests",
      tableName: "Restock_Requests",
      timestamps: true,
    },
  );

  return Restock_Requests;
};
