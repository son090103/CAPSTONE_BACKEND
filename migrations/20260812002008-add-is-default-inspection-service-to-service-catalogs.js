'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Service_Catalogs');
    if (!tableInfo.is_default_inspection_service) {
      await queryInterface.addColumn('Service_Catalogs', 'is_default_inspection_service', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Service_Catalogs');
    if (tableInfo.is_default_inspection_service) {
      await queryInterface.removeColumn('Service_Catalogs', 'is_default_inspection_service');
    }
  }
};
