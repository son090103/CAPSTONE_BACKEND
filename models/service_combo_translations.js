'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Service_Combo_Translations extends Model {
    static associate(models) {
      this.belongsTo(models.Service_Combo, {
        foreignKey: 'serviceComboId',
        as: 'combo'
      });
      this.belongsTo(models.Languages, {
        foreignKey: 'languageId',
        as: 'language'
      });
    }
  }
  Service_Combo_Translations.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    serviceComboId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    languageId: {
      type: DataTypes.STRING(10),
      allowNull: false
    },
    combo_name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Service_Combo_Translations',
    tableName: 'Service_Combo_Translations',
    timestamps: true
  });
  return Service_Combo_Translations;
};
