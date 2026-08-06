'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Check if column already exists before adding
    const tableInfo = await queryInterface.describeTable('Customers');
    if (!tableInfo.loyalty_points) {
      await queryInterface.addColumn('Customers', 'loyalty_points', {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Customers');
    if (tableInfo.loyalty_points) {
      await queryInterface.removeColumn('Customers', 'loyalty_points');
    }
  }
};
