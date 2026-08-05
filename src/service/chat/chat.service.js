const db = require("../../../models");
const { Op } = require("sequelize");
const quoteManagementService = require("../customer/quoteManagement.service");

// Lấy (hoặc tạo mới nếu chưa có) cuộc hội thoại của 1 khách hàng.
// Mỗi khách hàng chỉ có duy nhất 1 conversation liên tục với "lễ tân" nói chung.
const getOrCreateConversationForCustomer = async (customerUserId) => {
  let conversation = await db.Conversation.findOne({
    where: { customer_id: customerUserId },
  });
  if (!conversation) {
    conversation = await db.Conversation.create({
      customer_id: customerUserId,
    });
  }
  return conversation;
};
module.exports.getOrCreateConversationForCustomer = getOrCreateConversationForCustomer;

// Khách hàng lấy lịch sử chat của chính mình
module.exports.getMyConversation = async (customerUserId) => {
  const conversation = await getOrCreateConversationForCustomer(customerUserId);
  const conversationWithClaim = await db.Conversation.findByPk(conversation.id, {
    include: [
      {
        model: db.User,
        as: "claimedByUser",
        attributes: ["id", "fullName"],
      },
    ],
  });
  const messages = await db.Message.findAll({
    where: { conversation_id: conversation.id },
    order: [["createdAt", "ASC"]],
  });
  return { conversation: conversationWithClaim, messages };
};

// Kiểm tra xem "phiên chờ" hiện tại (kể từ lần lễ tân trả lời/claim gần nhất) đã có
// tin nhắn tự động "đã ghi nhận" gửi chưa - để không gửi lặp lại khi khách nhắn dồn dập.
const hasAutoReplySentForCurrentWaitPeriod = async (conversationId) => {
  const lastStaffOrSystemMessage = await db.Message.findOne({
    where: { conversation_id: conversationId, sender_role: ["RECEPTIONIST", "SYSTEM"] },
    order: [["createdAt", "DESC"]],
  });
  return lastStaffOrSystemMessage?.sender_role === "SYSTEM";
};

// Khách hàng gửi tin nhắn
module.exports.sendMessageAsCustomer = async (customerUserId, content) => {
  if (!content || !content.trim()) {
    throw { status: 400, message: "Nội dung tin nhắn không được để trống" };
  }
  const conversation = await getOrCreateConversationForCustomer(customerUserId);
  const message = await db.Message.create({
    conversation_id: conversation.id,
    sender_id: customerUserId,
    sender_role: "CUSTOMER",
    content: content.trim(),
  });
  await conversation.update({ last_message_at: message.createdAt });

  let autoReplyMessage = null;
  if (!conversation.claimed_by && !(await hasAutoReplySentForCurrentWaitPeriod(conversation.id))) {
    autoReplyMessage = await db.Message.create({
      conversation_id: conversation.id,
      // Không có cột riêng cho "hệ thống", dùng tạm sender_id của khách để hợp lệ với ràng buộc NOT NULL,
      // FE vẫn nhận biết đây là tin hệ thống qua sender_role.
      sender_id: customerUserId,
      sender_role: "SYSTEM",
      content:
        "Hệ thống đã ghi nhận tin nhắn của bạn, vui lòng đợi nhân viên tiếp nhận trong giây lát.",
    });
    await conversation.update({ last_message_at: autoReplyMessage.createdAt });
  }

  return { conversation, message, autoReplyMessage };
};

// Khách hàng gửi kèm 1 tin nhắn tham chiếu báo giá vào cuộc hội thoại.
// Không có cột riêng lưu tham chiếu - nhúng mã "BG-<id>" vào content, FE tự nhận diện
// bằng regex để hiện nút "Xem chi tiết" (mở lại đúng modal báo giá đầy đủ có sẵn).
module.exports.sendQuoteReferenceMessage = async (customerUserId, quotationId) => {
  const quotation = await quoteManagementService.getQuotationById(
    customerUserId,
    quotationId,
  );

  const conversation = await getOrCreateConversationForCustomer(customerUserId);
  const message = await db.Message.create({
    conversation_id: conversation.id,
    sender_id: customerUserId,
    sender_role: "CUSTOMER",
    content: `Tôi muốn trao đổi về báo giá BG-${quotation.id}.`,
  });
  await conversation.update({ last_message_at: message.createdAt });

  return { conversation, message };
};

// Lễ tân xem danh sách hội thoại (sắp xếp theo tin mới nhất)
module.exports.getConversationsForReception = async () => {
  const conversations = await db.Conversation.findAll({
    include: [
      {
        model: db.User,
        as: "customer",
        attributes: ["id", "fullName", "phoneNumber", "avatar"],
      },
      {
        model: db.User,
        as: "claimedByUser",
        attributes: ["id", "fullName"],
      },
    ],
    order: [
      [db.sequelize.literal('"last_message_at" IS NULL'), "ASC"],
      ["last_message_at", "DESC"],
    ],
  });

  const conversationIds = conversations.map((c) => c.id);
  const unreadCounts = conversationIds.length
    ? await db.Message.findAll({
        attributes: [
          "conversation_id",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: {
          conversation_id: conversationIds,
          sender_role: "CUSTOMER",
          isRead: false,
        },
        group: ["conversation_id"],
        raw: true,
      })
    : [];
  const unreadMap = new Map(
    unreadCounts.map((row) => [row.conversation_id, Number(row.count)]),
  );

  return conversations.map((c) => ({
    ...c.toJSON(),
    unreadCount: unreadMap.get(c.id) ?? 0,
  }));
};

// Lễ tân xem chi tiết 1 hội thoại + tin nhắn
module.exports.getConversationDetailForReception = async (conversationId) => {
  const conversation = await db.Conversation.findByPk(conversationId, {
    include: [
      {
        model: db.User,
        as: "customer",
        attributes: ["id", "fullName", "phoneNumber", "avatar"],
      },
      {
        model: db.User,
        as: "claimedByUser",
        attributes: ["id", "fullName"],
      },
    ],
  });
  if (!conversation) {
    throw { status: 404, message: "Không tìm thấy cuộc hội thoại" };
  }
  // Tin nhắn hệ thống "đã ghi nhận, vui lòng đợi" chỉ dành cho khách hàng, lễ tân không cần thấy
  const messages = await db.Message.findAll({
    where: { conversation_id: conversationId, sender_role: { [Op.ne]: "SYSTEM" } },
    order: [["createdAt", "ASC"]],
  });
  return { conversation, messages };
};

// Lễ tân nhận xử lý 1 hội thoại (không khóa cứng - chỉ là tín hiệu tránh trùng)
// Tự động gửi kèm 1 tin nhắn chào để khách biết ai đang hỗ trợ mình.
module.exports.claimConversation = async (conversationId, receptionistId, receptionistName) => {
  const conversation = await db.Conversation.findByPk(conversationId);
  if (!conversation) {
    throw { status: 404, message: "Không tìm thấy cuộc hội thoại" };
  }
  await conversation.update({ claimed_by: receptionistId });

  const greetingContent = `Xin chào, tôi là ${receptionistName || "nhân viên hỗ trợ"}, nhân viên hỗ trợ của AGM Intelligent. Tôi sẽ hỗ trợ bạn ngay bây giờ.`;
  const greetingMessage = await db.Message.create({
    conversation_id: conversationId,
    // sender_role SYSTEM để chỉ khách hàng thấy, ẩn khỏi lễ tân (kể cả khi xem lại lịch sử)
    sender_id: receptionistId,
    sender_role: "SYSTEM",
    content: greetingContent,
  });
  await conversation.update({ last_message_at: greetingMessage.createdAt });

  return { conversation, greetingMessage };
};

// Lễ tân bỏ nhận xử lý (nhường lại cho người khác)
// Tự động gửi kèm 1 tin nhắn báo cho khách biết đã đóng phiên hỗ trợ.
module.exports.unclaimConversation = async (conversationId, receptionistId, receptionistName) => {
  const conversation = await db.Conversation.findByPk(conversationId);
  if (!conversation) {
    throw { status: 404, message: "Không tìm thấy cuộc hội thoại" };
  }
  await conversation.update({ claimed_by: null });

  const closingContent = `${receptionistName || "Nhân viên hỗ trợ"} đã đóng tiếp nhận. Bạn có thể tiếp tục nhắn tin, một nhân viên khác sẽ hỗ trợ bạn.`;
  const closingMessage = await db.Message.create({
    conversation_id: conversationId,
    // sender_role SYSTEM để chỉ khách hàng thấy, ẩn khỏi lễ tân (kể cả khi xem lại lịch sử)
    sender_id: receptionistId,
    sender_role: "SYSTEM",
    content: closingContent,
  });
  await conversation.update({ last_message_at: closingMessage.createdAt });

  return { conversation, closingMessage };
};

// Lễ tân gửi tin nhắn vào 1 hội thoại
module.exports.sendMessageAsReceptionist = async (
  conversationId,
  receptionistId,
  content,
) => {
  if (!content || !content.trim()) {
    throw { status: 400, message: "Nội dung tin nhắn không được để trống" };
  }
  const conversation = await db.Conversation.findByPk(conversationId);
  if (!conversation) {
    throw { status: 404, message: "Không tìm thấy cuộc hội thoại" };
  }
  if (conversation.claimed_by !== receptionistId) {
    throw {
      status: 403,
      message: "Bạn phải nhận xử lý hội thoại này trước khi nhắn tin",
    };
  }
  const message = await db.Message.create({
    conversation_id: conversationId,
    sender_id: receptionistId,
    sender_role: "RECEPTIONIST",
    content: content.trim(),
  });
  await conversation.update({ last_message_at: message.createdAt });
  return { conversation, message };
};

// Đánh dấu tất cả tin nhắn của phía đối phương trong 1 hội thoại là đã đọc
module.exports.markConversationRead = async (conversationId, readerRole) => {
  // readerRole = 'CUSTOMER' -> đánh dấu đọc các tin của RECEPTIONIST, và ngược lại
  const otherRole = readerRole === "CUSTOMER" ? "RECEPTIONIST" : "CUSTOMER";
  await db.Message.update(
    { isRead: true },
    {
      where: {
        conversation_id: conversationId,
        sender_role: otherRole,
        isRead: false,
      },
    },
  );
};

// Tổng số tin nhắn chưa đọc (dùng cho chuông/badge)
module.exports.getUnreadCountForCustomer = async (customerUserId) => {
  const conversation = await db.Conversation.findOne({
    where: { customer_id: customerUserId },
  });
  if (!conversation) return 0;
  return db.Message.count({
    where: {
      conversation_id: conversation.id,
      sender_role: "RECEPTIONIST",
      isRead: false,
    },
  });
};

module.exports.getUnreadCountForReception = async () => {
  return db.Message.count({
    where: {
      sender_role: "CUSTOMER",
      isRead: false,
    },
  });
};
