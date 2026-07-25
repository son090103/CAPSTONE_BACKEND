const { Pinecone } = require("@pinecone-database/pinecone");
const { HuggingFaceInferenceEmbeddings } = require("@langchain/community/embeddings/hf");
const { PineconeStore } = require("@langchain/pinecone");
const db = require("../../../models"); // Truy cập DB

let vectorStore = null;

const getVectorStore = async () => {
  if (!vectorStore) {
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    const indexName = process.env.PINECONE_INDEX || "gara-index";
    const pineconeIndex = pinecone.Index(indexName);
    
    const embeddings = new HuggingFaceInferenceEmbeddings({
      model: "sentence-transformers/all-mpnet-base-v2",
      apiKey: process.env.HUGGINGFACE_API_KEY?.trim()
    });

    vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
    });
  }
  return vectorStore;
};

const searchKnowledge = async (query) => {
  try {
    console.log("Đang query Pinecone tìm thông tin liên quan:", query);
    
    const store = await getVectorStore();
    // Lấy top 3 kết quả liên quan nhất
    const results = await store.similaritySearch(query, 3);
    
    if (!results || results.length === 0) {
      return "Không tìm thấy thông tin nào trong tài liệu của Gara.";
    }

    // Nối các kết quả lại thành 1 đoạn văn bản dài
    const context = results.map(doc => doc.pageContent).join("\n\n");
    console.log("Tìm thấy tài liệu liên quan:", context);
    
    return context;
  } catch (error) {
    console.error("Lỗi khi tìm kiếm trên Pinecone:", error);
    // Trả về string rỗng hoặc báo lỗi để LLM tự xử lý
    return "Hệ thống tra cứu tài liệu tạm thời không khả dụng.";
  }
};

const syncAllServicesToPinecone = async () => {
  try {
    console.log("[Background Job] Bắt đầu đồng bộ Dịch vụ lên Pinecone...");
    const services = await db.Service_Catalog.findAll({
      where: { is_active: true }
    });

    if (services.length === 0) {
      console.log("[Background Job] Không có dịch vụ nào đang active.");
      return;
    }

    const docs = services.map(s => ({
      id: `service-${s.id}`, // Đánh ID chuẩn xác để đè/cập nhật
      text: `Dịch vụ: ${s.service_name}. Mô tả: ${s.description || 'Không có mô tả'}. Giá nhân công: ${Number(s.labor_price).toLocaleString('vi-VN')} VNĐ. Thời gian dự kiến: ${s.estimated_duration} phút.`
    }));

    const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
    const indexName = process.env.PINECONE_INDEX || "gara-index";
    const pineconeIndex = pinecone.Index(indexName);

    // Gọi API nhúng của HuggingFace thủ công (vì Langchain hay lỗi)
    const { HfInference } = require('@huggingface/inference');
    const hf = new HfInference(process.env.HUGGINGFACE_API_KEY?.trim());
    
    // Tạo embeddings cho tất cả document
    const embeddings = await hf.featureExtraction({
      model: "sentence-transformers/all-mpnet-base-v2",
      inputs: docs.map(d => d.text)
    });

    // Ép kiểu mảng nhiều chiều từ HF thành mảng 1 chiều cho Pinecone
    // featureExtraction có thể trả về [num_docs, num_tokens, num_features] hoặc [num_docs, num_features]
    // Hàm này giả định ta lấy vector đầu tiên nếu có 3 chiều (VD: pooler output / cls token)
    const parsedEmbeddings = Array.isArray(embeddings[0][0]) 
      ? embeddings.map(e => e[0]) // Lấy token đầu tiên nếu là 3D
      : embeddings;

    const records = docs.map((doc, index) => ({
      id: doc.id,
      values: parsedEmbeddings[index],
      metadata: { text: doc.text }
    }));

    await pineconeIndex.upsert(records);
    console.log(`[Background Job] ✅ Đồng bộ thành công ${records.length} dịch vụ lên Pinecone!`);

  } catch (error) {
    console.error("[Background Job] ❌ Lỗi đồng bộ Pinecone:", error.message);
  }
};

module.exports = {
  searchKnowledge,
  syncAllServicesToPinecone
};
