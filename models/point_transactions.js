'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Point_Transactions extends Model {
    static associate(models) {
      if (models.Customers) {
        this.belongsTo(models.Customers, {
          foreignKey: 'customer_id',
          as: 'customer'
        });
      }
      if (models.Service_Orders) {
        this.belongsTo(models.Service_Orders, {
          foreignKey: 'service_order_id',
          as: 'serviceOrder'
        });
      }
    }
  }
  Point_Transactions.init({
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    service_order_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    action: {
      type: DataTypes.ENUM('ADD', 'DEDUCT', 'REFUND'),
      allowNull: false
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    description: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Point_Transactions',
    tableName: 'Point_Transactions',
    timestamps: true
  });
  return Point_Transactions;
};
