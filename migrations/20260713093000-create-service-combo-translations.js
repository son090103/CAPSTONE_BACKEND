'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('Service_Combo_Translations', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      serviceComboId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Service_Combos',
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
      combo_name: {
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

    await queryInterface.addConstraint('Service_Combo_Translations', {
      fields: ['serviceComboId', 'languageId'],
      type: 'unique',
      name: 'unique_combo_translation'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('Service_Combo_Translations');
  }
};
