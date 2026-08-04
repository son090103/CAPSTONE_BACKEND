const {
  createServiceComboSchema,
  updateServiceComboSchema,
  viewServiceComboSchema,
} = require("../../validation/admin/serviceCombos.validation");
const serviceCombosService = require("../../service/admin/serviceCombos.service");

module.exports.getServiceCombos = async (req, res) => {
  try {
    const validation = viewServiceComboSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({ message: validation.error.issues[0].message || "Tham số không hợp lệ" });
    }
    const { q, is_active, page, limit, all } = validation.data;
    const result = await serviceCombosService.listServiceCombos({ q, is_active, page, limit, all });
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};

module.exports.searchServiceCombos = async (req, res) => {
  try {
    const { q, is_active } = req.query;
    const result = await serviceCombosService.listServiceCombos({ q, is_active });
    return res.status(200).json({ data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};

module.exports.createServiceCombo = async (req, res) => {
  try {
    const { combo_name, description, serviceCatalogIds, is_active, discount_percentage } = req.body;
    const validation = createServiceComboSchema.safeParse({
      combo_name,
      description,
      serviceCatalogIds,
      is_active,
      discount_percentage,
    });

    if (!validation.success) {
      return res.status(400).json({ message: validation.error.issues[0].message });
    }

    const result = await serviceCombosService.createServiceCombo(
      validation.data.combo_name,
      validation.data.description,
      validation.data.serviceCatalogIds,
      validation.data.is_active,
      validation.data.discount_percentage
    );

    return res.status(201).json({ message: "Tạo gói dịch vụ thành công", data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};

module.exports.updateServiceCombo = async (req, res) => {
  try {
    const { id } = req.params;
    const { combo_name, description, serviceCatalogIds, is_active, discount_percentage } = req.body;
    const validation = updateServiceComboSchema.safeParse({
      combo_name,
      description,
      serviceCatalogIds,
      is_active,
      discount_percentage,
    });

    if (!validation.success) {
      return res.status(400).json({ message: validation.error.issues[0].message });
    }

    const result = await serviceCombosService.updateServiceCombo(
      id,
      validation.data.combo_name,
      validation.data.description,
      validation.data.serviceCatalogIds,
      validation.data.is_active,
      validation.data.discount_percentage
    );

    return res.status(200).json({ message: "Cập nhật gói dịch vụ thành công", data: result });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message || "Internal server error" });
  }
};
