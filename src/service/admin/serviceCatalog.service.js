/** @type {import("sequelize").ModelStatic<import("sequelize").Model>} */
const path = require('path');
const { Op } = require("sequelize");
const { where } = require("sequelize");
const db = require("../../../models");
const xlsx = require("xlsx");
const { HfInference } = require('@huggingface/inference');
const vectorStoreService = require('../ai/vectorStore.service'); // Import dịch vụ AI

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

  const hf = new HfInference(hfToken.trim());

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
    if (["true", "1", "yes", "x", "active", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off", "inactive"].includes(normalized)) return false;
  }
  return undefined;
};

const normalizeRow = (row) => {
  const normalized = {};
  Object.keys(row).forEach((key) => {
    let rawKey = key.toString().trim();
    // Remove BOM and common zero-width/invisible chars that Excel may add
    rawKey = rawKey.replace(/^[\uFEFF\u200B\u200C\u200D\u2060]+/, '');
    // Only attempt latin1->utf8 re-decode when the string shows mojibake signatures
    let decoded = rawKey;
    try {
      if (/Ã|Â|ï»¿|�|á»|áº|á¼|Ä|Å|Æ|â/.test(rawKey)) {
        const redecoded = Buffer.from(rawKey, 'latin1').toString('utf8');
        if (redecoded && redecoded !== rawKey) decoded = redecoded;
      }
    } catch (e) {
      // ignore
    }

    let safeKey = decoded.toLowerCase().replace(/\s+/g, "_");
    safeKey = safeKey.replace(/[\u200B\u200C\u200D\u2060]/g, '');
    try {
      safeKey = safeKey.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch (e) {
    }
    safeKey = safeKey.replace(/[^a-z0-9_]/g, '');
    let cellValue = row[key];
    if (typeof cellValue === 'string') {
      try {
        if (/Ã|Â|ï»¿|�|á»|áº|á¼|Ä|Å|Æ|â/.test(cellValue)) {
          const redecodedVal = Buffer.from(cellValue, 'latin1').toString('utf8');
          if (redecodedVal) cellValue = redecodedVal;
        }
      } catch (e) {
      }
    }
    normalized[safeKey] = cellValue;
  });
  return normalized;
};

const parseNumber = (value, fallback = undefined) => {
  if (value === null || value === undefined || value === "") return fallback;
  // Remove common thousands separators (dot, comma, spaces) then parse
  const cleaned = value.toString().replace(/[.,\s]/g, "");
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? fallback : parsed;
};

// Expose helpers for unit testing
module.exports.normalizeRow = normalizeRow;
module.exports.parseNumber = parseNumber;
module.exports.normalizeBoolean = normalizeBoolean;

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
    vectorStoreService.syncAllServicesToPinecone().catch(err => console.error("Lỗi Background Sync:", err));

    return serviceCatalog;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

module.exports.importServiceCatalog = async (fileBuffer, filename) => {
  if (!fileBuffer) {
    throw { status: 400, message: "Không có dữ liệu file để import" };
  }

  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw { status: 400, message: "File không chứa sheet hợp lệ" };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  if (!Array.isArray(rawRows) || rawRows.length === 0) {
    throw { status: 400, message: "File không chứa dữ liệu dịch vụ" };
  }

  const results = {
    successCount: 0,
    errors: [],
  };

  for (let index = 0; index < rawRows.length; index += 1) {
    const row = normalizeRow(rawRows[index]);
    const serviceName = String(
      row.service_name || row.name || row.ten_dich_vu || row.tendichvu || row.service || ''
    ).trim();

    const description = String(
      row.description || row.mo_ta || row.mota || row.mo_ta || row.des || ''
    ).trim();

    const estimated_duration = parseNumber(
      row.estimated_duration || row.duration || row.estimated_duration_minutes || row.thoi_gian || row.thoi_gian_phut || row.thoigian || row.duration_minutes,
      30
    );

    const is_active = normalizeBoolean(
      row.is_active ?? row.active ?? row.trang_thai ?? row.trangthai ?? row.status ?? 'true'
    );

    const labor_price = parseNumber(
      row.labor_price || row.price || row.cost || row.gia || row.gia_vnd || row.price_vnd,
      0
    ) || 0;

    const spare_part_id = parseNumber(
      row.spare_part_id || row.sparepart_id || row.spare_part || row.sparepart,
      undefined
    );

    let categoryId = parseNumber(
      row.category_id ?? row.category ?? row.categoryid ?? row.danh_muc_id ?? row.danhmucid ?? undefined,
      undefined
    );
    const categoryName = String(
      row.category_name || row.categoryname || row.ten_danh_muc || row.danh_muc || row.danhmuc || ''
    ).trim();

    try {
      if (!serviceName) {
        throw { status: 400, message: "Tên dịch vụ không được để trống" };
      }

      if (!categoryId && categoryName) {
        const category = await Service_Categories.findOne({
          where: {
            category_name: { [Op.iLike]: categoryName }
          }
        });
        if (category) {
          categoryId = category.id;
        }
      }

      if (!categoryId) {
        throw { status: 400, message: "Danh mục dịch vụ không hợp lệ hoặc bị bỏ trống" };
      }

      await module.exports.createServiceCatalog(
        categoryId,
        serviceName,
        description,
        estimated_duration,
        is_active,
        labor_price,
        spare_part_id
      );
      results.successCount += 1;
    } catch (error) {
      results.errors.push({
        row: index + 2,
        message: error.message || error || "Lỗi không xác định khi import dòng",
      });
    }
  }

  vectorStoreService.syncAllServicesToPinecone().catch(err => console.error("Lỗi Background Sync:", err));
  return results;
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
  vectorStoreService.syncAllServicesToPinecone().catch(err => console.error("Lỗi Background Sync:", err));

  return serviceCatalog;
};

