const vectorStoreService = require('./vectorStore.service');
const db = require('../../../models');

// 1. MOCK NLU (Giả lập Gemini bóc tách ý định bằng Regex)
function parseIntent(message, context) {
  const msg = message.toLowerCase().trim();
  const step = context?.step || "none";

  // Luôn ưu tiên Cancel
  if (["hủy", "thôi", "bỏ", "làm lại", "ko đặt nữa"].some(k => msg.includes(k))) {
    return { intent: "cancel" };
  }

  // Nếu đang ở bước đặt lịch, mọi tin nhắn đều được hiểu theo context hiện tại
  if (step === "booking_get_phone") {
    // Tìm SĐT
    const phoneMatch = msg.match(/(0[0-9]{8,10})/);
    if (phoneMatch) return { intent: "provide_phone", phone: phoneMatch[1] };
    // Nếu không có SĐT, BỎ QUA để nó rơi xuống dưới (xem như khách đang hỏi câu khác, tự động thoát luồng Đặt lịch)
  } else if (step === "booking_get_date") {
    // Chấp nhận ngày tháng nếu nó ngắn
    if (msg.length < 50) return { intent: "provide_date", date: message };
  } else if (step === "booking_get_service") {
    if (msg.length < 100) return { intent: "provide_service", service: message };
  }

  // Nếu rơi xuống đây (chưa có context hoặc đã thoát khỏi luồng do không hợp lệ)
  if (["xin chào", "hi", "hello"].some(k => msg.includes(k))) {
    return { intent: "greeting" };
  }
  
  // Dùng từ khóa chặt chẽ hơn để tránh hiểu lầm khi khách chỉ hỏi "lịch trống"
  if (["đặt lịch", "book", "tạo lịch", "muốn đặt", "đăng ký lịch"].some(k => msg.includes(k))) {
    return { intent: "book_appointment" };
  }

  // Tra cứu lịch trống thực tế (Dynamic Data)
  if (["lịch trống", "còn trống", "nào rảnh", "giờ nào", "còn giờ", "lịch đặt", "lịch hẹn"].some(k => msg.includes(k))) {
    
    // Thuật toán thô sơ bóc tách Ngày tháng (Giả lập Gemini)
    let targetDate = new Date();
    targetDate.setHours(0,0,0,0);

    if (msg.includes("mai")) {
      targetDate.setDate(targetDate.getDate() + 1);
    } else if (msg.includes("mốt") || msg.includes("kia")) {
      targetDate.setDate(targetDate.getDate() + 2);
    } else {
      const dayMatch = msg.match(/ngày\s*(\d{1,2})/);
      if (dayMatch) {
        const day = parseInt(dayMatch[1]);
        if (day >= 1 && day <= 31) {
          targetDate.setDate(day);
          // Nếu ngày nhập vào nhỏ hơn hôm nay (ví dụ hnay 25, khách đòi ngày 1), thì hiểu là mùng 1 tháng sau
          const today = new Date();
          today.setHours(0,0,0,0);
          if (targetDate < today) {
            targetDate.setMonth(targetDate.getMonth() + 1);
          }
        }
      }
    }
    
    return { intent: "check_schedule", targetDate: targetDate };
  }

  // Mặc định là tra cứu kiến thức chung (Pinecone RAG)
  return { intent: "search_service", query: message };
}

// 2. HANDLERS (Business Logic)
async function handleGreeting(context) {
  return {
    reply: "Dạ, em chào anh/chị. Em là trợ lý ảo của Gara. Anh/chị cần em tư vấn dịch vụ hay muốn đặt lịch hẹn sửa chữa ạ?",
    context: {}
  };
}

async function handleCancel(context) {
  return {
    reply: "Dạ vâng, em đã hủy thao tác đang làm. Anh/chị cần hỗ trợ gì khác không ạ?",
    context: {}
  };
}

async function handleSearchService(parsed, context) {
  const pineconeContext = await vectorStoreService.searchKnowledge(parsed.query);
  
  if (pineconeContext && pineconeContext !== "Không có tài liệu nào.") {
      const chunks = pineconeContext.split('\n\n').filter(Boolean);
      const bestMatch = chunks[0].replace(/\n/g, ' ');
      return {
          reply: `Dạ, theo thông tin em tra cứu được thì:\n👉 ${bestMatch}\n\nAnh/chị có muốn đặt lịch dịch vụ này không ạ?`,
          context: {}
      };
  }
  
  return {
      reply: "Dạ câu hỏi này hơi khó, em chưa tìm thấy thông tin chính xác. Anh/chị có thể gọi hotline để nhân viên tư vấn trực tiếp được không ạ?",
      context: {}
  };
}

async function handleCheckSchedule(parsed, context) {
  try {
    const { Op } = require('sequelize');
    const targetDate = parsed.targetDate || new Date();
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1); 

    const dateStr = `${targetDate.getDate()}/${targetDate.getMonth() + 1}`;

    // Lấy lịch hẹn trong ngày mục tiêu
    const appointments = await db.Appointments.findAll({
      where: {
        scheduled_time: { [Op.between]: [targetDate, nextDay] },
        status: { [Op.ne]: 'CANCELLED' } 
      },
      order: [['scheduled_time', 'ASC']]
    });

    // Các khung giờ chuẩn của Gara (8h sáng đến 16h chiều, nghỉ trưa 12h)
    const workingSlots = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];

    if (appointments.length === 0) {
      return {
        reply: `Dạ, vào **ngày ${dateStr}** Gara đang trống toàn bộ các khung giờ: **${workingSlots.join(", ")}**.\nAnh/chị muốn đặt lịch vào lúc mấy giờ để em giữ chỗ ạ?`,
        context: {}
      };
    }

    // Lọc ra các khung giờ đã bị đặt (lấy phần giờ, VD: 10h)
    const bookedHours = appointments.map(app => {
      const time = new Date(app.scheduled_time);
      return time.getHours().toString().padStart(2, '0'); // Lấy "10"
    });

    // Tìm các giờ còn trống
    const freeSlots = workingSlots.filter(slot => {
      const slotHour = slot.split(":")[0]; // Lấy "08"
      return !bookedHours.includes(slotHour);
    });

    if (freeSlots.length === 0) {
       return {
        reply: `Dạ rất tiếc, vào ngày ${dateStr} Gara đã KÍN LỊCH hoàn toàn. Anh/chị có muốn đặt lịch sang ngày khác không ạ?`,
        context: {}
      };
    }

    return {
      reply: `Dạ, ngày ${dateStr} Gara đã có khách ở một số khung giờ.\n👉 Hiện tại bên em CHỈ CÒN TRỐNG các giờ sau: **${freeSlots.join(", ")}**.\nAnh/chị muốn chốt đặt lịch vào giờ nào trong số này ạ?`,
      context: {} 
    };
  } catch (error) {
    console.error("Lỗi check lịch trống:", error);
    return {
      reply: "Dạ hệ thống kiểm tra lịch đang bận, anh/chị vui lòng gọi hotline để nhân viên xem lịch thực tế nhé!",
      context: {}
    };
  }
}

async function handleBookAppointment(parsed, context) {
  return {
    reply: "Dạ, anh/chị cho em xin **Số điện thoại** để em tiện lưu thông tin đặt lịch nhé (VD: 0901234567).",
    context: { step: "booking_get_phone" }
  };
}

async function handleProvidePhone(parsed, context) {
  return {
    reply: `Dạ vâng, em đã ghi nhận số điện thoại ${parsed.phone}.\nAnh/chị muốn đặt lịch vào **Ngày, giờ nào** ạ? (VD: Sáng mai lúc 9h)`,
    context: { ...context, step: "booking_get_date", phone: parsed.phone }
  };
}

async function handleProvideDate(parsed, context) {
  return {
    reply: `Dạ, lịch dự kiến là: ${parsed.date}.\nCuối cùng, anh/chị muốn **làm dịch vụ gì** hoặc xe đang gặp tình trạng gì ạ? (VD: Xe bị xì lốp, Cần thay nhớt...)`,
    context: { ...context, step: "booking_get_service", date: parsed.date }
  };
}

async function handleProvideService(parsed, context) {
  try {
    // Đủ thông tin -> Lưu thẳng vào Database (Bảng Appointments)
    // 1. Tìm hoặc tạo một user Khách Vãng Lai để gán vào Customer ID
    let guest = await db.Customers.findOne();
    if (!guest) {
        guest = await db.Customers.create({ full_name: 'Khách từ Chatbot', phone_number: context.phone, is_active: true });
    }

    await db.Appointments.create({
      customer_id: guest.id, 
      booking_type: 'ONLINE',
      scheduled_time: new Date(), // Vì khách nhập text tự do, ta lưu tạM thời gian hiện tại
      notes: `SĐT: ${context.phone} | Thời gian khách yêu cầu: ${context.date} | Dịch vụ: ${parsed.service}`,
      status: 'CONFIRMED'
    });

    return {
      reply: `🎉 Đặt lịch thành công!\n\n📋 **Thông tin lịch hẹn:**\n- SĐT: ${context.phone}\n- Thời gian: ${context.date}\n- Yêu cầu: ${parsed.service}\n\nNhân viên Gara sẽ gọi lại xác nhận cho anh/chị sớm nhất ạ!`,
      context: {}
    };
  } catch (error) {
    console.error("Lỗi tạo lịch hẹn:", error);
    return {
      reply: "Dạ hệ thống đang bận, anh/chị vui lòng thử lại sau hoặc gọi hotline nhé!",
      context: {}
    };
  }
}

// 3. MAIN CONTROLLER
const generateResponse = async (userMessage, history, context) => {
  try {
    // 3.1. Phân tích Intent
    const parsed = parseIntent(userMessage, context);
    console.log("[Mock NLU] Parsed Intent:", parsed);

    // 3.2. Giả lập delay suy nghĩ
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3.3. Routing State Machine
    let result;
    switch (parsed.intent) {
      case "greeting":
        result = await handleGreeting(context);
        break;
      case "cancel":
        result = await handleCancel(context);
        break;
      case "search_service":
        result = await handleSearchService(parsed, context);
        break;
      case "check_schedule":
        result = await handleCheckSchedule(parsed, context);
        break;
      case "book_appointment":
        result = await handleBookAppointment(parsed, context);
        break;
      case "provide_phone":
        result = await handleProvidePhone(parsed, context);
        break;
      case "provide_date":
        result = await handleProvideDate(parsed, context);
        break;
      case "provide_service":
        result = await handleProvideService(parsed, context);
        break;
      default:
        result = {
          reply: "Dạ, em chưa hiểu ý anh/chị lắm. Anh/chị có thể nói rõ hơn thông tin cần đặt lịch không ạ?",
          context
        };
    }

    return result;
  } catch (error) {
    console.error("Lỗi Chatbot:", error.message);
    return { reply: "Hệ thống đang bảo trì, vui lòng thử lại sau.", context: {} };
  }
};

module.exports = {
  generateResponse
};
