'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('Service_Catalogs', 'spare_part_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Spare_Parts',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('Service_Catalogs', 'spare_part_id');
  }
};
