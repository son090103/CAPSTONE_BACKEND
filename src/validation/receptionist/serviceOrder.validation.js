const { z } = require("zod");

const createServiceOrderSchema = z.object({
    vehicle_id: z.number().positive("ID xe không hợp lệ").nullable().optional(),
    walk_in: z.object({
        customer_name: z.string().optional(),
        customer_phone: z.string().min(1, "SĐT không được để trống"),
        vehicle_plate: z.string().min(1, "Biển số không được để trống"),
        vehicle_vin: z.string().optional(),
        vehicle_year: z.union([z.string(), z.number()]).optional(),
        brand_name: z.string().min(1, "Hãng xe không được để trống"),
        model_name: z.string().min(1, "Dòng xe không được để trống")
    }).optional(),
    bay_id: z.number({ required_error: "Vui lòng chọn cầu nâng" }).positive("ID cầu nâng không hợp lệ").nullable().optional(),
    current_odo: z.number().min(0, "Số ODO không hợp lệ").nullable().optional(),
    appointment_id: z.number().positive("ID lịch hẹn không hợp lệ").nullable().optional(),
    estimated_finish_time: z.string().optional(),
    service_ids: z.array(z.number()).optional(),
    combo_ids: z.array(z.number()).optional(),
    notes: z.string().optional(),
    symptoms: z.string({ required_error: "Vui lòng ghi mô tả tình trạng xe lúc tiếp nhận." }).trim().min(1, "Vui lòng ghi mô tả tình trạng xe lúc tiếp nhận."),
    rescue_id: z.number().positive("ID cứu hộ không hợp lệ").nullable().optional()
}).refine(data => data.vehicle_id || data.walk_in, {
    message: "Phải cung cấp ID xe hoặc thông tin khách vãng lai",
    path: ["vehicle_id"]
});

module.exports = {
    createServiceOrderSchema
};
