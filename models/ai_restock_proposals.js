"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class AI_Restock_Proposals extends Model {
    static associate(models) {
      this.belongsTo(models.User, {
        foreignKey: "created_by",
        as: "creator",
      });
    }
  }
  AI_Restock_Proposals.init(
    {
      proposal_code: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      analysis_result: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      items: {
        type: DataTypes.JSON,
        allowNull: false,
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "AI_Restock_Proposals",
      tableName: "AI_Restock_Proposals",
      timestamps: true,
    },
  );

  return AI_Restock_Proposals;
};
