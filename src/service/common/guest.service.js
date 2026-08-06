const { Op } = require("sequelize");
const db = require("../../../models");
const { mapServicePrices } = require("../../util/calculateServicePrice.util");

const {
  Service_Categories: ServiceCategories,
  Service_Catalog: ServiceCatalog,
  Service_Combo: ServiceCombo,
} = db;

const translationInclude = (model, lang) =>
  lang !== "vi" && model
    ? [{ model, as: "translations", where: { languageId: lang }, required: false }]
    : [];

const localizeCategory = (category) => {
  if (!category) return category;
  const raw = typeof category.toJSON === "function" ? category.toJSON() : { ...category };
  const translation = raw.translations?.[0];
  if (translation?.name) raw.category_name = translation.name;
  delete raw.translations;
  return raw;
};

const localizeCatalog = (catalog) => {
  const raw = typeof catalog.toJSON === "function" ? catalog.toJSON() : { ...catalog };
  const translation = raw.translations?.[0];
  if (translation?.name) raw.service_name = translation.name;
  if (translation?.description !== undefined && translation?.description !== null) {
    raw.description = translation.description;
  }
  delete raw.translations;
  if (raw.category) raw.category = localizeCategory(raw.category);
  return raw;
};

const catalogIncludes = (lang) => [
  {
    model: ServiceCategories,
    as: "category",
    attributes: ["id", "category_name"],
    include: translationInclude(db.Service_Category_Translations, lang),
  },
  ...translationInclude(db.Service_Catalog_Translations, lang),
];

const catalogAttributes = [
  "id",
  "category_id",
  "service_name",
  "description",
  "estimated_duration",
  "labor_price",
  "is_active",
];

const mapCatalogs = (catalogs) => mapServicePrices(catalogs.map(localizeCatalog));

module.exports.getServiceCategories = async (lang = "vi") => {
  const categories = await ServiceCategories.findAll({
    where: { is_active: true },
    attributes: ["id", "category_name"],
    include: translationInclude(db.Service_Category_Translations, lang),
    order: [["id", "ASC"]],
  });
  return categories.map(localizeCategory);
};

module.exports.getServiceCatalog = async ({ lang = "vi", categoryId = null } = {}) => {
  const where = { is_active: true };
  if (categoryId) where.category_id = categoryId;

  const catalogs = await ServiceCatalog.findAll({
    where,
    attributes: catalogAttributes,
    include: catalogIncludes(lang),
    order: [["id", "ASC"]],
  });
  return mapCatalogs(catalogs);
};

module.exports.searchServiceCatalog = async ({
  lang = "vi",
  q = "",
  categoryId = null,
  page = 1,
  limit = 8,
} = {}) => {
  const where = { is_active: true };
  if (categoryId) where.category_id = categoryId;
  if (q) {
    where[Op.or] = [
      { service_name: { [Op.iLike]: `%${q}%` } },
      { description: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const { count, rows } = await ServiceCatalog.findAndCountAll({
    where,
    attributes: catalogAttributes,
    include: catalogIncludes(lang),
    order: [["id", "ASC"]],
    limit,
    offset: (page - 1) * limit,
    distinct: true,
  });

  return {
    items: mapCatalogs(rows),
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  };
};

module.exports.getServiceCatalogDetail = async (id, lang = "vi") => {
  const catalog = await ServiceCatalog.findOne({
    where: { id, is_active: true },
    attributes: catalogAttributes,
    include: catalogIncludes(lang),
  });

  if (!catalog) {
    const error = new Error("Dịch vụ không tồn tại hoặc đã ngừng cung cấp");
    error.status = 404;
    throw error;
  }

  return mapCatalogs([catalog])[0];
};

module.exports.getServiceCombos = async (lang = "vi") => {
  const catalogTranslation = translationInclude(db.Service_Catalog_Translations, lang);
  const combos = await ServiceCombo.findAll({
    where: { is_active: true },
    attributes: ["id", "combo_name", "description", "is_active", "createdAt", "updatedAt"],
    include: [
      {
        model: ServiceCatalog,
        as: "catalogs",
        where: { is_active: true },
        required: false,
        attributes: catalogAttributes,
        through: { attributes: [] },
        include: [
          {
            model: ServiceCategories,
            as: "category",
            attributes: ["id", "category_name"],
            include: translationInclude(db.Service_Category_Translations, lang),
          },
          ...catalogTranslation,
        ],
      },
      ...translationInclude(db.Service_Combo_Translations, lang),
    ],
    order: [["createdAt", "DESC"]],
  });

  return combos.map((combo) => {
    const raw = combo.toJSON();
    const translation = raw.translations?.[0];
    if (translation?.combo_name) raw.combo_name = translation.combo_name;
    if (translation?.description !== undefined && translation?.description !== null) {
      raw.description = translation.description;
    }
    delete raw.translations;
    raw.catalogs = mapCatalogs(raw.catalogs || []);
    raw.total_price = raw.catalogs.reduce(
      (sum, catalog) => sum + Number(catalog.total_price || 0),
      0,
    );
    return raw;
  });
};

module.exports.checkLicensePlate = async (licensePlate) => {
  const vehicle = await db.Vehicles.findOne({ where: { license_plate: licensePlate } });
  return Boolean(vehicle);
};

