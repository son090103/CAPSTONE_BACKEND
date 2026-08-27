const { submitFeedbackSchema } = require("../../validation/customer/feedback.validation");
const feedbackService = require("../../service/customer/feedback.service");
const db = require("../../../models");
module.exports.submitFeedback = async (req, res) => {
  try {
    const requestUser = res.locals.user;
    if (!requestUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const accountId = requestUser.id;
    const {
      service_order_id,
      service_rating,
      service_comment,
      receptionist_rating,
      receptionist_comment,
      head_technician_rating,
      head_technician_comment
    } = req.body;


    const customer = await db.Customers.findOne({ where: { user_id: accountId } });
    if (!customer) {
      return res.status(404).json({ message: "Không tìm thấy thông tin khách hàng" });
    }
    const customerId = customer.id;

    const validation = submitFeedbackSchema.safeParse({
      service_order_id,
      service_rating,
      service_comment,
      receptionist_rating,
      receptionist_comment,
      head_technician_rating,
      head_technician_comment
    });

    if (!validation.success) {
      return res.status(400).json({ message: validation.error.issues[0].message });
    }

    const result = await feedbackService.submitFeedback(
      customerId,
      validation.data
    );

    return res.status(201).json({ message: "Gửi phản hồi thành công", data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};

module.exports.getMyFeedbacks = async (req, res) => {
  try {
    const requestUser = res.locals.user;
    if (!requestUser) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const accountId = requestUser.id;

    const customer = await db.Customers.findOne({ where: { user_id: accountId } });
    if (!customer) {
      return res.status(404).json({ message: "Không tìm thấy thông tin khách hàng" });
    }
    const customerId = customer.id;

    const result = await feedbackService.getCustomerFeedbacks(customerId);

    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};
