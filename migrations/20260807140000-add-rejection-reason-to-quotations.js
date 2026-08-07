'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Quotations');
    if (!tableInfo.rejection_reason) {
      await queryInterface.addColumn('Quotations', 'rejection_reason', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Quotations');
    if (tableInfo.rejection_reason) {
      await queryInterface.removeColumn('Quotations', 'rejection_reason');
    }
  }
};
