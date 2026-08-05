const { z } = require("zod");

const createServiceComboSchema = z.object({
  combo_name: z
    .string({ required_error: "Tên combo là bắt buộc" })
    .min(2, "Tên combo phải có ít nhất 2 ký tự")
    .max(255, "Tên combo quá dài"),
  description: z.string().optional(),
  serviceCatalogIds: z
    .array(z.number({ invalid_type_error: "Danh sách dịch vụ không hợp lệ" }))
    .min(2, "Phải chọn ít nhất 2 dịch vụ")
    .nonempty("Danh sách dịch vụ không được để trống"),
  is_active: z.boolean().optional(),
  discount_percentage: z.number().min(0).max(100).optional(),
});

const updateServiceComboSchema = z.object({
  combo_name: z
    .string({ required_error: "Tên combo là bắt buộc" })
    .min(2, "Tên combo phải có ít nhất 2 ký tự")
    .max(255, "Tên combo quá dài"),
  description: z.string().optional(),
  serviceCatalogIds: z
    .array(z.number({ invalid_type_error: "Danh sách dịch vụ không hợp lệ" }))
    .min(1, "Phải chọn ít nhất 1 dịch vụ"),
  is_active: z.boolean({ required_error: "Trạng thái combo là bắt buộc" }),
  discount_percentage: z.number().min(0).max(100).optional(),
});

const viewServiceComboSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
  q: z.string().optional(),
  all: z.string().optional().transform(val => val === "true"),
});

module.exports = {
  createServiceComboSchema,
  updateServiceComboSchema,
  viewServiceComboSchema,
};
