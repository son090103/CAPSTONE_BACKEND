const { success } = require("zod");
const taskAssignmentService = require("../../service/technicianLeader/taskAssignmentManagement.service");
const {assignTaskSchema} = require("../../validation/technicianLeader/taskAssignmentManagement.validation");

module.exports.getAllTasks = async (req, res) => {
  try {
    const result = await taskAssignmentService.getAllTasks();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Đã xảy ra lỗi khi lấy danh sách công việc",
    });
  }
};

module.exports.assignTask = async (req, res) => {
  try {
    const validation = assignTaskSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ message: validation.error.issues[0].message });
    }
    const result = await taskAssignmentService.assignTask(validation.data);
    return res.status(201).json({
      message: "Phân công thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.getAssignmentHistory = async (req, res) => {
  try {
    const result = await taskAssignmentService.getAssignmentHistory();
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

module.exports.updateAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { technician_id } = req.body;
    if (!technician_id) {
      return res.status(400).json({ message: "Vui lòng chọn kỹ thuật viên" });
    }
    const result = await taskAssignmentService.updateAssignment(
      Number(assignmentId),
      technician_id,
    );
    return res.status(200).json({
      message: "Đổi kỹ thuật viên thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};


module.exports.getAllTechnician = async (req, res) => {
  try {
    const result = await taskAssignmentService.getAllTechnician();
    return res.status(200).json({
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};

