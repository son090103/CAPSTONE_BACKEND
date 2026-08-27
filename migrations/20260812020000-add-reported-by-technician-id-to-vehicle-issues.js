'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Vehicle_Issues');
    if (!tableInfo.reported_by_technician_id) {
      await queryInterface.addColumn('Vehicle_Issues', 'reported_by_technician_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const tableInfo = await queryInterface.describeTable('Vehicle_Issues');
    if (tableInfo.reported_by_technician_id) {
      await queryInterface.removeColumn('Vehicle_Issues', 'reported_by_technician_id');
    }
  }
};
