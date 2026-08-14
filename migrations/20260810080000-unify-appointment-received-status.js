"use strict";

// Data migration 1 lần: gộp mọi biến thể status "đã tiếp nhận" của Appointments
// (Technicaian_recieved, TECHNICIAN_RECEIVED, INFORMATION_RECIEVED) về chung
// "INFORMATION_RECEIVED" — tên chuẩn duy nhất từ nay. Cả 2 luồng (lễ tân bấm
// "Tiếp nhận xe" cho lịch đặt trước, và tạo walk-in tại trang "Tiếp nhận khách")
// cùng diễn tả 1 ý nghĩa: khách/xe đã có mặt tại garage — giữ nhiều tên khác nhau
// từng gây bug FE lọc sai (khách vãng lai bị lọt khỏi mọi tab trạng thái).
module.exports = {
  async up(queryInterface) {
    const [, result] = await queryInterface.sequelize.query(
      `UPDATE "Appointments" SET status = 'INFORMATION_RECEIVED', "updatedAt" = NOW()
       WHERE status IN ('Technicaian_recieved', 'TECHNICIAN_RECEIVED', 'INFORMATION_RECIEVED')`,
    );
    console.log(`[unify-appointment-received-status] Đã cập nhật ${result?.rowCount ?? 0} dòng.`);
  },

  async down() {
    console.log("[unify-appointment-received-status] down() không tự động khôi phục — không thể phân biệt lại dòng nào từng là giá trị cũ nào.");
  },
};
