const { z } = require("zod");

const rejectFinalInspectionSchema = z.object({
  taskIds: z
    .array(
      z
        .number({ error: "Id công việc phải là số" })
        .int("Công việc không hợp lệ")
        .positive("Công việc không hợp lệ"),
    )
    .min(1, "Phải chọn ít nhất một công việc cần làm lại"),
  reason: z
    .string({ error: "Lý do phải là chuỗi" })
    .optional(),
});
module.exports = { rejectFinalInspectionSchema };

