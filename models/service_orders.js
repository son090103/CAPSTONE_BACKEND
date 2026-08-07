"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Service_Orders extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.belongsTo(models.Appointments, {
        foreignKey: "appointment_id",
        as: "appointment",
      });

      // 2. Một lệnh sửa chữa bắt buộc phải thuộc về một chiếc xe cụ thể
      this.belongsTo(models.Vehicles, {
        foreignKey: "vehicle_id",
        as: "vehicle",
      });

      // 3. Lệnh sửa chữa được tiếp nhận bởi một Lễ tân/Cố vấn dịch vụ cụ thể
      this.belongsTo(models.User, {
        foreignKey: "receptionist_id",
        as: "receptionist",
      });

      // 4. Lệnh sửa chữa đang được thực hiện tại một Cầu nâng nhất định
      this.belongsTo(models.Service_Bays, {
        foreignKey: "bay_id",
        as: "bay",
      });

      // 5. Lệnh sửa chữa có thể bao gồm nhiều Tasks
      if (models.Task) {
        this.hasMany(models.Task, {
          foreignKey: "service_order_id",
          as: "tasks",
        });
      }

      if (models.Booking_Payments) {
        this.hasOne(models.Booking_Payments, {
          foreignKey: "order_id",
          as: "payment"
        });
      }

      if (models.Feedback) {
        this.hasOne(models.Feedback, {
          foreignKey: "service_order_id",
          as: "feedback"
        });
      }
    }
  }
  Service_Orders.init(
    {
      appointment_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        unique: true,
      },
      vehicle_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      receptionist_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      bay_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // NULL khi bay_status là NOT_NEEDED hoặc WAITING
      },
      bay_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: 'NOT_NEEDED', // NOT_NEEDED: dịch vụ không cần cầu nâng | WAITING: đang chờ cầu nâng trống | ASSIGNED: đã có bay_id
      },
      current_odo: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "INSPECTING",
      },
      symptoms: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      entry_time: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      symptoms: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      estimated_finish_time: DataTypes.DATE,
      promised_finish_time: DataTypes.DATE,
      actual_finish_time: DataTypes.DATE,
      exit_time: DataTypes.DATE,
      early_closure_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      points_redeemed: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      points_earned: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      }
    },

    {
      sequelize,
      modelName: "Service_Orders",
      tableName: "Service_Orders",
      timestamps: true,
    },
  );
  return Service_Orders;
};
