const feedbackService = require("../../service/customer/feedback.service");

module.exports.getAllFeedbacks = async (req, res) => {
  try {
    const result = await feedbackService.getAllFeedbacks();
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};
