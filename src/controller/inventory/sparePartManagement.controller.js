const {
  updateSparePart,
} = require("../../validation/inventory/sparePart.validation");
const manageSparePart = require("../../service/inventory/sparePartManagement.service");


module.exports.getSpareParts = async (req, res) => {
  try {
    const { search, brand, category_id, minPrice, maxPrice, page, limit } = req.query;

    const parsedPage = Number(page);
    const safePage = Number.isInteger(parsedPage) && parsedPage > 0
      ? parsedPage
      : 1;

    const parsedLimit = Number(limit);
    let safeLimit = Number.isInteger(parsedLimit) && parsedLimit > 0
      ? parsedLimit
      : 9;
    if (safeLimit > 100) {
      safeLimit = 100;
    }

    const result = await manageSparePart.getSpareParts({
      search,
      brand,
      category_id,
      minPrice,
      maxPrice,
      page: safePage,
      limit: safeLimit,
    });
    return res.status(200).json({
      success: true,
      message: result.data.length > 0
        ? "Spare parts retrieved successfully"
        : "No spare parts found",
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve spare parts",
    });
  }
};
module.exports.updateSparePart = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      brand,
      retail_price,
      warranty_period_months,
      warranty_km_limit,
      min_threshold,
    } = req.body;
    const validation = updateSparePart.safeParse({
      name,
      brand,
      retail_price,
      min_threshold,
    });
    if (!validation.success) {
      return res.status(400).json({
        message: validation.error.issues[0].message,
      });
    }
    const result = await manageSparePart.updateSparePart(
      id,
      name,
      brand,
      retail_price,
      warranty_period_months,
      warranty_km_limit,
      min_threshold,
    );
    return res.status(200).json({
      message: "Cập nhật phụ tùng thành công",
      data: result,
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message || "Internal server error",
    });
  }
};
