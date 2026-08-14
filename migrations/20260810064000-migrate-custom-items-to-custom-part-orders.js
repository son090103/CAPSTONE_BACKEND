"use strict";

// Data migration 1 lần: mỗi dòng Quotation_Details có custom_item_name -> tạo 1 dòng
// Custom_Part_Orders tương ứng, rồi dọn lại dòng gốc thành "shell" (bỏ custom_item_name,
// đổi status sang state machine mới của hàng kho thường).
//
// Mapping status cũ -> mới:
//   WAITING_DEPOSIT -> Custom_Part_Orders.status = WAITING_DEPOSIT
//   WAITING_STOCK   -> Custom_Part_Orders.status = WAITING_ARRIVAL
//   PENDING (đã nhập kho theo code cũ, spare_part_id đã gán) -> READY_FOR_USE
//   EXPORTED/RECEIVED -> EXPORTED
//   CANCELLED -> CANCELLED
// Quotation_Details.status sau migrate: "EXPORTED" nếu Custom_Part_Orders vừa tạo là
// EXPORTED (đồng bộ để các nơi check NOT IN [EXPORTED, RECEIVED, CANCELLED] vẫn đúng),
// ngược lại "CUSTOM_ORDERED".
const STATUS_MAP = {
  WAITING_DEPOSIT: "WAITING_DEPOSIT",
  WAITING_STOCK: "WAITING_ARRIVAL",
  PENDING: "READY_FOR_USE",
  EXPORTED: "EXPORTED",
  RECEIVED: "EXPORTED",
  CANCELLED: "CANCELLED",
};

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      const [rows] = await queryInterface.sequelize.query(
        `SELECT id, custom_item_name, quantity, unit_price, status
         FROM "Quotation_Details"
         WHERE custom_item_name IS NOT NULL`,
        { transaction: t },
      );

      let migrated = 0;
      for (const row of rows) {
        const newStatus = STATUS_MAP[row.status] || "WAITING_DEPOSIT";
        await queryInterface.bulkInsert(
          "Custom_Part_Orders",
          [
            {
              quotation_detail_id: row.id,
              item_name: row.custom_item_name,
              quantity: row.quantity,
              unit_price: row.unit_price,
              actual_unit_price: newStatus === "READY_FOR_USE" || newStatus === "EXPORTED" ? row.unit_price : null,
              arrived_at: newStatus === "READY_FOR_USE" || newStatus === "EXPORTED" ? new Date() : null,
              status: newStatus,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          { transaction: t },
        );

        const shellStatus = newStatus === "EXPORTED" ? "EXPORTED" : "CUSTOM_ORDERED";
        await queryInterface.sequelize.query(
          `UPDATE "Quotation_Details" SET custom_item_name = NULL, status = :shellStatus, "updatedAt" = NOW() WHERE id = :id`,
          { replacements: { shellStatus, id: row.id }, transaction: t },
        );
        migrated += 1;
      }

      console.log(`[migrate-custom-items-to-custom-part-orders] Đã migrate ${migrated} dòng.`);
    });
  },

  async down(queryInterface) {
    // Không rollback tự động (mất thông tin item_name gốc nếu đã bị NULL ở Quotation_Details) —
    // nếu cần revert, khôi phục từ backup DB trước khi chạy migration này.
    console.log("[migrate-custom-items-to-custom-part-orders] down() không tự động khôi phục dữ liệu — cần restore từ backup nếu cần.");
  },
};
