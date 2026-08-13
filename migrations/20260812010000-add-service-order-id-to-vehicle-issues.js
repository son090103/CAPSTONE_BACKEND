'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Vehicle_Issues');
    if (!tableInfo.service_order_id) {
      await queryInterface.addColumn('Vehicle_Issues', 'service_order_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Service_Orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Vehicle_Issues');
    if (tableInfo.service_order_id) {
      await queryInterface.removeColumn('Vehicle_Issues', 'service_order_id');
    }
  }
};
