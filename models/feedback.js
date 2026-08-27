'use strict';
const {
  Model
} = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Feedback extends Model {
    static associate(models) {
      this.belongsTo(models.Customers, {
        foreignKey: 'customer_id',
        as: 'customer'
      });

      this.belongsTo(models.Service_Orders, {
        foreignKey: 'service_order_id',
        as: 'serviceOrder'
      });

      this.belongsTo(models.User, {
        foreignKey: 'receptionist_id',
        as: 'receptionist'
      });

      this.belongsTo(models.User, {
        foreignKey: 'head_technician_id',
        as: 'headTechnician'
      });
    }
  }

  Feedback.init({
    customer_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    service_order_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5
      },
      comment: 'Đánh giá từ 1 tới 5 sao'
    },
    comment: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Bình luận/phản hồi của khách hàng'
    },
    service_rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5
      }
    },
    service_comment: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    receptionist_rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5
      }
    },
    receptionist_comment: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    receptionist_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    head_technician_rating: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 5
      }
    },
    head_technician_comment: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    head_technician_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Feedback',
    tableName: 'Feedbacks',
    timestamps: true
  });

  return Feedback;
};
