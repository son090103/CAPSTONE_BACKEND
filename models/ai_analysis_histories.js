'use strict';

const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class AI_Analysis_Histories extends Model {
    static associate(models) {
      AI_Analysis_Histories.belongsTo(models.User, {
        foreignKey: 'created_by',
        as: 'createdBy',
      });
    }
  }

  AI_Analysis_Histories.init({
    created_by: DataTypes.INTEGER,
    start_date: { type: DataTypes.DATEONLY, allowNull: false },
    end_date: { type: DataTypes.DATEONLY, allowNull: false },
    timeframe: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'custom' },
    plan_horizon: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '1_month' },
    status: {
      type: DataTypes.ENUM('PROCESSING', 'COMPLETED', 'FAILED'),
      allowNull: false,
      defaultValue: 'PROCESSING',
    },
    model_name: DataTypes.STRING(100),
    prompt_version: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'admin-analysis-v1' },
    input_snapshot: DataTypes.JSONB,
    analysis_snapshot: DataTypes.JSONB,
    ai_plan: DataTypes.JSONB,
    ai_insights: DataTypes.TEXT,
    weather_snapshot: DataTypes.JSONB,
    error_message: DataTypes.TEXT,
    duration_ms: DataTypes.INTEGER,
  }, {
    sequelize,
    modelName: 'AI_Analysis_Histories',
    tableName: 'AI_Analysis_Histories',
    timestamps: true,
  });

  return AI_Analysis_Histories;
};
