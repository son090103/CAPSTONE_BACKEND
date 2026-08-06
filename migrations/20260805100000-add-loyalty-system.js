'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Add total_spent to Customers
    await queryInterface.addColumn('Customers', 'total_spent', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0
    });

    // 2. Add points_redeemed and points_earned to Service_Orders
    await queryInterface.addColumn('Service_Orders', 'points_redeemed', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    
    await queryInterface.addColumn('Service_Orders', 'points_earned', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });

    // 3. Create Point_Transactions table
    await queryInterface.createTable('Point_Transactions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      service_order_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Service_Orders',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      action: {
        type: Sequelize.ENUM('ADD', 'DEDUCT', 'REFUND'),
        allowNull: false
      },
      points: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('Point_Transactions');
    await queryInterface.removeColumn('Service_Orders', 'points_earned');
    await queryInterface.removeColumn('Service_Orders', 'points_redeemed');
    await queryInterface.removeColumn('Customers', 'total_spent');
  }
};
