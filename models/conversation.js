'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Conversation extends Model {
    static associate(models) {
      Conversation.belongsTo(models.User, {
        foreignKey: 'customer_id',
        as: 'customer',
      });
      Conversation.belongsTo(models.User, {
        foreignKey: 'claimed_by',
        as: 'claimedByUser',
      });
      Conversation.hasMany(models.Message, {
        foreignKey: 'conversation_id',
        as: 'messages',
      });
    }
  }

  Conversation.init(
    {
      customer_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      claimed_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      last_message_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Conversation',
      tableName: 'Conversations',
      timestamps: true,
    },
  );

  return Conversation;
};
