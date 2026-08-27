const manageCustomerService = require("../../service/admin/manageCustomer.service");

module.exports.getCustomer = async (req, res) => {
    try {
        const { search } = req.query;
        const result = await manageCustomerService.getCustomers(search);
        
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ success: false, message: "Lỗi Server", error: error.message });
    }
};

module.exports.getCustomerDetail = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ success: false, message: "ID không hợp lệ" });

        const result = await manageCustomerService.getCustomerById(id);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(500).json({ success: false, message: "Lỗi Server", error: error.message });
    }
};

module.exports.createCustomer = async (req, res) => {
    try {
        const result = await manageCustomerService.createCustomer(req.body);
        return res.status(201).json(result);
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

module.exports.updateCustomer = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await manageCustomerService.updateCustomer(id, req.body);
        return res.status(200).json(result);
    } catch (error) {
        return res.status(400).json({ success: false, message: error.message });
    }
};

const { uploadToCloudinary } = require("../../helper/uploadToCloudinary.helper");

module.exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Vui lòng chọn ảnh đại diện" });
    }
    const result = await uploadToCloudinary(req.file.buffer, "avatars", false);
    return res.status(200).json({
      success: true,
      url: result.secure_url,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Lỗi upload avatar" });
  }
};