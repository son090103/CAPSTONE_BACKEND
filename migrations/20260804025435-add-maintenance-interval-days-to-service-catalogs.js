'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    try {
      await queryInterface.addColumn('Service_Catalogs', 'recommended_interval_days', {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('Column recommended_interval_days already exists, skipping.');
      } else {
        throw e;
      }
    }
  },

  async down (queryInterface, Sequelize) {
    try {
      await queryInterface.removeColumn('Service_Catalogs', 'recommended_interval_days');
    } catch (e) {
      console.log('Column recommended_interval_days does not exist, skipping.');
    }
  }
};
