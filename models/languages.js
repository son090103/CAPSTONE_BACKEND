'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Languages extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      // define association here
    }
  }
  Languages.init({
    id: {
      type: DataTypes.STRING(10),
      primaryKey: true,
      allowNull: false,
      comment: "vi, en, ja..."
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    }
  }, {
    sequelize,
    modelName: 'Languages',
    tableName: 'Languages',
    timestamps: true
  });
  return Languages;
};
