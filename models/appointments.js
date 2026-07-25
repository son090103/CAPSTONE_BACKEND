'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class Appointments extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      this.belongsTo(models.Customers, {
        foreignKey: 'customer_id',
        as: 'customer'
      });

      // 2. Một lịch hẹn được lên lịch cho một chiếc Xe cụ thể (Vehicle)
      this.belongsTo(models.Vehicles, {
        foreignKey: 'vehicle_id',
        as: 'vehicle'
      });

      // 4. Mối quan hệ 1-1: Khi xe đến xưởng, lịch hẹn này sẽ sinh ra tối đa 1 Lệnh sửa chữa (Service_Order)
      if (models.Service_Orders) {
        this.hasOne(models.Service_Orders, {
          foreignKey: 'appointment_id',
          as: 'serviceOrder'
        });
      }

      // 5. Một lịch hẹn có nhiều chi tiết lịch hẹn (Appointment_Details)
      if (models.Appointment_Details) {
        this.hasMany(models.Appointment_Details, {
          foreignKey: 'appointment_id',
          as: 'appointmentDetails'
        });
      }
    }
  }
  Appointments.init({
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false // FIX: Khóa ngoại không được phép để trống
    },
    vehicle_id: {
      type: DataTypes.INTEGER,
      allowNull: true // FIX: Cho phép null để hỗ trợ khách vãng lai chưa tạo thông tin xe
    },
    booking_type: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    scheduled_time: {
      type: DataTypes.DATE,
      allowNull: false // FIX: Ngày giờ hẹn bắt buộc phải có
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'CONFIRMED' // FIX: Mặc định tạo lịch xong sẽ ở trạng thái CONFIRMED
    }
  }, {
    sequelize,
    modelName: 'Appointments',
    tableName: 'Appointments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updatedAt'
  });
  return Appointments;
};