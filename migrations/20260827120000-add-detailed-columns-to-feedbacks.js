'use strict';
/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('Feedbacks', 'service_rating', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('Feedbacks', 'service_comment', {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn('Feedbacks', 'receptionist_rating', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('Feedbacks', 'receptionist_comment', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('Feedbacks', 'receptionist_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });

    await queryInterface.addColumn('Feedbacks', 'head_technician_rating', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('Feedbacks', 'head_technician_comment', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await queryInterface.addColumn('Feedbacks', 'head_technician_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'Users',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('Feedbacks', 'head_technician_id');
    await queryInterface.removeColumn('Feedbacks', 'head_technician_comment');
    await queryInterface.removeColumn('Feedbacks', 'head_technician_rating');

    await queryInterface.removeColumn('Feedbacks', 'receptionist_id');
    await queryInterface.removeColumn('Feedbacks', 'receptionist_comment');
    await queryInterface.removeColumn('Feedbacks', 'receptionist_rating');

    await queryInterface.removeColumn('Feedbacks', 'service_comment');
    await queryInterface.removeColumn('Feedbacks', 'service_rating');
  }
};
