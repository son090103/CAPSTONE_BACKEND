const { z } = require("zod");

const getConfigurationByKeySchema = z.object({
  key: z
    .string({ required_error: "Key cấu hình là bắt buộc" })
    .min(1, "Key cấu hình không được để trống")
    .max(100, "Key cấu hình tối đa 100 ký tự")
});

const updateConfigurationSchema = z.object({
  config_value: z
    .string({ required_error: "Giá trị cấu hình là bắt buộc" })
    .min(1, "Giá trị cấu hình không được để trống")
    .max(255, "Giá trị cấu hình tối đa 255 ký tự")
});

module.exports = { getConfigurationByKeySchema, updateConfigurationSchema };
