"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Technical_Documents extends Model {
    static associate(models) {
      if (models.Vehicle_Makes) {
        this.belongsTo(models.Vehicle_Makes, {
          foreignKey: "make_id",
          as: "make",
        });
      }
      if (models.User) {
        this.belongsTo(models.User, {
          foreignKey: "uploaded_by",
          as: "uploader",
        });
      }
    }
  }
  Technical_Documents.init(
    {
      title: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      make_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      file_url: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      extracted_text: {
        type: DataTypes.TEXT,
        allowNull: true, 
      },
      status: {
        type: DataTypes.ENUM("PROCESSING", "READY", "FAILED"),
        allowNull: false,
        defaultValue: "PROCESSING",
      },
      error_message: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      uploaded_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Technical_Documents",
      tableName: "Technical_Documents",
      timestamps: true,
    },
  );

  return Technical_Documents;
};
