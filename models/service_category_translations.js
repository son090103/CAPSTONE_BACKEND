'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Service_Category_Translations extends Model {
    static associate(models) {
      this.belongsTo(models.Service_Categories, {
        foreignKey: 'serviceCategoryId',
        as: 'category'
      });
      this.belongsTo(models.Languages, {
        foreignKey: 'languageId',
        as: 'language'
      });
    }
  }
  Service_Category_Translations.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    serviceCategoryId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    languageId: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Service_Category_Translations',
    tableName: 'Service_Category_Translations',
    timestamps: true
  });
  return Service_Category_Translations;
};
