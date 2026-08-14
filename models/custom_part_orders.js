"use strict";
const { Model } = require("sequelize");

module.exports = (sequelize, DataTypes) => {
  class Custom_Part_Orders extends Model {
    static associate(models) {
      this.belongsTo(models.Quotation_Details, {
        foreignKey: "quotation_detail_id",
        as: "quotationDetail",
      });
    }
  }
  Custom_Part_Orders.init(
    {
      quotation_detail_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      item_name: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      quantity: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
      },
      unit_price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: false,
      },
      // Tiền cọc KHÔNG lưu ở đây — đã chốt gộp chung 1 số ở Quotation.deposit_amount
      // (1 mã QR BG-<quotationId> duy nhất cho cả báo giá), tránh 2 nguồn sự thật.
      // Giá nhập thực tế + thời điểm về hàng, lưu thẳng ở đây — không dùng Inventory_Logs
      // vì Inventory_Logs.part_id không thể NULL (phụ tùng đặt riêng không có Spare_Parts).
      actual_unit_price: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
      },
      arrived_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: "WAITING_DEPOSIT",
        validate: {
          isIn: [[
            "WAITING_DEPOSIT",
            "WAITING_ARRIVAL",
            "READY_FOR_USE",
            "EXPORTED",
            "CANCELLED",
          ]],
        },
      },
    },
    {
      sequelize,
      modelName: "Custom_Part_Orders",
      tableName: "Custom_Part_Orders",
      timestamps: true,
    },
  );

  return Custom_Part_Orders;
};
