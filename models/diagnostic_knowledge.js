"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Diagnostic_Knowledge extends Model {
    static associate(models) {
      if (models.Vehicle_Makes) {
        this.belongsTo(models.Vehicle_Makes, {
          foreignKey: "make_id",
          as: "make",
        });
      }
       if (models.Vehicle_Models) {
        this.belongsTo(models.Vehicle_Models, {
          foreignKey: "model_id",
          as: "model",
        });
      }
    }
  }
  Diagnostic_Knowledge.init(
    {
      symptom: {
        type: DataTypes.TEXT,
        allowNull: false, // triệu chứng / biểu hiện lỗi
      },
      possible_causes: {
        type: DataTypes.TEXT,
        allowNull: false, // nguyên nhân khả dĩ
      },
      model_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // null = áp mọi xe; có giá trị = đặc thù dòng xe
      },
        make_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // null + model_id null = lỗi chung; có = lỗi riêng hãng
      },
    },
    {
      sequelize,
      modelName: "Diagnostic_Knowledge",
      tableName: "Diagnostic_Knowledge",
      timestamps: true,
    },
  );

  return Diagnostic_Knowledge;
};
