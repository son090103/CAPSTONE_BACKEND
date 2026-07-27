const { AI_SYSTEM_PROMPT } = require('../../config/ai_prompts');

const generateResponse = async (userMessage, history, context) => {
  // TODO: Khởi tạo OpenAI Client và gọi API
  // Gửi system prompt + history + context + userMessage
  console.log("Context đưa cho AI:", context);
  console.log("Câu hỏi user:", userMessage);

  return "Đây là câu trả lời giả lập từ OpenAI. Hệ thống đã nhận được dữ liệu.";
};

module.exports = {
  generateResponse
};
