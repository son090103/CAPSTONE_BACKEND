'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      if (models.User) {
        Notification.belongsTo(models.User, {
          foreignKey: 'recipientId',
          as: 'recipient'
        });
      }
    }
  }
  
  Notification.init({
    recipientId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'Users',
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true
      }
    },
    notificationType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        isIn: [['SERVICE_ORDER', 'APPOINTMENT', 'PROMOTION', 'SYSTEM', 'INVOICE', 'MAINTENANCE_REMINDER']]
      }
    },
    referenceId: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    link: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },
    priority: {
      type: DataTypes.STRING(20),
      defaultValue: 'NORMAL',
      allowNull: false,
      validate: {
        isIn: [['HIGH', 'NORMAL', 'LOW']]
      }
    }
  }, {
    sequelize,
    modelName: 'Notification',
    tableName: 'Notifications',
    timestamps: true,
  });
  
  return Notification;
};
