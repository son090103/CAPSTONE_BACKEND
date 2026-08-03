'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Shift_Slots', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      slot_name: {
        type: Sequelize.STRING(50)
      },
      start_time: {
        type: Sequelize.TIME
      },
      end_time: {
        type: Sequelize.TIME
      },
      max_technicians: {
        type: Sequelize.INTEGER,
        defaultValue: 3
      },
      min_senior: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'hard - bắt buộc'
      },
      min_mid: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'hard - bắt buộc'
      },
      prefer_senior: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: 'soft - ưu tiên'
      },
      prefer_mid: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: 'soft - ưu tiên'
      },
      prefer_junior: {
        type: Sequelize.INTEGER,
        defaultValue: 1,
        comment: 'soft - ưu tiên'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Shift_Slots');
  }
};
