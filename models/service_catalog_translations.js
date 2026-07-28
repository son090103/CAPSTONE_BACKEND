'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Service_Catalog_Translations extends Model {
    static associate(models) {
      this.belongsTo(models.Service_Catalog, {
        foreignKey: 'serviceCatalogId',
        as: 'catalog'
      });
      this.belongsTo(models.Languages, {
        foreignKey: 'languageId',
        as: 'language'
      });
    }
  }
  Service_Catalog_Translations.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    serviceCatalogId: {
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
    modelName: 'Service_Catalog_Translations',
    tableName: 'Service_Catalog_Translations',
    timestamps: true
  });
  return Service_Catalog_Translations;
};
