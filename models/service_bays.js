'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Service_Bays extends Model {

    static associate(models) {
      if (models.Service_Orders) {
        this.belongsTo(models.Service_Orders, {
          foreignKey: 'current_service_order_id',
          as: 'currentOrder'
        });

        // 2. Liên kết lịch sử (1-n): Tra cứu xem trong QUÁ KHỨ cầu này đã từng làm những lệnh sửa chữa nào
        this.hasMany(models.Service_Orders, {
          foreignKey: 'bay_id',
          as: 'serviceOrders'
        });
      }
      if (models.Workshop_Tools) {
        this.hasMany(models.Workshop_Tools, {
          foreignKey: 'bay_id',
          as: 'tools'
        });
      }
    }
  }
  Service_Bays.init({
    bay_name: {
      type: DataTypes.STRING(50),
      allowNull: false // Tên cầu nâng bắt buộc phải nhập
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'available' // available | in_use | maintenance — khớp enum ở admin/serviceBay.validator.js
    },
    is_active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    current_service_order_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      unique: true
    }
  }, {
    sequelize,
    modelName: 'Service_Bays',
    tableName: 'Service_Bays',
    timestamps: true
  });
  return Service_Bays;
};