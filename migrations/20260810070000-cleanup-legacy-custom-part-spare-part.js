"use strict";

// Dọn dữ liệu rác do hành vi CŨ (trước khi tách Custom_Part_Orders): thủ kho "nhập kho" cho
// phụ tùng đặt riêng đã tự tạo 1 SparePart giả (sku dạng "null-<năm>-<số>") và gán thẳng vào
// Quotation_Details.spare_part_id — trái với quyết định mới (hàng đặt riêng KHÔNG thuộc kho
// chung). Dọn theo đúng chuỗi liên kết: shell -> Inventory_Batches -> Inventory_Logs -> SparePart.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      const [legacyParts] = await queryInterface.sequelize.query(
        `SELECT sp.id AS part_id
         FROM "Spare_Parts" sp
         JOIN "Quotation_Details" qd ON qd.spare_part_id = sp.id
         JOIN "Custom_Part_Orders" cpo ON cpo.quotation_detail_id = qd.id
         WHERE sp.sku LIKE 'null-%'`,
        { transaction: t },
      );

      for (const { part_id } of legacyParts) {
        await queryInterface.sequelize.query(
          `UPDATE "Quotation_Details" SET spare_part_id = NULL, "updatedAt" = NOW() WHERE spare_part_id = :partId`,
          { replacements: { partId: part_id }, transaction: t },
        );
        const [logs] = await queryInterface.sequelize.query(
          `SELECT id FROM "Inventory_Logs" WHERE part_id = :partId`,
          { replacements: { partId: part_id }, transaction: t },
        );
        for (const log of logs) {
          await queryInterface.sequelize.query(
            `DELETE FROM "Inventory_Batches" WHERE inventory_log_id = :logId`,
            { replacements: { logId: log.id }, transaction: t },
          );
        }
        await queryInterface.sequelize.query(
          `DELETE FROM "Inventory_Logs" WHERE part_id = :partId`,
          { replacements: { partId: part_id }, transaction: t },
        );
        await queryInterface.sequelize.query(
          `DELETE FROM "Spare_Parts" WHERE id = :partId`,
          { replacements: { partId: part_id }, transaction: t },
        );
      }

      console.log(`[cleanup-legacy-custom-part-spare-part] Đã dọn ${legacyParts.length} SparePart rác.`);
    });
  },

  async down() {
    console.log("[cleanup-legacy-custom-part-spare-part] down() không khôi phục — cần restore từ backup nếu cần.");
  },
};
