'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Rescue_Requests extends Model {
    static associate(models) {
      this.belongsTo(models.Customers, {
        foreignKey: "customer_id",
        as: "customer"
      });
      this.belongsTo(models.User, {
        foreignKey: "technician_id",
        as: "technician"
      });
      this.belongsTo(models.Appointments, {
        foreignKey: "appointment_id",
        as: "appointment"
      });
    }
  }
  Rescue_Requests.init({
    customer_id: DataTypes.INTEGER,
    technician_id: DataTypes.INTEGER,
    appointment_id: DataTypes.INTEGER,
    phone_number: DataTypes.STRING,
    distance_km: DataTypes.DECIMAL(10, 2),
    rescue_price: DataTypes.DECIMAL(15, 2),
    customer_lat: DataTypes.DECIMAL(10, 8),
    customer_lng: DataTypes.DECIMAL(11, 8),
    issue_description: DataTypes.TEXT,
    status: {
      type: DataTypes.ENUM('PENDING', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'TOWING', 'IN_PROGRESS', 'COMPLETED', 'SERVICE_CREATED', 'CANCELLED'),
      defaultValue: 'PENDING'
    }
  }, {
    sequelize,
    modelName: 'Rescue_Requests',
    tableName: 'Rescue_Requests',
    timestamps: true
  });
  return Rescue_Requests;
};