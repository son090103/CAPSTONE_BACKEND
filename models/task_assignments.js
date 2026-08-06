'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Task_Assignment extends Model {
    static associate(models) {
      if (models.Task) {
        Task_Assignment.belongsTo(models.Task, { foreignKey: 'task_id', as: 'task' });
      }
      if (models.User) {
        Task_Assignment.belongsTo(models.User, { foreignKey: 'technician_id', as: 'technician' });
        Task_Assignment.belongsTo(models.User, { foreignKey: 'approved_by', as: 'approver' });
      }
      if (models.Service_Bays) {
        Task_Assignment.belongsTo(models.Service_Bays, { foreignKey: 'bay_id', as: 'bay' });
      }
      if (models.Shift_Templates) {
        Task_Assignment.belongsTo(models.Shift_Templates, { foreignKey: 'staff_shift_id', as: 'staff_shift' });
      }
    }
  }

  Task_Assignment.init({
    task_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    technician_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    staff_shift_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    bay_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    role_in_task: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'LEAD',
      validate: {
        isIn: [['LEAD', 'ASSISTANT']]
      }
    },
    contribution_percent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 100,
      validate: {
        min: 0,
        max: 100
      }
    },
    actual_start_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    actual_end_time: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'ASSIGNED',
      validate: {
        isIn: [['ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'WAITING_STOCK', 'PENDING_QC', 'COMPLETED', 'CANCELLED']]
      }
    },
    approved_by: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    remarks: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    sequelize,
    modelName: 'Task_Assignment',
    tableName: 'Task_Assignments',
    timestamps: true
  });

  return Task_Assignment;
};
