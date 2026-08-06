"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Customers extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.belongsTo(models.User, {
        foreignKey: "user_id",
        as: "user",
      });
      if (models.Vehicles) {
        this.hasMany(models.Vehicles, {
          foreignKey: "customer_id",
          as: "vehicles",
        });
      }

      // 3. Một khách hàng có thể đặt nhiều lịch hẹn trước (Appointments)
      if (models.Appointments) {
        this.hasMany(models.Appointments, {
          foreignKey: "customer_id",
          as: "appointments",
        });
      }

      // 4. Một khách hàng có thể gửi nhiều yêu cầu cứu hộ khẩn cấp (Rescue_Requests)
      if (models.Rescue_Requests) {
        this.hasMany(models.Rescue_Requests, {
          foreignKey: "customer_id",
          as: "rescueRequests",
        });
      }
    }
  }
  Customers.init(
    {
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: true,
      },
      email: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },

      phone: {
        type: DataTypes.STRING(20),
        allowNull: false,
      },
      membership_tier: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "BRONZE",
      },
      loyalty_points: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      total_spent: {
        type: DataTypes.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
      },
    },
    {
      sequelize,
      modelName: "Customers",
      tableName: "Customers",
      timestamps: true,
    },
  );
  return Customers;
};
