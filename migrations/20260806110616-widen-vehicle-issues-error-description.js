'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Vehicle_Issues', 'error_description', {
      type: Sequelize.TEXT,
      allowNull: false,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('Vehicle_Issues', 'error_description', {
      type: Sequelize.STRING(50),
      allowNull: false,
    });
  },
};
