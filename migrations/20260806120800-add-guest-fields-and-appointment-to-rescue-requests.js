'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Rescue_Requests', 'phone_number', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await queryInterface.addColumn('Rescue_Requests', 'distance_km', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
    await queryInterface.addColumn('Rescue_Requests', 'rescue_price', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
      defaultValue: 0,
    });
    await queryInterface.addColumn('Rescue_Requests', 'appointment_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Appointments',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Rescue_Requests', 'phone_number');
    await queryInterface.removeColumn('Rescue_Requests', 'distance_km');
    await queryInterface.removeColumn('Rescue_Requests', 'rescue_price');
    await queryInterface.removeColumn('Rescue_Requests', 'appointment_id');
  }
};
