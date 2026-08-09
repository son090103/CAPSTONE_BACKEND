const guestService = require("../../service/common/guest.service");

const SUPPORTED_LANGUAGES = new Set(["vi", "en", "ja"]);

const getLanguage = (value) => {
  const language = String(value || "vi").trim().toLowerCase();
  return SUPPORTED_LANGUAGES.has(language) ? language : "vi";
};

const parsePositiveInteger = (value, fallback, fieldName, max) => {
  if (value === undefined || value === null || value === "") return fallback;

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    const error = new Error(`${fieldName} phải là số nguyên dương`);
    error.status = 400;
    throw error;
  }

  const number = Number(normalized);
  if (!Number.isSafeInteger(number) || number < 1 || (max && number > max)) {
    const error = new Error(
      max
        ? `${fieldName} phải nằm trong khoảng từ 1 đến ${max}`
        : `${fieldName} phải là số nguyên dương`,
    );
    error.status = 400;
    throw error;
  }

  return number;
};

const sendError = (res, error) =>
  res.status(error.status || 500).json({
    success: false,
    message: error.message || "Internal server error",
  });

module.exports.getServiceCategories = async (req, res) => {
  try {
    const data = await guestService.getServiceCategories(getLanguage(req.query.lang));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

// Endpoint không phân trang được giữ lại cho màn đặt lịch hiện tại.
module.exports.getServiceCatalog = async (req, res) => {
  try {
    const categoryId = req.query.category_id
      ? parsePositiveInteger(req.query.category_id, null, "category_id")
      : null;
    const data = await guestService.getServiceCatalog({
      lang: getLanguage(req.query.lang),
      categoryId,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports.searchServiceCatalog = async (req, res) => {
  try {
    const fs = require('fs');
    const logPath = "C:/Users/son/.gemini/antigravity-ide/brain/752070f6-e3a8-4875-a697-13bdb7dbf137/scratch/request_log.txt";
    fs.appendFileSync(logPath, `${new Date().toISOString()} - ${req.url} - ${JSON.stringify(req.query)}\n`);
    console.log("=== GUEST SEARCH REQUEST QUERY ===", req.query);
    const page = parsePositiveInteger(req.query.page, 1, "page");
    const limit = parsePositiveInteger(req.query.limit, 8, "limit", 100);
    const categoryId = req.query.category_id
      ? parsePositiveInteger(req.query.category_id, null, "category_id")
      : null;

    const data = await guestService.searchServiceCatalog({
      lang: getLanguage(req.query.lang),
      q: String(req.query.q || req.query.search || "").trim(),
      categoryId,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      message: "Lấy danh sách dịch vụ thành công",
      data,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports.getServiceCatalogDetail = async (req, res) => {
  try {
    const id = parsePositiveInteger(req.params.id, null, "id");
    const data = await guestService.getServiceCatalogDetail(
      id,
      getLanguage(req.query.lang),
    );

    return res.status(200).json({
      success: true,
      message: "Lấy chi tiết dịch vụ thành công",
      data,
    });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports.getServiceCombos = async (req, res) => {
  try {
    const data = await guestService.getServiceCombos(getLanguage(req.query.lang));
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

module.exports.checkLicensePlate = async (req, res) => {
  try {
    const { license_plate: licensePlate } = req.query;
    if (!licensePlate) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng cung cấp biển số xe.",
      });
    }

    const exists = await guestService.checkLicensePlate(licensePlate);
    return res.status(200).json({
      success: true,
      exists,
      message: exists
        ? "Biển số xe đã tồn tại trong hệ thống."
        : "Biển số xe chưa tồn tại, có thể sử dụng.",
    });
  } catch (error) {
    return sendError(res, error);
  }
};

