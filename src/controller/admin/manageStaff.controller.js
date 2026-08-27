const staffService = require("../../service/admin/manageStaff.service");
const { createStaffSchema, updateStaffSchema } = require("../../validation/admin/manageStaff.validation");

module.exports.getStaffList = async (req, res) => {
  try {
    const { page, limit, search, role } = req.query;
    const result = await staffService.getStaffList({
      page,
      limit,
      search,
      roleCode: role,
    });

    return res.status(200).json({
      message: "Lấy danh sách nhân sự thành công",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};

module.exports.createStaff = async (req, res) => {
  try {
    const validation = createStaffSchema.safeParse({
      fullName: req.body.fullName,
      phoneNumber: req.body.phoneNumber,
      roleCode: req.body.roleCode,
      password: req.body.password,
      confirmPassword: req.body.confirmPassword,
    });
    if (!validation.success) {
      return res.status(400).json({ message: validation.error.issues[0].message });
    }

    const result = await staffService.createStaff(validation.data);

    return res.status(201).json({
      message: "Tạo nhân sự thành công",
      data: result.user,
      tempPassword: result.tempPassword,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};

module.exports.updateStaff = async (req, res) => {
  try {
    const validation = updateStaffSchema.safeParse({
      fullName: req.body.fullName,
      phoneNumber: req.body.phoneNumber,
      roleCode: req.body.roleCode,
      status: req.body.status,
    });
    if (!validation.success) {
      return res.status(400).json({ message: validation.error.issues[0].message });
    }

    const result = await staffService.updateStaff(req.params.userId, validation.data);

    return res.status(200).json({
      message: "Cập nhật nhân sự thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};

module.exports.getRoles = async (req,res) =>{
  try {
    const roles = await staffService.getRoles();
    return res.status(200).json({
      data: roles,
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};

module.exports.getStaffPerformance = async (req, res) => {
  try {
    const { timeframe } = req.query;
    const result = await staffService.getStaffPerformanceList(timeframe);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports.getStaffFeedbacks = async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await staffService.getStaffFeedbacks(userId);
    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
