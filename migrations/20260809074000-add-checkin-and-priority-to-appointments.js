'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Appointments', 'priority_type', {
      type: Sequelize.STRING(50),
      allowNull: false,
      defaultValue: 'NORMAL'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Appointments', 'priority_type');
  }
};
