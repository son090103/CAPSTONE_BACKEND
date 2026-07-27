const aiService = require('../../service/ai/gemini.service');
const vectorStoreService = require('../../service/ai/vectorStore.service');

const handleChat = async (req, res) => {
  try {
    const { message, history, context = {} } = req.body;
    
    // Tương tác với LLM / State Machine (Pinecone RAG sẽ được xử lý bên trong service)
    const result = await aiService.generateResponse(message, history, context);

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
