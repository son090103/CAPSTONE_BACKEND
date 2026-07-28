'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Booking_Payments', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      order_id: {
        type: Sequelize.INTEGER,
        unique: true,
        references: {
          model: 'Service_Orders', // Đảm bảo bảng Service_Orders đã tồn tại
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      payment_method: {
        type: Sequelize.STRING(50)
      },
      payment_gateway: {
        type: Sequelize.STRING(50),
        defaultValue: 'BANK'
      },
      amount: {
        type: Sequelize.DECIMAL(15, 2)
      },
      currency: {
        type: Sequelize.STRING(10),
        defaultValue: 'VND'
      },
      payment_status: {
        type: Sequelize.STRING(50),
        defaultValue: 'PENDING'
      },
      transaction_code: {
        type: Sequelize.STRING(100)
      },
      paid_at: {
        type: Sequelize.DATE
      },
      refund_account: {
        type: Sequelize.STRING(100)
      },
      refund_bank: {
        type: Sequelize.STRING(100)
      },
      refund_note: {
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
    await queryInterface.dropTable('Booking_Payments');
  }
};