const db = require("../../../models"); // Truy cập DB
const { buildRagDocuments, RAG_TYPES } = require('./ragDocumentBuilder');

// Bản multilingual giữ cùng 768 chiều với MPNet cũ nhưng hiểu truy vấn tiếng Việt tốt hơn.
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'sentence-transformers/paraphrase-multilingual-mpnet-base-v2';
const PINECONE_NAMESPACE = process.env.PINECONE_NAMESPACE || 'garage-knowledge-v1';

let vectorStore = null;

const getVectorStore = async () => {
  if (!vectorStore) {
    const { Pinecone } = require("@pinecone-database/pinecone");
    const { HuggingFaceInferenceEmbeddings } = require("@langchain/community/embeddings/hf");
    const { PineconeStore } = require("@langchain/pinecone");
    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    const indexName = process.env.PINECONE_INDEX || "gara-index";
    const pineconeIndex = pinecone.Index(indexName);
    
    const embeddings = new HuggingFaceInferenceEmbeddings({
      model: EMBEDDING_MODEL,
      apiKey: process.env.HUGGINGFACE_API_KEY?.trim()
    });

    vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex,
      namespace: PINECONE_NAMESPACE,
    });
  }
  return vectorStore;
};

const searchKnowledge = async (query, filters = {}) => {
  try {
    console.log("Đang query Pinecone tìm thông tin liên quan:", query);
    
    const store = await getVectorStore();
    const cleanQuery = String(query || '').trim().slice(0, 1000);
    if (!cleanQuery) return "Không có nội dung để tra cứu.";
    const pineconeFilter = Object.keys(filters).length ? filters : undefined;
    const results = await store.similaritySearchWithScore(cleanQuery, 5, pineconeFilter);
    
    if (!results || results.length === 0) {
      return "Không tìm thấy thông tin nào trong tài liệu của Gara.";
    }

    // Nối các kết quả lại thành 1 đoạn văn bản dài
    const relevant = results.filter(([, score]) => Number.isFinite(score) && score >= 0.25);
    if (!relevant.length) return "Không tìm thấy tài liệu đủ độ liên quan trong kho tri thức của Gara.";
    const context = relevant.map(([doc, score]) =>
      `[Nguồn ${doc.metadata?.type || 'knowledge'} #${doc.metadata?.source_id || 'N/A'} | độ liên quan ${score.toFixed(2)}]\n${doc.pageContent}`
    ).join("\n\n");
    console.log("Tìm thấy tài liệu liên quan:", context);
    
    return context;
  } catch (error) {
    console.error("Lỗi khi tìm kiếm trên Pinecone:", error);
    // Trả về string rỗng hoặc báo lỗi để LLM tự xử lý
    return "Hệ thống tra cứu tài liệu tạm thời không khả dụng.";
  }
};

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const syncAllKnowledgeToPinecone = async ({ dryRun = false, replace = true, types = RAG_TYPES } = {}) => {
  const selectedTypes = types || RAG_TYPES;
  const { groups, documents } = await buildRagDocuments(selectedTypes);
  const summary = Object.fromEntries(groups.map(group => [group.type, group.documents.length]));
  console.log('[RAG Sync] Tài liệu đã tạo:', summary);

  if (dryRun) return { dryRun: true, total: documents.length, namespace: PINECONE_NAMESPACE, types: summary };
  if (!process.env.PINECONE_API_KEY) throw new Error('Thiếu PINECONE_API_KEY');
  if (!process.env.HUGGINGFACE_API_KEY) throw new Error('Thiếu HUGGINGFACE_API_KEY');
  if (!documents.length) throw new Error('Không có tài liệu RAG để đồng bộ');

  const { Pinecone } = require('@pinecone-database/pinecone');
  const { HuggingFaceInferenceEmbeddings } = require('@langchain/community/embeddings/hf');
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
  const indexName = process.env.PINECONE_INDEX || 'gara-index';
  const namespace = pinecone.Index(indexName).namespace(PINECONE_NAMESPACE);
  const embeddings = new HuggingFaceInferenceEmbeddings({
    model: EMBEDDING_MODEL,
    apiKey: process.env.HUGGINGFACE_API_KEY.trim()
  });

  // Chỉ xóa toàn namespace khi sync đầy đủ. Sync một vài type chỉ upsert để không làm mất type khác.
  const isFullSync = selectedTypes.length === RAG_TYPES.length && RAG_TYPES.every(type => selectedTypes.includes(type));
  if (replace && isFullSync) {
    console.log(`[RAG Sync] Xóa namespace cũ: ${PINECONE_NAMESPACE}`);
    try {
      await namespace.deleteAll();
    } catch (error) {
      const status = error?.status || error?.response?.status || error?.cause?.status;
      if (status !== 404 && !String(error?.message || '').includes('HTTP status 404')) throw error;
      console.log('[RAG Sync] Namespace chưa tồn tại/rỗng, tiếp tục upsert.');
    }
  }

  let upserted = 0;
  for (const batch of chunk(documents, 32)) {
    const vectors = await embeddings.embedDocuments(batch.map(item => item.text));
    const records = batch.map((item, index) => ({
      id: item.id,
      values: vectors[index],
      metadata: { text: item.text, embedding_model: EMBEDDING_MODEL, indexed_at: new Date().toISOString(), ...item.metadata }
    }));
    for (const recordBatch of chunk(records, 50)) await namespace.upsert({ records: recordBatch });
    upserted += records.length;
    console.log(`[RAG Sync] ${upserted}/${documents.length}`);
  }

  vectorStore = null;
  return { dryRun: false, total: documents.length, upserted, namespace: PINECONE_NAMESPACE, index: indexName, types: summary };
};

// Giữ tên cũ để các service admin hiện tại tiếp tục hoạt động.
const syncAllServicesToPinecone = () => syncAllKnowledgeToPinecone();

module.exports = {
  searchKnowledge,
  syncAllServicesToPinecone,
  syncAllKnowledgeToPinecone
};
