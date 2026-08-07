'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Service_Catalogs');
    if (!tableInfo.requires_bay) {
      await queryInterface.addColumn('Service_Catalogs', 'requires_bay', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Service_Catalogs');
    if (tableInfo.requires_bay) {
      await queryInterface.removeColumn('Service_Catalogs', 'requires_bay');
    }
  }
};
