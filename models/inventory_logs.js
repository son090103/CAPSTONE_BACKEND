'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Inventory_Logs extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
        this.belongsTo(models.Spare_Parts, {
          foreignKey: 'part_id',
          as: 'part'
        });
      // 2. Một dòng log có thể liên kết
      //  tới một Lệnh sửa chữa xe (Service_Order)
        this.belongsTo(models.Service_Orders, {
          foreignKey: 'service_order_id',
          as: 'serviceOrder'
        });
      // 3. Một dòng log bắt buộc phải được thực hiện bởi một Nhân viên/Thủ kho (User)
        this.belongsTo(models.User, {
          foreignKey: 'manager_id',
          as: 'manager'
        });
        this.belongsTo(models.User, {
          foreignKey: 'received_by',
          as: 'receiver'
        });
      // 3. Một dòng log import bắt buộc thuộc 1 nhà cung cấp
        this.belongsTo(models.Suppliers, {
        foreignKey: 'supplier_id',
        as: 'supplier'
        });
        this.hasOne(models.Inventory_Batches, {
        foreignKey: 'inventory_log_id',
        as: 'batch'
        });
    }
  }
  Inventory_Logs.init({
    receipt_code: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    part_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    supplier_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    service_order_id: {
      type: DataTypes.INTEGER,
      allowNull: true 
    },
    type: {
      type: DataTypes.STRING(50),
      allowNull: false 
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    unit_price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true // Giá nhập trên mỗi đơn vị đối với giao dịch IN
    },
    manager_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    received_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    received_at: {
      type: DataTypes.DATE,
      allowNull: true
    },
    proof_image_url: {
      type: DataTypes.STRING(500),
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Inventory_Logs',
    tableName: 'Inventory_Logs',
    timestamps: true
  });
  return Inventory_Logs;
};