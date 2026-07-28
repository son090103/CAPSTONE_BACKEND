const { z } = require("zod");

const quotationDetailSchema = z
  .object({
    issue_id: z
      .number({ error: "Lỗi phải là số" })
      .int("Lỗi không hợp lệ")
      .positive("Lỗi không hợp lệ")
      .optional(),
    spare_part_id: z
      .number({ error: "Phụ tùng phải là số" })
      .int("Phụ tùng không hợp lệ")
      .positive("Phụ tùng không hợp lệ")
      .optional(),
    service_id: z
      .number({ error: "Dịch vụ phải là số" })
      .int("Dịch vụ không hợp lệ")
      .positive("Dịch vụ không hợp lệ")
      .optional(),
    custom_item_name: z
      .string({ error: "Tên phụ tùng phải là chuỗi" })
      .min(1, "Tên phụ tùng không được để trống")
      .optional(),
    unit_price: z
      .number({ error: "Đơn giá phải là số" })
      .min(0, "Đơn giá không được âm")
      .optional(),
    repair_price: z
      .number({ error: "Giá sửa chữa phải là số" })
      .min(0, "Giá sửa chữa không được âm")
      .optional(),
    quantity: z
      .number({
        error: (issue) =>
          issue.input == null ? "Số lượng là bắt buộc" : "Số lượng phải là số",
      })
      .int("Số lượng phải là số nguyên")
      .min(1, "Số lượng phải lớn hơn 0"),
  })
  .superRefine((data, ctx) => {
    const fieldCount = [
      data.spare_part_id,
      data.service_id,
      data.custom_item_name,
    ].filter(Boolean).length;

    if (fieldCount === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["service_id"],
        message: "Mỗi dòng phải có phụ tùng, dịch vụ, hoặc phụ tùng đặt riêng",
      });
    }
    if (fieldCount > 1) {
      ctx.addIssue({
        code: "custom",
        path: ["service_id"],
        message: "Một dòng chỉ được là một trong ba: phụ tùng, dịch vụ, hoặc phụ tùng đặt riêng",
      });
    }
    if (data.custom_item_name && (!data.unit_price || data.unit_price <= 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["unit_price"],
        message: "Phụ tùng đặt riêng phải có đơn giá lớn hơn 0",
      });
    }
  });


const createQuotationSchema = z.object({
  task_id: z
    .number({ error: "Công việc phải là số" })
    .int("Công việc không hợp lệ")
    .positive("Công việc không hợp lệ"),
  items: z
    .array(quotationDetailSchema)
    .min(1, "Báo giá phải có ít nhất một dòng"),
  deposit_amount: z
    .number({ error: "Tiền cọc phải là số" })
    .min(0, "Tiền cọc không được âm")
    .optional(),
  note: z.string({ error: "Ghi chú phải là chuỗi" }).optional(),
});


const updateQuotationSchema = z.object({
  items: z
    .array(quotationDetailSchema)
    .min(1, "Báo giá phải có ít nhất một dòng"),
  deposit_amount: z
    .number({ error: "Tiền cọc phải là số" })
    .min(0, "Tiền cọc không được âm")
    .optional(),
  note: z.string({ error: "Ghi chú phải là chuỗi" }).optional(),
});


module.exports = { createQuotationSchema, updateQuotationSchema };
