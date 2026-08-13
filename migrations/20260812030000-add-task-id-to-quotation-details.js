'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Quotation_Details');
    if (!tableInfo.task_id) {
      await queryInterface.addColumn('Quotation_Details', 'task_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Tasks',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Quotation_Details');
    if (tableInfo.task_id) {
      await queryInterface.removeColumn('Quotation_Details', 'task_id');
    }
  }
};
