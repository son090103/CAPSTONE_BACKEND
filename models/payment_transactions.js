'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Payment_Transactions extends Model {
    static associate(models) {
      if (models.Booking_Payments) {
        this.belongsTo(models.Booking_Payments, {
          foreignKey: 'payment_id',
          as: 'bookingPayment'
        });
      }
    }
  }
  
  Payment_Transactions.init({
    payment_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    parcel_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    gateway: {
      type: DataTypes.STRING(50),
      defaultValue: 'BANK'
    },
    transaction_date: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    account_number: DataTypes.STRING(100),
    sub_account: DataTypes.STRING(100),
    amount_in: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    amount_out: {
      type: DataTypes.DECIMAL(15, 2),
      defaultValue: 0
    },
    accumulated: DataTypes.DECIMAL(15, 2),
    code: DataTypes.STRING(100),
    transaction_content: DataTypes.TEXT,
    reference_number: DataTypes.STRING(100),
    raw_body: DataTypes.TEXT
  }, {
    sequelize,
    modelName: 'Payment_Transactions',
    tableName: 'Payment_Transactions',
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    timestamps: true
  });
  
  return Payment_Transactions;
};