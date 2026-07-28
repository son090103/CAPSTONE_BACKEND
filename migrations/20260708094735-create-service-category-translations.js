'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Service_Category_Translations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      serviceCategoryId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Service_Categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      languageId: {
        type: Sequelize.STRING(10),
        allowNull: false,
        references: {
          model: 'Languages',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
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

    await queryInterface.addConstraint('Service_Category_Translations', {
      fields: ['serviceCategoryId', 'languageId'],
      type: 'unique',
      name: 'unique_category_translation'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Service_Category_Translations');
  }
};
