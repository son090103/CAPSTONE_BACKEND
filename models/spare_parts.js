'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Spare_Parts extends Model {
    static associate(models) {
      this.belongsTo(models.Warehouse_Locations, {
        foreignKey: 'location_id',
        as: 'location'
      });
      this.belongsTo(models.Part_Categories, {
        foreignKey: 'category_id',
        as: 'category'
      });
      this.hasMany(models.Service_Catalog, {
        foreignKey: 'spare_part_id',
        as: 'services'
      });
    }
  }
  Spare_Parts.init({
    sku: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true 
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    brand: {
      type: DataTypes.STRING(100),
      allowNull: true 
    },
    stock_quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0 // Mặc định phụ tùng mới tạo có số lượng bằng 0
    },
    min_threshold: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5 // Mặc định dưới 5 món sẽ kích hoạt cảnh báo sắp hết hàng
    },
    retail_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
    },
    location_id: {
      type: DataTypes.INTEGER,
      allowNull: true // Cho phép null nếu hàng mới về chưa kịp xếp lên kệ kho
    }, //
    category_id: {
      type: DataTypes.INTEGER,
      allowNull: false // Bắt buộc phải gắn với một danh mục cụ thể
    },
    warranty_period_months: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    warranty_km_limit: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  }, {
    sequelize,
    modelName: 'Spare_Parts',
    tableName: 'Spare_Parts',
    timestamps: true
  });
  return Spare_Parts;
};