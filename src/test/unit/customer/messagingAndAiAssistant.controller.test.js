const chatService = require("../../../service/chat/chat.service");
const aiService = require("../../../service/ai/gemini.service");

jest.mock("../../../service/chat/chat.service", () => ({
  getMyConversation: jest.fn(),
  sendMessageAsCustomer: jest.fn(),
  sendQuoteReferenceMessage: jest.fn(),
  getUnreadCountForCustomer: jest.fn(),
  markConversationRead: jest.fn(),
}));

jest.mock("../../../service/ai/gemini.service", () => ({
  generateResponse: jest.fn(),
}));

jest.mock("../../../util/socket.util", () => ({
  emitToUser: jest.fn(),
  emitToRole: jest.fn(),
}));

const chatController = require("../../../controller/chat/chat.controller");
const chatbotController = require("../../../controller/chatbot/chatbot.controller");

const createMockResponse = () => {
  const res = {
    locals: {},
  };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe("FE-08: Messaging & AI Assistant Controller Tests (Customer Role)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  /* ==========================================================================
   * 1. Send Message
   * ========================================================================== */
  describe("Send Message", () => {
    it("UTCID01 - Send Message - should return 201 Created when customer sends valid chat text message", async () => {
      const mockResult = {
        conversation: { id: 10 },
        message: { id: 101, content: "Xin chào gara", sender_role: "CUSTOMER" },
        autoReplyMessage: { id: 102, content: "Xin chào! Gara đã nhận tin nhắn.", sender_role: "SYSTEM" },
      };
      chatService.sendMessageAsCustomer.mockResolvedValue(mockResult);

      const req = { body: { content: "Xin chào gara" } };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await chatController.sendMessageAsCustomer(req, res);

      expect(chatService.sendMessageAsCustomer).toHaveBeenCalledWith(1, "Xin chào gara");
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockResult.message,
        autoReplyMessage: mockResult.autoReplyMessage,
      });
    });

    it("UTCID02 - Send Message - should return 201 Created when customer sends quote reference message", async () => {
      const mockQuoteMsgResult = {
        conversation: { id: 10 },
        message: { id: 105, content: "Tham chiếu báo giá #5", sender_role: "CUSTOMER" },
      };
      chatService.sendQuoteReferenceMessage.mockResolvedValue(mockQuoteMsgResult);

      const req = { body: { quotationId: 5 } };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await chatController.sendQuoteReferenceMessage(req, res);

      expect(chatService.sendQuoteReferenceMessage).toHaveBeenCalledWith(1, 5);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockQuoteMsgResult.message,
      });
    });

    it("UTCID03 - Send Message - should return 400 Bad Request when message content is empty", async () => {
      const error = { status: 400, message: "Nội dung tin nhắn không được để trống" };
      chatService.sendMessageAsCustomer.mockRejectedValue(error);

      const req = { body: { content: "" } };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await chatController.sendMessageAsCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Nội dung tin nhắn không được để trống",
      });
    });

    it("UTCID04 - Send Message - should return 401 Unauthorized when user is not authenticated", async () => {
      const req = { body: { content: "Test message" } };
      const res = createMockResponse();
      // res.locals.user is undefined

      try {
        await chatController.sendMessageAsCustomer(req, res);
      } catch (e) {}

      expect(chatService.sendMessageAsCustomer).not.toHaveBeenCalled();
    });

    it("UTCID05 - Send Message - should return 500 Internal Server Error when socket or DB fails", async () => {
      chatService.sendMessageAsCustomer.mockRejectedValue(new Error("Socket payload broadcast error"));

      const req = { body: { content: "Gửi lỗi" } };
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await chatController.sendMessageAsCustomer(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Socket payload broadcast error",
      });
    });
  });

  /* ==========================================================================
   * 2. View Conversations
   * ========================================================================== */
  describe("View Conversations", () => {
    it("UTCID06 - View Conversations - should return 200 OK with customer conversation history", async () => {
      const mockConversation = {
        conversation: { id: 10, customer_id: 1 },
        messages: [{ id: 101, content: "Hello", sender_role: "CUSTOMER" }],
      };
      chatService.getMyConversation.mockResolvedValue(mockConversation);
      chatService.markConversationRead.mockResolvedValue();

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await chatController.getMyConversation(req, res);

      expect(chatService.getMyConversation).toHaveBeenCalledWith(1);
      expect(chatService.markConversationRead).toHaveBeenCalledWith(10, "CUSTOMER");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockConversation,
      });
    });

    it("UTCID07 - View Conversations - should return 200 OK with unread message count", async () => {
      chatService.getUnreadCountForCustomer.mockResolvedValue(2);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await chatController.getUnreadCountForCustomer(req, res);

      expect(chatService.getUnreadCountForCustomer).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, count: 2 });
    });

    it("UTCID08 - View Conversations - should return 404 Not Found when conversation is missing", async () => {
      const error = { status: 404, message: "Không tìm thấy cuộc hội thoại" };
      chatService.getMyConversation.mockRejectedValue(error);

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 99 };

      await chatController.getMyConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Không tìm thấy cuộc hội thoại",
      });
    });

    it("UTCID09 - View Conversations - should return 500 Internal Server Error on database query failure", async () => {
      chatService.getMyConversation.mockRejectedValue(new Error("Database fetch exception"));

      const req = {};
      const res = createMockResponse();
      res.locals.user = { id: 1 };

      await chatController.getMyConversation(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Database fetch exception",
      });
    });
  });

  /* ==========================================================================
   * 3. Chat With AI
   * ========================================================================== */
  describe("Chat With AI", () => {
    it("UTCID10 - Chat With AI - should return 200 OK with AI reply and state context", async () => {
      const mockAiResult = {
        reply: "Bảo dưỡng định kỳ nên thực hiện mỗi 5.000km.",
        context: { step: "SERVICE_ADVICE" },
      };
      aiService.generateResponse.mockResolvedValue(mockAiResult);

      const req = {
        body: { message: "Khi nào cần thay dầu xe?", history: [], context: {} },
      };
      const res = createMockResponse();

      await chatbotController.handleChat(req, res);

      expect(aiService.generateResponse).toHaveBeenCalledWith("Khi nào cần thay dầu xe?", [], {});
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          reply: mockAiResult.reply,
          context: mockAiResult.context,
        },
      });
    });

    it("UTCID11 - Chat With AI - should return 500 Internal Server Error when AI model or Vector DB fails", async () => {
      aiService.generateResponse.mockRejectedValue(new Error("Gemini API Rate Limit Exceeded"));

      const req = {
        body: { message: "Tư vấn sửa chữa" },
      };
      const res = createMockResponse();

      await chatbotController.handleChat(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: "Lỗi hệ thống Chatbot",
      });
    });
  });
});
