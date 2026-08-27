// RAG riêng biệt cho tài liệu kỹ thuật (PDF admin upload theo hãng xe), TÁCH HOÀN TOÀN khỏi
// vectorStore.service.js (Pinecone dùng cho chatbot khách hàng) — dùng tài khoản Pinecone khác,
// namespace/index khác, để dữ liệu 2 luồng không lẫn lộn và không ảnh hưởng lẫn nhau khi có
// sự cố ở 1 trong 2 tài khoản.
const { buildTechnicalDocumentChunks } = require('./ragDocumentBuilder');

// Dùng chung model + biến embedding với luồng cũ để không phải xin thêm quyền Hugging Face mới,
// nhưng vector này chỉ tồn tại trong tài khoản Pinecone riêng của tài liệu kỹ thuật.
const EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'sentence-transformers/paraphrase-multilingual-mpnet-base-v2';
const TECHNICAL_PINECONE_NAMESPACE = 'technical-documents-v1';

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

const requireEnv = () => {
  if (!process.env.TECHNICAL_PINECONE_API_KEY) throw new Error('Thiếu TECHNICAL_PINECONE_API_KEY');
  if (!process.env.TECHNICAL_PINECONE_INDEX) throw new Error('Thiếu TECHNICAL_PINECONE_INDEX');
  if (!process.env.HUGGINGFACE_API_KEY) throw new Error('Thiếu HUGGINGFACE_API_KEY');
};

const getNamespace = () => {
  const { Pinecone } = require('@pinecone-database/pinecone');
  const pinecone = new Pinecone({ apiKey: process.env.TECHNICAL_PINECONE_API_KEY });
  return pinecone.Index(process.env.TECHNICAL_PINECONE_INDEX).namespace(TECHNICAL_PINECONE_NAMESPACE);
};

let vectorStore = null;
const getVectorStore = async () => {
  if (!vectorStore) {
    requireEnv();
    const { HuggingFaceInferenceEmbeddings } = require('@langchain/community/embeddings/hf');
    const { PineconeStore } = require('@langchain/pinecone');
    const embeddings = new HuggingFaceInferenceEmbeddings({
      model: EMBEDDING_MODEL,
      apiKey: process.env.HUGGINGFACE_API_KEY?.trim()
    });
    vectorStore = await PineconeStore.fromExistingIndex(embeddings, {
      pineconeIndex: getNamespace(),
      namespace: TECHNICAL_PINECONE_NAMESPACE,
    });
  }
  return vectorStore;
};

// Tra cứu đoạn tài liệu kỹ thuật liên quan nhất, lọc theo make_id — dùng trong aiSuggestCauses.
// Không throw lỗi ra ngoài: RAG là bổ trợ, lỗi ở đây không nên chặn luồng "Tham khảo AI" chính.
const searchKnowledge = async (query, makeId) => {
  try {
    const store = await getVectorStore();
    const cleanQuery = String(query || '').trim().slice(0, 1000);
    if (!cleanQuery) return '';
    const results = await store.similaritySearchWithScore(cleanQuery, 4, { make_id: makeId });
    const relevant = results.filter(([, score]) => Number.isFinite(score) && score >= 0.25);
    if (!relevant.length) return '';
    return relevant.map(([doc]) => doc.pageContent).join('\n\n');
  } catch (error) {
    console.error('Lỗi khi tra cứu tài liệu kỹ thuật trên Pinecone riêng:', error);
    return '';
  }
};

// Upsert các chunk của 1 tài liệu vừa upload lên Pinecone riêng — gọi ngay trong lúc admin
// tải file lên, không cần chạy lệnh đồng bộ thủ công.
const upsertDocument = async (row) => {
  requireEnv();
  const documents = await buildTechnicalDocumentChunks(row);
  if (!documents.length) return { upserted: 0 };

  const { HuggingFaceInferenceEmbeddings } = require('@langchain/community/embeddings/hf');
  const embeddings = new HuggingFaceInferenceEmbeddings({
    model: EMBEDDING_MODEL,
    apiKey: process.env.HUGGINGFACE_API_KEY.trim()
  });
  const namespace = getNamespace();

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
  }

  vectorStore = null;
  return { upserted };
};

// Xóa vector của 1 tài liệu khi admin xóa record trong DB — tránh để lại rác trên Pinecone.
const deleteDocument = async (row) => {
  if (!process.env.TECHNICAL_PINECONE_API_KEY) return;
  const documents = await buildTechnicalDocumentChunks(row);
  if (!documents.length) return;
  const namespace = getNamespace();
  for (const idBatch of chunk(documents.map(d => d.id), 100)) {
    await namespace.deleteMany({ ids: idBatch });
  }
  vectorStore = null;
};

module.exports = { searchKnowledge, upsertDocument, deleteDocument };
