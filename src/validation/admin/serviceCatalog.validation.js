const { z } = require("zod");

const serviceCatalogPayloadSchema = z.object({
  category_id: z.coerce.number().int().positive("Danh mục dịch vụ không hợp lệ"),
  service_name: z.string().trim().min(1, "Tên dịch vụ là bắt buộc"),
  estimated_duration: z.coerce.number().int().positive("Thời gian dự kiến phải lớn hơn 0"),
  is_active: z.boolean(),
  labor_price: z.coerce.number().finite().nonnegative("Giá dịch vụ không được âm"),
  spare_part_id: z.union([z.coerce.number().int().positive(), z.null()]).optional(),
  is_default_inspection_service: z.boolean().default(false),
  requires_bay: z.boolean().optional(),
}).superRefine((data, context) => {
  if (data.is_default_inspection_service && data.labor_price !== 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["labor_price"],
      message: "Dịch vụ kiểm tra mặc định phải có giá bằng 0",
    });
  }

  if (!data.is_default_inspection_service && data.labor_price <= 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["labor_price"],
      message: "Giá dịch vụ thường phải lớn hơn 0",
    });
  }
});

const createServiceCatalogSchema = z.object({
  service_name: z
    .string({ required_error: "Tên dịch vụ là bắt buộc" }),
});
const updateServiceCatalogSchema = z.object({
  service_name: z
    .string({ required_error: "Tên dịch vụ là bắt buộc" }),
});
const viewServiceCatalogSchema = z.object({
  page: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
  limit: z.string().optional().transform(val => val ? parseInt(val, 10) : undefined),
  q: z.string().optional(),
  all: z.string().optional().transform(val => val === "true"),
});
module.exports = {
  createServiceCatalogSchema,
  updateServiceCatalogSchema,
  serviceCatalogPayloadSchema,
  viewServiceCatalogSchema,
};