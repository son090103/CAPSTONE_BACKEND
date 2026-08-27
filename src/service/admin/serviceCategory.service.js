"use strict";

const db = require("../../../models");
const { Op } = require("sequelize");
const { getHfInference } = require("../../util/huggingFace.util");



const NLLB_LANG_MAP = {
  en: 'eng_Latn'
};

const ServiceCategory = db.Service_Categories || db.ServiceCategory;
const ServiceCatalog = db.Service_Catalog || db.ServiceCatalog;

async function applyTranslations(t, categoryId, categoryName) {
  console.log("--- Bắt đầu applyTranslations ---");
  const hfToken = process.env.HUGGINGFACE_API_KEY;
  console.log("Có HuggingFace Token không?", !!hfToken);

  if (!hfToken || !db.Languages || !db.Service_Category_Translations) {
    console.log("Thiếu cấu hình HF Token hoặc Model DB!");
    return;
  }

  const hf = getHfInference(hfToken);
  if (!hf) return;

  const languages = await db.Languages.findAll({
    where: { id: 'en' },
    transaction: t
  });
  console.log("Số lượng ngôn ngữ tìm thấy trong DB (en):", languages.length);

  if (languages.length === 0) {
    console.log("Không tìm thấy ngôn ngữ 'en' trong bảng Languages, bỏ qua dịch!");
    return;
  }

  const translationsToInsert = [];
  for (const lang of languages) {
    const tgtLangCode = NLLB_LANG_MAP[lang.id];
    if (!tgtLangCode) {
      console.warn(`Chưa hỗ trợ map ngôn ngữ: ${lang.id}`);
      translationsToInsert.push({ serviceCategoryId: categoryId, languageId: lang.id, name: categoryName });
      continue;
    }

    try {
      console.log(`Đang gọi Hugging Face API để dịch sang ${lang.id} với từ: ${categoryName}...`);
      const translation = await hf.translation({
        model: 'Helsinki-NLP/opus-mt-vi-en',
        inputs: categoryName
      }, {
        use_cache: false,
        wait_for_model: true
      });
      console.log(`Kết quả dịch (${lang.id}):`, translation);

      let translatedText = categoryName;
      if (translation && translation.translation_text) {
        translatedText = translation.translation_text;
      } else if (Array.isArray(translation) && translation.length > 0 && translation[0].translation_text) {
        translatedText = translation[0].translation_text;
      }

      translationsToInsert.push({
        serviceCategoryId: categoryId,
        languageId: lang.id,
        name: translatedText,
      });
    } catch (err) {
      console.log("====== LỖI DỊCH HUGGING FACE ======");
      console.error(`Lỗi dịch Hugging Face sang ${lang.id}:`, err);
      console.log("===================================");
      translationsToInsert.push({ serviceCategoryId: categoryId, languageId: lang.id, name: categoryName });
    }
  }

  if (translationsToInsert.length > 0) {
    console.log("Đang lưu bản dịch vào DB:", translationsToInsert);
    await db.Service_Category_Translations.destroy({ where: { serviceCategoryId: categoryId }, transaction: t });
    await db.Service_Category_Translations.bulkCreate(translationsToInsert, { transaction: t });
    console.log("Lưu bản dịch thành công!");
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

const buildCategoryWhere = ({ q, is_active } = {}) => {
  const where = {};

  const normalizedIsActive = normalizeBoolean(is_active);
  if (normalizedIsActive !== undefined) {
    where.is_active = normalizedIsActive;
  }

  if (q) {
    const keyword = q.toString().trim();
    if (keyword) {
      where[Op.or] = [{ category_name: { [Op.iLike]: `%${keyword}%` } }];
    }
  }

  return where;
};

module.exports.listCategories = async ({ page = 1, limit = 50, include_services = false, q, is_active } = {}) => {
  const offset = (page - 1) * limit;
  const include = [];

  if (include_services && ServiceCatalog) {
    include.push({ model: ServiceCatalog, as: "services" });
  }

  if (db.Service_Category_Translations) {
    include.push({ model: db.Service_Category_Translations, as: 'translations' });
  }

  const where = buildCategoryWhere({ q, is_active });
  const total = await ServiceCategory.count({ where });
  const totalActive = await ServiceCategory.count({ where: { ...where, is_active: true } });
  const items = await ServiceCategory.findAll({
    where,
    attributes: ["id", "category_name", "is_active", "createdAt", "updatedAt"],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    include,
  });

  return { page, limit, total, totalActive, items };
};

module.exports.createCategories = async ({
  category_name,
  is_active = true,
}) => {
  const t = await db.sequelize.transaction();
  try {
    const category = await ServiceCategory.create(
      { category_name, is_active },
      { transaction: t }
    );
    console.log("lưu vào thay đổi ngôn ngữ ")
    await applyTranslations(t, category.id, category_name);

    await t.commit();
    return category;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

module.exports.updateCategories = async (id, { category_name, is_active }) => {
  const t = await db.sequelize.transaction();
  try {
    const category = await ServiceCategory.findByPk(id, { transaction: t });
    if (!category) throw new Error("Category not found");

    const oldName = category.category_name;
    await category.update(
      {
        ...(category_name !== undefined ? { category_name } : {}),
        ...(is_active !== undefined ? { is_active } : {}),
      },
      { transaction: t }
    );

    if (category_name !== undefined && category_name !== oldName) {
      await applyTranslations(t, category.id, category_name);
    }

    await t.commit();
    return category;
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

module.exports.deleteCategories = async (id) => {
  const t = await db.sequelize.transaction();
  try {
    const category = await ServiceCategory.findByPk(id, { transaction: t });
    if (!category) {
      throw new Error("Category not found");
    }

    if (ServiceCatalog) {
      if (categoryIdAllowsNull) {
        await ServiceCatalog.update(
          { category_id: null },
          { where: { category_id: id }, transaction: t }
        );
      } else {
        await ServiceCatalog.destroy({
          where: { category_id: id },
          transaction: t,
        });
      }
    }

    await ServiceCategory.destroy({ where: { id }, transaction: t });

    await t.commit();

    return { id };
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

