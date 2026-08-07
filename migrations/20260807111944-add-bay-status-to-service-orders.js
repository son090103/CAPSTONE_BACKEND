'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Service_Orders');
    if (!tableInfo.bay_status) {
      await queryInterface.addColumn('Service_Orders', 'bay_status', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'NOT_NEEDED'
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Service_Orders');
    if (tableInfo.bay_status) {
      await queryInterface.removeColumn('Service_Orders', 'bay_status');
    }
  }
};
