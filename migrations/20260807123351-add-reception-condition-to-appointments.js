'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Appointments');
    if (!tableInfo.reception_condition) {
      await queryInterface.addColumn('Appointments', 'reception_condition', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Appointments');
    if (tableInfo.reception_condition) {
      await queryInterface.removeColumn('Appointments', 'reception_condition');
    }
  }
};
