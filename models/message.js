'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Message extends Model {
    static associate(models) {
      Message.belongsTo(models.Conversation, {
        foreignKey: 'conversation_id',
        as: 'conversation',
      });
      Message.belongsTo(models.User, {
        foreignKey: 'sender_id',
        as: 'sender',
      });
    }
  }

  Message.init(
    {
      conversation_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      sender_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      sender_role: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: {
          isIn: [['CUSTOMER', 'RECEPTIONIST', 'SYSTEM']],
        },
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: true,
        },
      },
      isRead: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: 'Message',
      tableName: 'Messages',
      timestamps: true,
    },
  );

  return Message;
};
