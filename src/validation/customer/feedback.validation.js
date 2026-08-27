const { z } = require("zod");

const submitFeedbackSchema = z.object({
  service_order_id: z
    .number({ required_error: "ID đơn hàng dịch vụ là bắt buộc", invalid_type_error: "ID đơn hàng dịch vụ phải là số" })
    .int("ID đơn hàng dịch vụ phải là số nguyên")
    .positive("ID đơn hàng dịch vụ phải lớn hơn 0"),
  service_rating: z
    .number({ required_error: "Đánh giá dịch vụ là bắt buộc", invalid_type_error: "Đánh giá dịch vụ phải là số" })
    .int("Đánh giá dịch vụ phải là số nguyên")
    .min(1, "Đánh giá dịch vụ phải từ 1 sao")
    .max(5, "Đánh giá dịch vụ tối đa 5 sao"),
  service_comment: z
    .string({ required_error: "Bình luận dịch vụ là bắt buộc" })
    .min(5, "Bình luận dịch vụ phải có ít nhất 5 ký tự")
    .max(1000, "Bình luận dịch vụ tối đa 1000 ký tự"),
  receptionist_rating: z
    .number({ required_error: "Đánh giá lễ tân là bắt buộc", invalid_type_error: "Đánh giá lễ tân phải là số" })
    .int("Đánh giá lễ tân phải là số nguyên")
    .min(1, "Đánh giá lễ tân phải từ 1 sao")
    .max(5, "Đánh giá lễ tân tối đa 5 sao"),
  receptionist_comment: z
    .string({ required_error: "Bình luận lễ tân là bắt buộc" })
    .min(5, "Bình luận lễ tân phải có ít nhất 5 ký tự")
    .max(1000, "Bình luận lễ tân tối đa 1000 ký tự"),
  head_technician_rating: z
    .number({ required_error: "Đánh giá KTV trưởng là bắt buộc", invalid_type_error: "Đánh giá KTV trưởng phải là số" })
    .int("Đánh giá KTV trưởng phải là số nguyên")
    .min(1, "Đánh giá KTV trưởng phải từ 1 sao")
    .max(5, "Đánh giá KTV trưởng tối đa 5 sao"),
  head_technician_comment: z
    .string({ required_error: "Bình luận KTV trưởng là bắt buộc" })
    .min(5, "Bình luận KTV trưởng phải có ít nhất 5 ký tự")
    .max(1000, "Bình luận KTV trưởng tối đa 1000 ký tự"),
});

module.exports = { submitFeedbackSchema };
