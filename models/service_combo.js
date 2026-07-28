'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Service_Combo extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.belongsToMany(models.Service_Catalog, {
        through: models.Service_Combo_Catalogs,
        foreignKey: 'combo_id',
        otherKey: 'catalog_id',
        as: 'catalogs'
      });
      if (models.Service_Combo_Translations) {
        this.hasMany(models.Service_Combo_Translations, {
          foreignKey: 'serviceComboId',
          as: 'translations'
        });
      }
    }
  }
  Service_Combo.init({
    combo_name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Tên gói dịch vụ. VD: Gói bảo dưỡng cấp 1 (5000km)'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Mô tả chi tiết các hạng mục trong gói'
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Trạng thái hoạt động'
    }
  }, {
    sequelize,
    modelName: 'Service_Combo',
    tableName: 'Service_Combos',
    timestamps: true,
  });
  return Service_Combo;
};