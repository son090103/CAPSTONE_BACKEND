const { z } = require("zod");

const createStaffSchema = z
  .object({
    fullName: z
      .string({ required_error: "Họ tên là bắt buộc" })
      .min(2, "Họ tên phải có ít nhất 2 ký tự")
      .max(150, "Họ tên quá dài"),
    phoneNumber: z
      .string({ required_error: "Số điện thoại là bắt buộc" })
      .min(9, "Số điện thoại không hợp lệ")
      .max(20, "Số điện thoại không hợp lệ"),
    roleCode: z
      .string({ required_error: "Vai trò là bắt buộc" })
      .min(1, "Vai trò là bắt buộc"),
    password: z
      .string()
      .min(6, "Mật khẩu phải có ít nhất 8 ký tự")
      .optional(),
    confirmPassword: z.string().optional(),
    avatar: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (!data.password) return true;
      return data.password === data.confirmPassword;
    },
    {
      message: "Mật khẩu xác nhận không khớp",
      path: ["confirmPassword"],
    }
  );

const updateStaffSchema = z
  .object({
    fullName: z
      .string({ required_error: "Họ tên không hợp lệ" })
      .min(2, "Họ tên phải có ít nhất 2 ký tự")
      .max(150, "Họ tên quá dài")
      .optional(),
    phoneNumber: z
      .string({ required_error: "Số điện thoại không hợp lệ" })
      .min(9, "Số điện thoại không hợp lệ")
      .max(20, "Số điện thoại không hợp lệ")
      .optional(),
    roleCode: z
      .string({ required_error: "Vai trò không hợp lệ" })
      .min(1, "Vai trò là bắt buộc")
      .optional(),
    status: z
      .enum(["ACTIVE", "INACTIVE", "BANNED"], {
        required_error: "Trạng thái tài khoản không hợp lệ",
      })
      .optional(),
    avatar: z.string().optional().nullable(),
    password: z
      .string()
      .min(6, "Mật khẩu phải có ít nhất 6 ký tự")
      .optional(),
    confirmPassword: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Vui lòng cung cấp ít nhất một trường để cập nhật",
  })
  .refine(
    (data) => {
      if (!data.password) return true;
      return data.password === data.confirmPassword;
    },
    {
      message: "Mật khẩu xác nhận không khớp",
      path: ["confirmPassword"],
    }
  );

module.exports = {
  createStaffSchema,
  updateStaffSchema,
};
