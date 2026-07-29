const { z } = require("zod");

const importSparePartSchema = z
  .object({
    quantity: z
      .number({
        error: (issue) =>
          issue.input == null ? "Số lượng là bắt buộc" : "Số lượng phải là số",
      })
      .int("Số lượng phải là số nguyên")
      .min(1, "Số lượng phải lớn hơn 0"),

    unit_price: z
      .number({
        error: (issue) =>
          issue.input == null ? "Giá nhập là bắt buộc" : "Giá nhập phải là số",
      })
      .min(0, "Giá nhập không được âm"),

    retail_price: z
      .number({ error: "Giá bán phải là số" })
      .min(0, "Giá bán không được âm")
      .optional(),

    part_id: z
      .number({ error: "Id sản phẩm phải là số" })
      .int("Sản phẩm không hợp lệ")
      .positive("Sản phẩm không hợp lệ")
      .optional(),

    name: z
      .string({ error: "Tên phụ tùng phải là chuỗi" })
      .min(2, "Tên có ít nhất 2 ký tự")
      .optional(),

    brand: z.string({ error: "Thương hiệu phải là chuỗi" }).optional(),

    category_id: z
      .number({ error: "Danh mục phải là số" })
      .int("Danh mục không hợp lệ")
      .optional(),

    warranty_period_months: z
      .number({ error: "Thời hạn bảo hành phải là số" })
      .int("Thời hạn bảo hành phải là số nguyên")
      .min(0, "Thời hạn bảo hành không được âm")
      .optional(),

    warranty_km_limit: z
      .number({ error: "Số km bảo hành phải là số" })
      .int("Số km bảo hành phải là số nguyên")
      .min(0, "Số km bảo hành không được âm")
      .optional(),

    force: z.boolean({ error: "force phải là true/false" }).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.part_id) {
      if (!data.name) {
        ctx.addIssue({
          code: "custom",
          path: ["name"],
          message: "Tên phụ tùng là bắt buộc khi tạo mới",
        });
      }
      if (data.category_id == null) {
        ctx.addIssue({
          code: "custom",
          path: ["category_id"],
          message: "Danh mục là bắt buộc khi tạo mới",
        });
      }
    }
  });

const importReceiptSchema = z.object({
  supplier_id: z
    .number({
      error: (issue) =>
        issue.input == null
          ? "Nhà cung cấp là bắt buộc"
          : "Nhà cung cấp phải là số",
    })
    .int("Nhà cung cấp không hợp lệ"),

  items: z
    .array(importSparePartSchema)
    .min(1, "Phiếu phải có ít nhất một mặt hàng"),
});

const approveExportSchema = z.object({
  serviceOrderId: z
    .number({
      error: (issue) =>
        issue.input == null
          ? "Lệnh sửa chữa là bắt buộc"
          : "Lệnh sửa chữa phải là số",
    })
    .int("Lệnh sửa chữa không hợp lệ")
    .positive("Lệnh sửa chữa không hợp lệ"),
});

const importForOrderItemSchema = z
  .object({
    quotation_item_id: z
      .number({
        error: (issue) =>
          issue.input == null
            ? "Dòng báo giá là bắt buộc"
            : "Dòng báo giá phải là số",
      })
      .int("Dòng báo giá không hợp lệ")
      .positive("Dòng báo giá không hợp lệ"),

    quantity: z
      .number({
        error: (issue) =>
          issue.input == null ? "Số lượng là bắt buộc" : "Số lượng phải là số",
      })
      .int("Số lượng phải là số nguyên")
      .min(1, "Số lượng phải lớn hơn 0"),

    unit_price: z
      .number({
        error: (issue) =>
          issue.input == null ? "Giá nhập là bắt buộc" : "Giá nhập phải là số",
      })
      .min(0, "Giá nhập không được âm"),

    retail_price: z
      .number({ error: "Giá bán phải là số" })
      .min(0, "Giá bán không được âm")
      .optional(),

    part_id: z
      .number({ error: "Id sản phẩm phải là số" })
      .int("Sản phẩm không hợp lệ")
      .positive("Sản phẩm không hợp lệ")
      .optional(),

    name: z
      .string({ error: "Tên phụ tùng phải là chuỗi" })
      .min(2, "Tên có ít nhất 2 ký tự")
      .optional(),

    brand: z.string({ error: "Thương hiệu phải là chuỗi" }).optional(),

    category_id: z
      .number({ error: "Danh mục phải là số" })
      .int("Danh mục không hợp lệ")
      .optional(),

    warranty_period_months: z
      .number({ error: "Thời hạn bảo hành phải là số" })
      .int("Thời hạn bảo hành phải là số nguyên")
      .min(0, "Thời hạn bảo hành không được âm")
      .optional(),

    warranty_km_limit: z
      .number({ error: "Số km bảo hành phải là số" })
      .int("Số km bảo hành phải là số nguyên")
      .min(0, "Số km bảo hành không được âm")
      .optional(),

    force: z.boolean({ error: "force phải là true/false" }).optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.part_id) {
      if (!data.name) {
        ctx.addIssue({
          code: "custom",
          path: ["name"],
          message: "Tên phụ tùng là bắt buộc khi tạo mới",
        });
      }
      if (data.category_id == null) {
        ctx.addIssue({
          code: "custom",
          path: ["category_id"],
          message: "Danh mục là bắt buộc khi tạo mới",
        });
      }
    }
  });

const importForOrderReceiptSchema = z.object({
  supplier_id: z
    .number({
      error: (issue) =>
        issue.input == null
          ? "Nhà cung cấp là bắt buộc"
          : "Nhà cung cấp phải là số",
    })
    .int("Nhà cung cấp không hợp lệ"),

  items: z
    .array(importForOrderItemSchema)
    .min(1, "Phiếu phải có ít nhất một mặt hàng"),
});

module.exports = { importReceiptSchema, approveExportSchema, importForOrderReceiptSchema };
