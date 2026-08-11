const { z } = require("zod");

const createIssueReportSchema = z.object({
  task_id: z.number(),
  issues: z
    .array(
      z.object({
        component_id: z.number(),
        description: z.string().min(1, "Mô tả lỗi không được để trống"),
      }),
    )
    .min(1, "Phải có ít nhất một lỗi"),
  note: z.string().optional(),
});

module.exports = { createIssueReportSchema };
