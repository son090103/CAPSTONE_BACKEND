const { z } = require("zod");

const createAppointmentSchema = z.object({
  vehicle_id: z
    .number({ invalid_type_error: "ID xe phải là số nguyên" })
    .int("ID xe phải là số nguyên")
    .optional()
    .nullable(),
  booking_type: z.enum(["CUSTOMER_SPECIFIC", "CUSTOMER_REPAIR", "RECEPTIONIST_SPECIFIC", "RECEPTIONIST_REPAIR", "CONSULTATION"], {
    errorMap: () => ({ message: "Loại đặt lịch không hợp lệ" }),
  }),
  scheduled_time: z
    .string({ required_error: "Thời gian hẹn là bắt buộc" })
    .refine((val) => !isNaN(Date.parse(val)), {
      message: "Thời gian hẹn không hợp lệ",
    })
    .refine((val) => new Date(val) > new Date(), {
      message: "Thời gian hẹn phải ở tương lai",
    }),
  notes: z
    .string({ invalid_type_error: "Ghi chú phải là chuỗi" })
    .max(1000, "Ghi chú không được dài quá 1000 ký tự")
    .optional()
    .nullable(),
  details: z
    .array(
      z.object({
        catalog_id: z
          .number({ invalid_type_error: "ID dịch vụ phải là số nguyên" })
          .int()
          .optional()
          .nullable(),
        combo_id: z
          .number({ invalid_type_error: "ID combo phải là số nguyên" })
          .int()
          .optional()
          .nullable(),
      }).refine((data) => data.catalog_id || data.combo_id, {
        message: "Mỗi chi tiết phải chọn ít nhất một dịch vụ hoặc combo",
      })
    )
    .optional()
    .nullable(),
  service_ids: z.array(z.number().int()).optional().nullable(),
  combo_ids: z.array(z.number().int()).optional().nullable(),
  vehicle_brand: z.string().optional().nullable(),
  vehicle_model: z.string().optional().nullable(),
  vehicle_plate: z.string().optional().nullable(),
  vehicle_year: z
    .preprocess(
      (val) => {
        if (typeof val === "string" && val.trim() !== "") {
          const parsed = parseInt(val, 10);
          return isNaN(parsed) ? val : parsed;
        }
        return val;
      },
      z.number({ invalid_type_error: "Năm sản xuất phải là số nguyên" }).int().min(1900, "Năm sản xuất không hợp lệ").max(new Date().getFullYear() + 1, "Năm sản xuất không hợp lệ")
    )
    .optional()
    .nullable(),
  vehicle_color: z.string().max(50, "Màu sắc không được dài quá 50 ký tự").optional().nullable(),
  payment_amount: z.number().optional().nullable(),
});

module.exports = { createAppointmentSchema };
