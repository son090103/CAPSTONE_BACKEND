const { Op } = require("sequelize");
const db = require("../../../models");
const SparePart = db.Spare_Parts;
const PartCategory = db.Part_Categories;

module.exports.createSparePart = async (
  name,
  brand,
  category_id,
  warranty_period_months,
  warranty_km_limit,
  transaction = null,
) => {
  const category = await db.Part_Categories.findByPk(
  category_id,
  { transaction }
);
if (!category) {
  throw {
    status: 404,
    message: "Danh mục không tồn tại"
  };
};
  const year = new Date().getFullYear();
  const prefix = `${category.code}-${year}-`;
  const last = await SparePart.findOne({
    where: { sku: { [Op.like]: `${prefix}%` } },
    order: [["sku", "DESC"]],
    transaction,
  });
  let next = 1;
  if (last) {
    const lastNumber = parseInt(last.sku.split("-")[2], 10);
    next = lastNumber + 1;
  }
  const sku = `${prefix}${String(next).padStart(4, "0")}`;
  const part = await SparePart.create(
    {
      sku: sku,
      name: name,
      brand: brand,
      category_id: category_id,
      warranty_period_months: warranty_period_months,
      warranty_km_limit: warranty_km_limit,
    },
    { transaction },
  );
  return part;
};

module.exports.getSpareParts = async (filters = {}) => {
  const { search, brand, category_id, minPrice, maxPrice, page = 1, limit = 9 } = filters;
  const where = {};

  if (typeof search === "string" && search.trim()) {
    const keyword = search.trim();
    where[Op.or] = [
      { name: { [Op.iLike]: `%${keyword}%` } },
      { sku: { [Op.iLike]: `%${keyword}%` } },
      { brand: { [Op.iLike]: `%${keyword}%` } },
    ];
  }

  if (typeof brand === "string" && brand.trim()) {
    const brands = brand
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (brands.length === 1) {
      where.brand = brands[0];
    } else if (brands.length > 1) {
      where.brand = { [Op.in]: brands };
    }
  }

  const parsedCategoryId = Number(category_id);
  if (Number.isInteger(parsedCategoryId) && parsedCategoryId > 0) {
    where.category_id = parsedCategoryId;
  }

  const parsedMinPrice = Number(minPrice);
  const parsedMaxPrice = Number(maxPrice);
  const hasMinPrice = Number.isFinite(parsedMinPrice) && parsedMinPrice >= 0;
  const hasMaxPrice = Number.isFinite(parsedMaxPrice) && parsedMaxPrice >= 0;

  if (hasMinPrice && hasMaxPrice) {
    where.retail_price = { [Op.between]: [parsedMinPrice, parsedMaxPrice] };
  } else if (hasMinPrice) {
    where.retail_price = { [Op.gte]: parsedMinPrice };
  } else if (hasMaxPrice) {
    where.retail_price = { [Op.lte]: parsedMaxPrice };
  }

  const offset = (page - 1) * limit;

  const part = await SparePart.findAndCountAll({
    where,
    attributes: [
      "id",
      "sku",
      "name",
      "brand",
      "stock_quantity",
      "retail_price",
      "warranty_km_limit",
      "warranty_period_months",
      "min_threshold",
    ],
    include: [
      {
        model: PartCategory, 
        as: "category",
        attributes: ["id","category_name"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  return {
    data: part.rows,
    pagination: {
      page,
      limit,
      totalItems: part.count,
      totalPages: part.count === 0 ? 0 : Math.ceil(part.count / limit),
    },
  };
};
module.exports.updateSparePart = async (
  id,
  name,
  brand,
  retail_price,
  warranty_period_months,
  warranty_km_limit,
  min_threshold,
) => {
  const part = await SparePart.findOne({
    where: { id: id },
  });
  if (!part) {
    throw { status: 404, message: "Phụ tùng không tồn tại" };
  }
  const updatePart = await part.update({
    name: name,
    brand: brand,
    retail_price: retail_price,
    warranty_period_months: warranty_period_months,
    warranty_km_limit: warranty_km_limit,
    ...(min_threshold !== undefined ? { min_threshold } : {}),
  });
  return updatePart;
};
