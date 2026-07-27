const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const vectorStoreService = require('./vectorStore.service');
const db = require('../../../models');

// Cấu hình Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Schema ép kiểu JSON cho Gemini
const intentSchema = {
  type: SchemaType.OBJECT,
  properties: {
    intent: {
      type: SchemaType.STRING,
      description: "Ý định của khách hàng. Phải là 1 trong các giá trị: greeting, cancel, book_appointment, provide_phone, provide_date, provide_service, check_schedule, search_service, unknown",
    },
    targetDate: {
      type: SchemaType.STRING,
      description: "Dành cho check_schedule. Ngày khách muốn tra cứu, định dạng YYYY-MM-DD. Tự tính nếu khách nói 'ngày mai', 'mốt'. Trả về rỗng nếu không có.",
    },
    phone: {
      type: SchemaType.STRING,
      description: "Số điện thoại khách hàng (chỉ trích xuất nếu có dãy số).",
    },
    date: {
      type: SchemaType.STRING,
      description: "Chuỗi ngày/thời gian khách muốn đặt lịch.",
    },
    service: {
      type: SchemaType.STRING,
      description: "Tên dịch vụ, yêu cầu hoặc triệu chứng lỗi xe khách hàng cung cấp.",
    },
    query: {
      type: SchemaType.STRING,
      description: "Nội dung câu hỏi của khách nếu hỏi thông tin chung (search_service).",
    }
  },
  required: ["intent"],
};

// ==========================================
// TẦNG 1: ĐỌC HIỂU (NLU)
// ==========================================
async function analyzeIntentWithGemini(message, context) {
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: intentSchema,
    },
  });

  const prompt = `
  Bạn là AI Trợ lý của Gara ô tô. Nhiệm vụ của bạn là phân tích câu nói của khách hàng và phân loại ý định (intent).
  Ngữ cảnh hiện tại của phiên chat (trạng thái luồng đặt lịch): ${JSON.stringify(context || {})}
  
  LUẬT PHÂN LOẠI:
  1. Nếu ngữ cảnh đang là {"step": "booking_get_phone"}: Hãy tìm số điện thoại. Nếu có SĐT -> intent: "provide_phone". Nếu KHÔNG có SĐT mà khách hỏi câu khác -> intent chuyển sang câu hỏi đó.
  2. Nếu ngữ cảnh đang là {"step": "booking_get_date"}: Lấy ngày giờ -> intent: "provide_date".
  3. Nếu ngữ cảnh đang là {"step": "booking_get_service"}: Lấy thông tin -> intent: "provide_service".
  4. Nếu khách hỏi "lịch rảnh", "giờ trống", "còn trống không", "hôm nay rảnh không" -> intent: "check_schedule".
  5. Nếu khách bảo muốn "đặt lịch", "tạo lịch", "book" -> intent: "book_appointment".
  6. Nếu khách hỏi giá, quy trình, bảo hành, hỏi dịch vụ -> intent: "search_service", đồng thời điền câu hỏi vào field 'query'.
  7. Nếu khách bảo "thôi", "hủy", "không cần" -> intent: "cancel".
  8. Nếu khách chào hỏi chung chung -> intent: "greeting".
  
  Câu nói của khách: "${message}"
  `;

  try {
    const result = await model.generateContent(prompt);
    const parsed = JSON.parse(result.response.text());
    console.log("[Tầng 1 - NLU] Phân tích Ý định:", parsed);
    return parsed;
  } catch (error) {
    console.error("Lỗi gọi Gemini NLU:", error);
    return { intent: "search_service", query: message };
  }
}

// ==========================================
// TẦNG 2: XỬ LÝ LOGIC (Lấy Data Thô từ Database)
// ==========================================
async function handleGreeting(context) {
  return { rawData: { action: "Chào hỏi khách hàng và hỏi xem họ cần hỗ trợ gì (ví dụ: đặt lịch, tra cứu giá...)." }, context: {} };
}

async function handleCancel(context) {
  return { rawData: { action: "Xác nhận đã hủy thao tác thành công và hỏi khách có cần hỗ trợ gì khác không." }, context: {} };
}

async function handleSearchService(parsed, context, userMessage) {
  const query = parsed.query || userMessage;
  const pineconeContext = await vectorStoreService.searchKnowledge(query);
  
  const services = await db.Service_Catalog.findAll({ 
      where: { is_active: true },
      include: [{
          model: db.Spare_Parts,
          as: 'sparePart',
          attributes: ['name', 'retail_price']
      }]
  });
  
  const catalogList = services.map(s => {
      let total = Number(s.labor_price) || 0;
      let partStr = '';
      if (s.sparePart && s.sparePart.retail_price) {
          const partPrice = Number(s.sparePart.retail_price);
          total += partPrice;
          partStr = ` (Tiền công: ${Number(s.labor_price).toLocaleString('vi-VN')}đ + Phụ tùng ${s.sparePart.name}: ${partPrice.toLocaleString('vi-VN')}đ)`;
      } else {
          partStr = ` (Chỉ tính tiền công)`;
      }
      return `- ${s.service_name} | Tổng giá: ${total.toLocaleString('vi-VN')} VNĐ ${partStr}`;
  }).join("\n");

  return {
    rawData: {
      action: "Khách đang hỏi/kể bệnh. Hãy suy luận dựa vào Bảng giá để chọn Dịch vụ phù hợp tư vấn cho khách. Kèm theo Tài liệu nếu cần thiết.",
      catalogList,
      pineconeContext
    },
    context: {}
  };
}

async function handleCheckSchedule(parsed, context) {
  try {
    const garageConfigService = require('../common/garage_configurations.service');
    const targetDate = parsed.targetDate ? new Date(parsed.targetDate) : new Date();
    
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const d = String(targetDate.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    const displayDateStr = `${d}/${m}/${y}`;

    const availability = await garageConfigService.getAvailability(dateStr);
    
    if (availability.capacity === 0) {
       return { rawData: { status: "GARAGE_CLOSED", message: "Gara hiện đang không có khả năng tiếp nhận thêm xe." }, context: {} };
    }

    let allWorkingHours = [];
    if (availability.shifts && availability.shifts.length > 0) {
       availability.shifts.forEach(shift => {
          let startH = parseInt(shift.start_time.split(':')[0]);
          let endH = parseInt(shift.end_time.split(':')[0]);
          for(let h = startH; h < endH; h++) { allWorkingHours.push(h); }
       });
    } else {
       allWorkingHours = [8, 9, 10, 11, 13, 14, 15, 16];
    }

    // Lọc ra các giờ chưa bị quá tải
    let freeHours = allWorkingHours.filter(h => (availability.bookedCounts[h] || 0) < availability.capacity);

    // [QUAN TRỌNG] Tránh việc book giờ trong quá khứ nếu đang xem lịch ngày hôm nay
    const now = new Date();
    const isToday = (y === now.getFullYear() && parseInt(m) === now.getMonth() + 1 && parseInt(d) === now.getDate());
    
    if (isToday) {
       const currentHour = now.getHours();
       // Lọc bỏ các giờ cũ. Dư ra 1 tiếng để kịp đi lại (buffer)
       freeHours = freeHours.filter(h => h > currentHour);
    }

    const freeSlotsStr = freeHours.map(h => `${String(h).padStart(2, '0')}:00`);

    if (freeSlotsStr.length === 0) {
       return { rawData: { status: "FULLY_BOOKED", targetDate: displayDateStr, message: "Gara đã KÍN LỊCH hoàn toàn. Hãy đề xuất khách chuyển sang ngày khác." }, context: {} };
    }

    return { rawData: { status: "AVAILABLE", targetDate: displayDateStr, freeSlots: freeSlotsStr, message: "Hãy báo cáo các khung giờ trống cho khách và hỏi họ muốn chọn giờ nào." }, context: {} };
  } catch (error) {
    console.error("Lỗi check lịch trống:", error);
    return { rawData: { status: "ERROR", message: "Hệ thống kiểm tra lịch đang bảo trì." }, context: {} };
  }
}

async function handleBookAppointment(parsed, context) {
  return { rawData: { action: "Bắt đầu quy trình đặt lịch. Hãy yêu cầu khách cung cấp SỐ ĐIỆN THOẠI để tiện liên hệ." }, context: { step: "booking_get_phone" } };
}

async function handleProvidePhone(parsed, context) {
  return { rawData: { action: "Xác nhận đã nhận số điện thoại. Tiếp theo, hãy hỏi khách muốn đặt lịch vào NGÀY, GIỜ nào.", phoneReceived: parsed.phone }, context: { ...context, step: "booking_get_date", phone: parsed.phone } };
}

async function handleProvideDate(parsed, context) {
  return { rawData: { action: "Xác nhận đã nhận thời gian. Cuối cùng, hãy hỏi khách xe đang bị gì hoặc muốn làm DỊCH VỤ gì.", dateReceived: parsed.date }, context: { ...context, step: "booking_get_service", date: parsed.date } };
}

async function handleProvideService(parsed, context) {
  try {
    let guest = await db.Customers.findOne({ where: { phone_number: context.phone } });
    if (!guest) {
        guest = await db.Customers.create({ full_name: 'Khách từ Chatbot', phone_number: context.phone, is_active: true });
    }

    await db.Appointments.create({
      customer_id: guest.id, 
      booking_type: 'ONLINE',
      scheduled_time: new Date(), 
      notes: `SĐT: ${context.phone} | Khách ghi chú t/g: ${context.date} | Dịch vụ: ${parsed.service}`,
      status: 'CONFIRMED'
    });

    return {
      rawData: { 
        status: "SUCCESS", 
        action: "Thông báo đặt lịch thành công. Nhân viên sẽ sớm gọi điện xác nhận.",
        appointmentDetails: { phone: context.phone, date: context.date, service_requested: parsed.service }
      },
      context: {}
    };
  } catch (error) {
    console.error("Lỗi tạo lịch hẹn:", error);
    return { rawData: { status: "ERROR", message: "Lỗi hệ thống khi tạo lịch." }, context: {} };
  }
}

// ==========================================
// TẦNG 3: ĂN NÓI (Generative Language)
// ==========================================
async function generateFinalReplyWithGemini(userMessage, parsed, rawData, context) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  
  const prompt = `Bạn là nhân viên tư vấn cực kỳ thông minh, duyên dáng và chuyên nghiệp của Gara ô tô.
Khách hàng vừa nhắn: "${userMessage}"
Ý định của khách (hệ thống đã phân tích): ${parsed.intent}

DỮ LIỆU TỪ HỆ THỐNG GARA TRẢ VỀ (Raw Data):
"""
${JSON.stringify(rawData, null, 2)}
"""

NHIỆM VỤ CỦA BẠN:
Đóng vai nhân viên lễ tân, sử dụng "DỮ LIỆU TỪ HỆ THỐNG GARA TRẢ VỀ" để viết một câu trả lời gửi cho khách.
- Tuyệt đối không để lộ đây là dữ liệu máy tính (như không nói "Theo JSON", "Theo rawData").
- Tùy biến văn phong đa dạng, không lặp lại y chang các câu máy móc.
- Nếu hệ thống yêu cầu "action" (VD: xin số điện thoại, xin ngày), hãy khéo léo hỏi khách.
- [QUAN TRỌNG] Trình bày câu trả lời phải thật ĐẸP:
  + Dùng dấu xuống dòng (\\n) để chia đoạn văn cho dễ đọc.
  + Nếu liệt kê (giá cả, lịch rảnh), BẮT BUỘC dùng dấu gạch ngang (-) ở đầu mỗi dòng.
  + TUYỆT ĐỐI KHÔNG dùng dấu sao (*) để làm gạch đầu dòng hoặc in đậm (không dùng **).
- Luôn giữ thái độ thân thiện, nhiệt tình.`;

  try {
    const result = await model.generateContent(prompt);
    console.log("[Tầng 3 - NLG] AI sinh câu trả lời thành công.");
    return result.response.text();
  } catch(e) {
    console.error("Lỗi Tầng 3 (NLG):", e);
    return "Dạ, hiện tại hệ thống AI bên em đang quá tải, anh/chị vui lòng gọi hotline để được hỗ trợ nhé!";
  }
}

// ==========================================
// TRUNG TÂM ĐIỀU PHỐI (Main Controller)
// ==========================================
const generateResponse = async (userMessage, history, context) => {
  try {
    // Tầng 1: Đọc Hiểu
    const parsed = await analyzeIntentWithGemini(userMessage, context);

    // Tầng 2: Đi lấy Raw Data
    let result;
    switch (parsed.intent) {
      case "greeting": result = await handleGreeting(context); break;
      case "cancel": result = await handleCancel(context); break;
      case "search_service": result = await handleSearchService(parsed, context, userMessage); break;
      case "check_schedule": result = await handleCheckSchedule(parsed, context); break;
      case "book_appointment": result = await handleBookAppointment(parsed, context); break;
      case "provide_phone": result = await handleProvidePhone(parsed, context); break;
      case "provide_date": result = await handleProvideDate(parsed, context); break;
      case "provide_service": result = await handleProvideService(parsed, context); break;
      default: result = { rawData: { action: "Em chưa hiểu rõ ý anh/chị. Yêu cầu khách diễn đạt lại rõ hơn." }, context };
    }

    // Tầng 3: Nhờ AI vắt óc viết câu trả lời dựa trên Raw Data
    const finalReply = await generateFinalReplyWithGemini(userMessage, parsed, result.rawData, context);

    return { reply: finalReply, context: result.context };
  } catch (error) {
    console.error("Lỗi Chatbot Controller:", error.message);
    return { reply: "Hệ thống AI đang bảo trì, vui lòng thử lại sau.", context: {} };
  }
};

module.exports = {
  generateResponse
};
