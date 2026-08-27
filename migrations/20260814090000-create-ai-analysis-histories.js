'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('AI_Analysis_Histories', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER,
      },
      created_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'Users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      timeframe: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'custom',
      },
      plan_horizon: {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: '1_month',
      },
      status: {
        type: Sequelize.ENUM('PROCESSING', 'COMPLETED', 'FAILED'),
        allowNull: false,
        defaultValue: 'PROCESSING',
      },
      model_name: {
        type: Sequelize.STRING(100),
        allowNull: true,
      },
      prompt_version: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'admin-analysis-v1',
      },
      input_snapshot: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      analysis_snapshot: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      ai_plan: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      ai_insights: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      weather_snapshot: {
        type: Sequelize.JSONB,
        allowNull: true,
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('AI_Analysis_Histories', ['created_by']);
    await queryInterface.addIndex('AI_Analysis_Histories', ['status']);
    await queryInterface.addIndex('AI_Analysis_Histories', ['createdAt']);
    await queryInterface.addIndex('AI_Analysis_Histories', ['start_date', 'end_date']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('AI_Analysis_Histories');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_AI_Analysis_Histories_status";');
  },
};
