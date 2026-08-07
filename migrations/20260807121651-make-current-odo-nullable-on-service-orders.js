'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Service_Orders', 'current_odo', {
      type: Sequelize.INTEGER,
      allowNull: true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('Service_Orders', 'current_odo', {
      type: Sequelize.INTEGER,
      allowNull: false
    });
  }
};
