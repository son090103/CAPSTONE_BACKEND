const { z } = require("zod");


const createSparePart = z.object({
  name: z.string({ required_error: "Name là bắt buộc" }).optional(),
  brand: z.string({ required_error: "Brand là bắt buộc" }).optional(),  
  quantity: z
    .number({ invalid_type_error: "Tỉ lệ giảm giá phải là số" })         
    .min(0, "Số lượng không được âm")
    .optional(),

  retail_price: z
    .number({ required_error: "Giá bán ra là bắt buộc" })
    .min(0, "Số lượng không được âm")
    .optional(),
  category_id: z
    .number({ required_error: "Danh mục là bắt buộc" })
    .optional(),
  });
const updateSparePart = z.object({
  name: z.string({ invalid_type_error: "Tên phải là chuỗi" }).optional(),
  brand: z.string({ invalid_type_error: "Thương hiệu phải là chuỗi" }).optional(),
  retail_price: z
    .number({ invalid_type_error: "Giá bán ra phải là số" })
    .min(0, "Giá bán ra không được âm")
    .optional(),
  category_id: z
    .number({ required_error: "Danh mục là bắt buộc" })
    .optional(),
  min_threshold: z
    .number({ invalid_type_error: "Ngưỡng cảnh báo tồn kho phải là số" })
    .int("Ngưỡng cảnh báo tồn kho phải là số nguyên")
    .min(0, "Ngưỡng cảnh báo tồn kho không được âm")
    .optional(),
  });

module.exports = { createSparePart, updateSparePart };
