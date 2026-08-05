'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Payment_Transactions', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      payment_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'Booking_Payments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      parcel_id: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      gateway: {
        type: Sequelize.STRING(50),
        defaultValue: 'BANK'
      },
      transaction_date: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      account_number: {
        type: Sequelize.STRING(100)
      },
      sub_account: {
        type: Sequelize.STRING(100)
      },
      amount_in: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0
      },
      amount_out: {
        type: Sequelize.DECIMAL(15, 2),
        defaultValue: 0
      },
      accumulated: {
        type: Sequelize.DECIMAL(15, 2)
      },
      code: {
        type: Sequelize.STRING(100)
      },
      transaction_content: {
        type: Sequelize.TEXT
      },
      reference_number: {
        type: Sequelize.STRING(100)
      },
      raw_body: {
        type: Sequelize.TEXT
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Payment_Transactions');
  }
};