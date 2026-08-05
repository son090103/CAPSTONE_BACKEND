require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { RecursiveCharacterTextSplitter } = require("@langchain/textsplitters");
const { HuggingFaceInferenceEmbeddings } = require("@langchain/community/embeddings/hf");
const { Pinecone } = require("@pinecone-database/pinecone");
const { PineconeStore } = require("@langchain/pinecone");
const db = require('../models');

async function seedKnowledgeBase() {
  try {
    console.log("1. Đang đọc dữ liệu từ data/knowledge...");
    const filePath = path.join(__dirname, '../data/knowledge/quy_trinh_gara.txt');
    const content = fs.readFileSync(filePath, 'utf8');
    
    console.log("2. Đang cắt nhỏ văn bản (Chunking)...");
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 500,
      chunkOverlap: 50,
    });
    const docs = await splitter.createDocuments([content]);
    
    // Pinecone KHÔNG hỗ trợ lưu Metadata dạng object lồng nhau (như { loc: { lines: ... } } mà TextSplitter tự sinh ra).
    // Nếu để nguyên, thư viện sẽ lẳng lặng vứt bỏ document đó, dẫn đến lỗi "0 record to upsert".
    // Cách xử lý: Xóa sạch metadata trước khi lưu.
    const sanitizedDocs = docs.map(doc => {
      doc.metadata = {};
      return doc;
    });

    console.log(`-> Đã cắt thành ${sanitizedDocs.length} đoạn nhỏ.`);
    console.log("-> Nội dung đoạn 1:", sanitizedDocs[0]?.pageContent);
    
    console.log("3. Đang lấy dữ liệu từ Database (Service_Catalogs)...");
    const services = await db.Service_Catalog.findAll({
      where: { is_active: true }
    });
    
    const dbDocs = services.map(s => ({
       pageContent: `Dịch vụ: ${s.service_name}. Mô tả: ${s.description || 'Không có mô tả'}. Giá nhân công: ${Number(s.labor_price).toLocaleString('vi-VN')} VNĐ. Thời gian dự kiến: ${s.estimated_duration} phút.`,
       metadata: {}
    }));
    
    console.log(`-> Lấy được ${dbDocs.length} dịch vụ từ Database.`);
    
    const allDocs = [...sanitizedDocs, ...dbDocs];
    
    // Đổi sang HuggingFace vì Google API Key bị lỗi 404
    // Model all-mpnet-base-v2 hỗ trợ chính xác 768 dimensions (khớp với Pinecone)
    const embeddings = new HuggingFaceInferenceEmbeddings({
      model: "sentence-transformers/all-mpnet-base-v2",
      apiKey: process.env.HUGGINGFACE_API_KEY?.trim()
    });
    
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    
    // Tên index mặc định nếu bạn không cấu hình
    const indexName = process.env.PINECONE_INDEX || "gara-index";
    const pineconeIndex = pinecone.Index(indexName);
    
    console.log(`4. Đang upload ${allDocs.length} vectors lên Pinecone Index [${indexName}]...`);
    
    // Test API Embeddings
    console.log("-> Đang test thử gọi Embedding API...");
    const testEmbed = await embeddings.embedQuery("test");
    console.log("-> Kết quả test embed (length):", testEmbed?.length);
    
    console.log("-> Đang tạo Embeddings cho dữ liệu...");
    const texts = allDocs.map(doc => doc.pageContent);
    const docsEmbed = await embeddings.embedDocuments(texts);
    console.log("-> Kết quả embedDocuments (số vector, số chiều):", docsEmbed?.length, docsEmbed?.[0]?.length);
    
    // Tự động đẩy lên bằng Pinecone SDK (Bỏ qua lỗi của Langchain)
    const records = allDocs.map((doc, index) => ({
      id: `knowledge-${index}`,
      values: docsEmbed[index],
      metadata: { text: doc.pageContent }
    }));

    await pineconeIndex.upsert({ records });
    
    console.log("✅ Hoàn tất upload kiến thức tĩnh lên Pinecone!");
  } catch (error) {
    console.error("❌ Lỗi khi Seed Data:", error);
  }
}

if (require.main === module) {
  seedKnowledgeBase();
}

module.exports = seedKnowledgeBase;
