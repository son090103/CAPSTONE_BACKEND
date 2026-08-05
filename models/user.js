"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      //n-1
      User.belongsTo(models.Role, {
        foreignKey: "roleId",
        as: "role",
      });
      if (models.Customers) {
        User.hasOne(models.Customers, {
          foreignKey: "user_id",
          as: "customerProfile",
        });
      }
      if (models.Tool_History) {
        User.hasMany(models.Tool_History, {
          foreignKey: "technician_id",
          as: "operatedTools",
        });
      }
      if (models.Inventory_Logs) {
        User.hasMany(models.Inventory_Logs, {
          foreignKey: "manager_id",
          as: "inventoryLogs",
        });
      }
      if (models.Service_Orders) {
        User.hasMany(models.Service_Orders, {
          foreignKey: "receptionist_id",
          as: "receptionistOrders",
        });
      }
      if (models.Notification) {
        User.hasMany(models.Notification, {
          foreignKey: "recipientId",
          as: "notifications",
        });
      }
      if (models.Shift_Templates) {
        User.hasMany(models.Shift_Templates, {
          foreignKey: 'user_id',
          as: 'shiftTemplates'
        });
      }

   if (models.Task_Assignment) {
        User.hasMany(models.Task_Assignment, {
          foreignKey: "technician_id",
          as: "assignments",
        });
      }    }
  }
  User.init(
    {
      roleId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "Roles",
          key: "id",
        },
      },
      googleId: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
      email: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isEmail: true,
        },
      },
      phoneNumber: {
        type: DataTypes.STRING(20),
        allowNull: true,
        unique: true,
        validate: {
          isNumeric: true,
          len: [10, 15],
        },
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          notEmpty: true,
        },
      },
      fullName: {
        type: DataTypes.STRING(150),
        allowNull: false,
        validate: {
          len: [2, 150],
        },
      },
      avatar: {
        type: DataTypes.STRING,
        defaultValue: "",
      },
      refreshToken: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(50),
        defaultValue: "PENDING",
        validate: {
          isIn: [["PENDING", "ACTIVE", "INACTIVE", "BANNED"]],
        },
      },
      hasDrivingLicense: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      latitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
      longitude: {
        type: DataTypes.FLOAT,
        allowNull: true,
      },
    },

    {
      sequelize,
      modelName: 'User',
      tableName: 'Users',
      timestamps: true,
    });
  return User;
};
