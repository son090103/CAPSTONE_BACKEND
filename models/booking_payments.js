'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Booking_Payments extends Model {
    static associate(models) {
      if (models.Service_Orders) {
        this.belongsTo(models.Service_Orders, {
          foreignKey: 'order_id',
          as: 'serviceOrder'
        });
      }
      if (models.Payment_Transactions) {
        this.hasMany(models.Payment_Transactions, {
          foreignKey: 'payment_id',
          as: 'transactions'
        });
      }
    }
  }
  
  Booking_Payments.init({
    order_id: {
      type: DataTypes.INTEGER,
      unique: true
    },
    payment_method: DataTypes.STRING(50),
    payment_gateway: {
      type: DataTypes.STRING(50),
      defaultValue: 'BANK'
    },
    amount: DataTypes.DECIMAL(15, 2),
    currency: {
      type: DataTypes.STRING(10),
      defaultValue: 'VND'
    },
    payment_status: {
      type: DataTypes.STRING(50),
      defaultValue: 'PENDING'
    },
    transaction_code: DataTypes.STRING(100),
    paid_at: DataTypes.DATE,
    refund_account: DataTypes.STRING(100),
    refund_bank: DataTypes.STRING(100),
    refund_note: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Booking_Payments',
    tableName: 'Booking_Payments',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    timestamps: true
  });
  
  return Booking_Payments;
};