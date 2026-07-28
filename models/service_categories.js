'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Service_Categories extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      if (models.Service_Catalog) {
        this.hasMany(models.Service_Catalog, {
          foreignKey: 'category_id',
          as: 'services'
        });
      }
      if (models.Service_Category_Translations) {
        this.hasMany(models.Service_Category_Translations, {
          foreignKey: 'serviceCategoryId',
          as: 'translations'
        });
      }
    }
  }
  Service_Categories.init({
    category_name: {
      type: DataTypes.STRING(100),
      allowNull: false // Tên nhóm dịch vụ bắt buộc phải nhập
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true // Mặc định tạo xong nhóm này sẽ ở trạng thái bật/sẵn sàng
    }
  }, {
    sequelize,
    modelName: 'Service_Categories',
    tableName: 'Service_Categories', // Ép Sequelize map chuẩn xác với tên bảng viết hoa/thường này trong Postgres
    timestamps: true // Quản lý tự động các cột createdAt và updatedAt
  });
  return Service_Categories;
};