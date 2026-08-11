const aiService = require('../../service/ai/gemini.service');
const handleChat = async (req, res) => {
  try {
    const { message, history, context = {} } = req.body;
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Tin nhắn không được để trống' });
    }
    if (message.length > 2000 || !Array.isArray(history || []) || (history || []).length > 20) {
      return res.status(400).json({ success: false, message: 'Tin nhắn hoặc lịch sử hội thoại vượt quá giới hạn' });
    }
    
    // Tương tác với LLM / State Machine (Pinecone RAG sẽ được xử lý bên trong service)
    const roleCode = res.locals.user?.role?.roleCode?.toString().toUpperCase();
    const userId = roleCode === 'CUSTOMER' ? res.locals.user.id : undefined;
    const result = userId
      ? await aiService.generateResponse(message.trim(), history || [], context, { userId })
      : await aiService.generateResponse(message.trim(), history || [], context);

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
