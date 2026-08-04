const chatService = require("../../service/chat/chat.service");
const { emitToUser, emitToRole } = require("../../util/socket.util");

// ===== CUSTOMER =====

module.exports.getMyConversation = async (req, res) => {
  try {
    const customerUserId = res.locals.user.id;
    const result = await chatService.getMyConversation(customerUserId);
    await chatService.markConversationRead(result.conversation.id, "CUSTOMER");
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi tải hội thoại",
    });
  }
};

module.exports.sendMessageAsCustomer = async (req, res) => {
  try {
    const customerUserId = res.locals.user.id;
    const { content } = req.body;
    const { conversation, message, autoReplyMessage } = await chatService.sendMessageAsCustomer(
      customerUserId,
      content,
    );
    emitToRole("RECEPTIONIST", "new_chat_message", {
      conversationId: conversation.id,
      message,
    });
    if (autoReplyMessage) {
      // Tin nhắn tự động này chỉ dành cho khách hàng thấy, lễ tân không cần nhận realtime lẫn xem lại
      emitToUser(customerUserId, "new_chat_message", {
        conversationId: conversation.id,
        message: autoReplyMessage,
      });
    }
    return res.status(201).json({ success: true, data: message, autoReplyMessage });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi gửi tin nhắn",
    });
  }
};

module.exports.sendQuoteReferenceMessage = async (req, res) => {
  try {
    const customerUserId = res.locals.user.id;
    const { quotationId } = req.body;
    const { conversation, message } = await chatService.sendQuoteReferenceMessage(
      customerUserId,
      quotationId,
    );
    emitToRole("RECEPTIONIST", "new_chat_message", {
      conversationId: conversation.id,
      message,
    });
    return res.status(201).json({ success: true, data: message });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi gửi báo giá vào hội thoại",
    });
  }
};

module.exports.getUnreadCountForCustomer = async (req, res) => {
  try {
    const customerUserId = res.locals.user.id;
    const count = await chatService.getUnreadCountForCustomer(customerUserId);
    return res.status(200).json({ success: true, count });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi",
    });
  }
};

// ===== RECEPTIONIST =====

module.exports.getConversationsForReception = async (req, res) => {
  try {
    const result = await chatService.getConversationsForReception();
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi tải danh sách hội thoại",
    });
  }
};

module.exports.getConversationDetailForReception = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await chatService.getConversationDetailForReception(id);
    await chatService.markConversationRead(id, "RECEPTIONIST");
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi tải hội thoại",
    });
  }
};

module.exports.claimConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const receptionistId = res.locals.user.id;
    const receptionistName = res.locals.user.fullName;
    const { conversation, greetingMessage } = await chatService.claimConversation(
      id,
      receptionistId,
      receptionistName,
    );
    const claimPayload = {
      conversationId: conversation.id,
      claimedBy: receptionistId,
      claimedByName: receptionistName,
    };
    emitToRole("RECEPTIONIST", "chat_conversation_claimed", claimPayload);
    emitToUser(conversation.customer_id, "chat_conversation_claimed", claimPayload);

    // Tin nhắn chào chỉ dành cho khách hàng thấy, lễ tân không cần nhận realtime lẫn xem lại
    emitToUser(conversation.customer_id, "new_chat_message", {
      conversationId: conversation.id,
      message: greetingMessage,
    });

    return res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi nhận xử lý hội thoại",
    });
  }
};

module.exports.unclaimConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const receptionistId = res.locals.user.id;
    const receptionistName = res.locals.user.fullName;
    const { conversation, closingMessage } = await chatService.unclaimConversation(
      id,
      receptionistId,
      receptionistName,
    );
    const claimPayload = {
      conversationId: conversation.id,
      claimedBy: null,
      claimedByName: null,
    };
    emitToRole("RECEPTIONIST", "chat_conversation_claimed", claimPayload);
    emitToUser(conversation.customer_id, "chat_conversation_claimed", claimPayload);

    // Tin nhắn đóng phiên chỉ dành cho khách hàng thấy, lễ tân không cần nhận realtime lẫn xem lại
    emitToUser(conversation.customer_id, "new_chat_message", {
      conversationId: conversation.id,
      message: closingMessage,
    });

    return res.status(200).json({ success: true, data: conversation });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi bỏ nhận xử lý hội thoại",
    });
  }
};

module.exports.sendMessageAsReceptionist = async (req, res) => {
  try {
    const { id } = req.params;
    const receptionistId = res.locals.user.id;
    const { content } = req.body;
    const { conversation, message } = await chatService.sendMessageAsReceptionist(
      id,
      receptionistId,
      content,
    );
    emitToUser(conversation.customer_id, "new_chat_message", {
      conversationId: conversation.id,
      message,
    });
    emitToRole("RECEPTIONIST", "new_chat_message", {
      conversationId: conversation.id,
      message,
    });
    return res.status(201).json({ success: true, data: message });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi khi gửi tin nhắn",
    });
  }
};

module.exports.getUnreadCountForReception = async (req, res) => {
  try {
    const count = await chatService.getUnreadCountForReception();
    return res.status(200).json({ success: true, count });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Đã xảy ra lỗi",
    });
  }
};
