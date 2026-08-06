'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Quotations', 'points_redeemed', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('Quotations', 'discount_amount', {
      type: Sequelize.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Quotations', 'discount_amount');
    await queryInterface.removeColumn('Quotations', 'points_redeemed');
  }
};
