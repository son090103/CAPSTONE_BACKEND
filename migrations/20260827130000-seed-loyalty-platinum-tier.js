'use strict';

const CONFIGS = [
  { config_key: 'LOYALTY_TIER_PLATINUM_THRESHOLD', config_value: '50000000', description: 'Tổng chi tiêu tối thiểu (VNĐ) để lên hạng Thành viên Kim Cương' },
  { config_key: 'LOYALTY_MULTIPLIER_PLATINUM', config_value: '2.5', description: 'Hệ số nhân điểm thưởng cho hạng Thành viên Kim Cương' },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    // bulkInsert với ignoreDuplicates trên Postgres không đáng tin cậy (Sequelize dùng
    // INSERT ... ON CONFLICT DO NOTHING, có thể skip nguyên câu lệnh tùy driver/version) —
    // chèn từng dòng, bỏ qua nếu key đã tồn tại, để chắc chắn không bỏ sót dòng nào.
    for (const config of CONFIGS) {
      const [existing] = await queryInterface.sequelize.query(
        'SELECT id FROM "Garage_Configurations" WHERE config_key = :key',
        { replacements: { key: config.config_key }, type: Sequelize.QueryTypes.SELECT }
      );
      if (existing) continue;
      await queryInterface.bulkInsert('Garage_Configurations', [{
        ...config,
        createdAt: now,
        updatedAt: now,
      }]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('Garage_Configurations', {
      config_key: CONFIGS.map(c => c.config_key),
    });
  }
};
