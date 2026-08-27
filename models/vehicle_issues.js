"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Vehicle_Issues extends Model {
    static associate(models) {
      this.belongsTo(models.Task, {
        foreignKey: "task_id",
        as: "task",
      });
      this.belongsTo(models.Service_Orders, {
        foreignKey: "service_order_id",
        as: "serviceOrder",
      });
      this.belongsTo(models.Vehicle_Components, {
        foreignKey: "component_id",
        as: "component",
      });
      this.belongsTo(models.User, {
        foreignKey: "reported_by_technician_id",
        as: "reportedByTechnician",
      });
      if (models.Quotation_Details) {
        this.hasMany(models.Quotation_Details, {
          foreignKey: "issue_id",
          as: "quotationDetails",
        });
      }
    }
  }
  Vehicle_Issues.init(
    {
      component_id: {
        type: DataTypes.INTEGER,
        allowNull: true, // để null nếu technician báo lỗi chung, không rõ bộ phận cụ thể
      },
      task_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // Lỗi phát sinh gắn thẳng theo đơn dịch vụ (Service_Order), không phụ thuộc vào việc
      // KTV đang thao tác Task nào lúc phát hiện — báo giá đợt sau sẽ gom mọi issue chưa báo
      // giá của cùng đơn, không tách theo từng Task/hạng mục sửa chữa.
      service_order_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      // KTV mà Leader chọn trong dropdown khi tạo báo cáo lỗi phát sinh — cho biết ai đã báo
      // miệng lỗi này, khác với người bấm tạo báo cáo (luôn là Leader đang đăng nhập).
      reported_by_technician_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      error_description: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: "Vehicle_Issues",
      tableName: "Vehicle_Issues",
      timestamps: true,
    },
  );

  return Vehicle_Issues;
};
