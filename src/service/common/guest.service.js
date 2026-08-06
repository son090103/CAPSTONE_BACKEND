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

const { notifyRole } = require("../../util/notification.util");
const { normalizeVnPhone } = require("../../util/phone.util");

module.exports.requestRescue = async ({ phone_number, latitude, longitude, distance_km, rescue_price, issue_description }) => {
  const normalizedPhone = normalizeVnPhone(phone_number);
  if (!normalizedPhone) {
    const error = new Error("Số điện thoại không hợp lệ");
    error.status = 400;
    throw error;
  }

  // 1. Tìm hoặc tạo Customer dựa trên phone
  let customer = await db.Customers.findOne({ where: { phone: normalizedPhone } });
  if (!customer) {
    customer = await db.Customers.create({
      phone: normalizedPhone,
      name: "Khách vãng lai",
      membership_tier: "BRONZE",
      loyalty_points: 0
    });
  }

  // 2. Tìm xem khách hàng này có cuốc cứu hộ nào chưa hoàn thành không
  let rescue = await db.Rescue_Requests.findOne({
    where: {
      customer_id: customer.id,
      status: {
        [Op.in]: ['PENDING', 'ASSIGNED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']
      }
    }
  });

  if (rescue) {
    // Cập nhật thông tin cuốc cứu hộ hiện tại
    rescue.customer_lat = latitude;
    rescue.customer_lng = longitude;
    rescue.distance_km = distance_km || rescue.distance_km;
    rescue.rescue_price = rescue_price || rescue.rescue_price;
    rescue.issue_description = issue_description || rescue.issue_description;
    rescue.phone_number = normalizedPhone;
    await rescue.save();
  } else {
    // Tạo mới cuốc cứu hộ
    rescue = await db.Rescue_Requests.create({
      customer_id: customer.id,
      phone_number: normalizedPhone,
      customer_lat: latitude,
      customer_lng: longitude,
      distance_km: distance_km || 0,
      rescue_price: rescue_price || 0,
      issue_description: issue_description || "Yêu cầu cứu hộ khẩn cấp",
      status: 'PENDING'
    });
  }

  // 3. Gửi thông báo đến Lễ Tân
  const customerName = customer.name || 'Khách vãng lai';
  await notifyRole('RECEPTIONIST', {
    title: 'Yêu cầu cứu hộ khẩn cấp mới',
    content: `Khách hàng ${customerName} (${normalizedPhone}) vừa gửi yêu cầu cứu hộ khẩn cấp!`,
    notificationType: 'SYSTEM',
    priority: 'HIGH',
    link: '/reception/customers'
  }, 'new_notification', { message: `Yêu cầu cứu hộ mới từ số điện thoại ${normalizedPhone}!` });

  return rescue;
};
