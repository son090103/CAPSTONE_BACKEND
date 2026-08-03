/** @type {import("sequelize").ModelStatic<import("sequelize").Model>} */
const { Op } = require("sequelize");
const { where } = require("sequelize");
const db = require("../../../models");
const { getHfInference } = require("../../util/huggingFace.util");

const syncVectorStoreInBackground = () => {
  try {
    const vectorStoreService = require("../ai/vectorStore.service");
    vectorStoreService
      .syncAllServicesToPinecone()
      .catch((error) => console.error("Lỗi Background Sync:", error));
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
    console.warn("Thiếu dependency Pinecone; tạm bỏ qua đồng bộ vector dịch vụ.");
  }
};

const Service_Categories = db.Service_Categories;
const Service_Catalog = db.Service_Catalog;

const NLLB_LANG_MAP = {
  en: 'eng_Latn'
};
async function applyCatalogTranslations(t, catalogId, serviceName, description) {
  console.log("--- Bắt đầu applyCatalogTranslations ---");
  const hfToken = process.env.HUGGINGFACE_API_KEY;
  console.log("Có HuggingFace Token không?", !!hfToken);

  if (!hfToken || !db.Languages || !db.Service_Catalog_Translations) {
    console.log("Thiếu cấu hình HF Token hoặc Model DB!");
    return;
  }

  const hf = getHfInference(hfToken);
  if (!hf) return;

  const languages = await db.Languages.findAll({
    where: { id: 'en' },
    transaction: t
  });

  if (languages.length === 0) return;

  const translationsToInsert = [];
  for (const lang of languages) {
    const tgtLangCode = NLLB_LANG_MAP[lang.id];
    if (!tgtLangCode) {
      translationsToInsert.push({ serviceCatalogId: catalogId, languageId: lang.id, name: serviceName, description: description });
      continue;
    }

    try {
      let translatedName = serviceName;
      if (serviceName) {
        const resName = await hf.translation({
          model: 'Helsinki-NLP/opus-mt-vi-en',
          inputs: serviceName
        }, { use_cache: false, wait_for_model: true });
        if (resName && resName.translation_text) translatedName = resName.translation_text;
        else if (Array.isArray(resName) && resName.length > 0) translatedName = resName[0].translation_text;
      }

      let translatedDesc = description;
      if (description) {
        const resDesc = await hf.translation({
          model: 'Helsinki-NLP/opus-mt-vi-en',
          inputs: description
        }, { use_cache: false, wait_for_model: true });
        if (resDesc && resDesc.translation_text) translatedDesc = resDesc.translation_text;
        else if (Array.isArray(resDesc) && resDesc.length > 0) translatedDesc = resDesc[0].translation_text;
      }

      translationsToInsert.push({
        serviceCatalogId: catalogId,
        languageId: lang.id,
        name: translatedName,
        description: translatedDesc
      });
    } catch (err) {
      console.error(`Lỗi dịch HF sang ${lang.id}:`, err);
      translationsToInsert.push({ serviceCatalogId: catalogId, languageId: lang.id, name: serviceName, description: description });
    }
  }

  if (translationsToInsert.length > 0) {
    await db.Service_Catalog_Translations.destroy({ where: { serviceCatalogId: catalogId }, transaction: t });
    await db.Service_Catalog_Translations.bulkCreate(translationsToInsert, { transaction: t });
  }
}
const normalizeBoolean = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return undefined;
};

const buildCatalogWhere = ({ q, category_id, is_active } = {}) => {
  const where = {};

  if (category_id !== undefined && category_id !== null && category_id !== "") {
    const parsedCategoryId = Number(category_id);
    if (Number.isInteger(parsedCategoryId) && parsedCategoryId > 0) {
      where.category_id = parsedCategoryId;
    }
  }

  const normalizedIsActive = normalizeBoolean(is_active);
  if (normalizedIsActive !== undefined) {
    where.is_active = normalizedIsActive;
  }

  if (q) {
    const keyword = q.toString().trim();
    if (keyword) {
      where[Op.or] = [
        { service_name: { [Op.iLike]: `%${keyword}%` } },
        { description: { [Op.iLike]: `%${keyword}%` } },
      ];
    }
  }

  return where;
};

module.exports.getServiceCategories = async () => {
  const categories = await Service_Categories.findAll({
    attributes: ["id", "category_name"],
  });
  return categories;
};

module.exports.createServiceCatalog = async (category_id, service_name, description, estimated_duration, is_active, labor_price, spare_part_id) => {
  const category = await Service_Categories.findOne({
    where: { id: category_id }
  });
  if (!category) {
    throw { status: 404, message: "Danh mục không tồn tại" }
  }

  const t = await db.sequelize.transaction();
  try {
    const serviceCatalog = await Service_Catalog.create({
      category_id: category_id,
      service_name: service_name,
      description: description,
      estimated_duration: estimated_duration,
      is_active: is_active,
      labor_price: labor_price || 0,
      spare_part_id: spare_part_id || null
    }, { transaction: t });

    await applyCatalogTranslations(t, serviceCatalog.id, service_name, description);

    await t.commit();

    // [Real-time AI Sync] Chạy ngầm đồng bộ lên Pinecone mà không dùng await để không bắt Admin chờ
    syncVectorStoreInBackground();

    return serviceCatalog;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

module.exports.getServiceCatalog = async (filters = {}) => {
  const { page, limit, all, ...rest } = filters;
  const userWhere = buildCatalogWhere(rest);

  const queryOptions = {
    where: userWhere,
    attributes: ["id", "category_id", "service_name", "description", "estimated_duration", "labor_price", "spare_part_id", "is_active", "createdAt", "updatedAt"],
    include: [
      {
        model: Service_Categories,
        as: 'category',
        attributes: ['category_name']
      },
      {
        model: db.Spare_Parts,
        as: 'sparePart',
        attributes: ['id', 'sku', 'name', 'retail_price']
      }

    ],
    order: [["createdAt", "DESC"]],
  };
  if (db.Service_Catalog_Translations) {
    queryOptions.include.push({
      model: db.Service_Catalog_Translations,
      as: "translations",
    });
  }

  const { mapServicePrices } = require('../../util/calculateServicePrice.util');

  if (all || !page) {
    const serviceCatalog = await Service_Catalog.findAll(queryOptions);
    return mapServicePrices(serviceCatalog);
  }

  const pageNum = Number(page) || 1;
  const limitNum = Number(limit) || 20;
  const offsetNum = (pageNum - 1) * limitNum;

  queryOptions.limit = limitNum;
  queryOptions.offset = offsetNum;

  const { count, rows } = await Service_Catalog.findAndCountAll(queryOptions);

  const activeCount = await Service_Catalog.count({
    where: {
      ...userWhere,
      is_active: true
    }
  });

  return {
    page: pageNum,
    limit: limitNum,
    total: count,
    totalActive: activeCount,
    items: mapServicePrices(rows)
  };
};

module.exports.updateServiceCatalog = async (service_catalog_id, category_id, service_name, description, estimated_duration, is_active) => {
  const category = await Service_Categories.findOne({
    where: { id: category_id },
  });

  if (!category) {
    throw { status: 404, message: "Danh mục không tồn tại" };
  }

  const serviceCatalog = await Service_Catalog.findOne({
    where: { id: service_catalog_id },
  });

  if (!serviceCatalog) {
    throw { status: 404, message: "Dịch vụ không tồn tại" };
  }

  await serviceCatalog.update({
    category_id,
    service_name,
    description,
    estimated_duration,
    is_active,
  });

  // [Real-time AI Sync] Chạy ngầm đồng bộ lên Pinecone
  syncVectorStoreInBackground();

  return serviceCatalog;
};

