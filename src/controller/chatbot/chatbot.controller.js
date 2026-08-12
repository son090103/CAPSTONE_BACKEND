const aiService = require('../../service/ai/gemini.service');
const handleChat = async (req, res) => {
  try {
    const { message, history, context = {} } = req.body;
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Tin nhắn không được để trống' });
    }
    if (message.length > 2000 || !Array.isArray(history || [])) {
      return res.status(400).json({ success: false, message: 'Tin nhắn hoặc lịch sử hội thoại vượt quá giới hạn' });
    }
    // Hội thoại có thể kéo dài trong luồng đặt lịch. Chỉ giữ các lượt gần nhất
    // thay vì từ chối toàn bộ request khi phía client gửi quá 20 tin nhắn.
    const recentHistory = (history || []).slice(-20);
    
    // Tương tác với LLM / State Machine (Pinecone RAG sẽ được xử lý bên trong service)
    const roleCode = res.locals.user?.role?.roleCode?.toString().toUpperCase();
    const userId = roleCode === 'CUSTOMER' ? res.locals.user.id : undefined;
    const result = userId
      ? await aiService.generateResponse(message.trim(), recentHistory, context, { userId })
      : await aiService.generateResponse(message.trim(), recentHistory, context);

    res.status(200).json({
      success: true,
      data: {
        reply: result.reply,
        context: result.context
      }
    });
  } catch (error) {
    console.error("Chatbot Error:", error);
    res.status(500).json({ success: false, message: "Lỗi hệ thống Chatbot" });
  }
};

module.exports = {
  handleChat
};
