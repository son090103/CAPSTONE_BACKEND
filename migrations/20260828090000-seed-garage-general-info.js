'use strict';

const CONFIGS = [
  { config_key: 'GARAGE_NAME', config_value: 'AGM Intelligent', description: 'Tên Garage hiển thị công khai' },
  { config_key: 'GARAGE_PHONE', config_value: '090 1234 567', description: 'Số điện thoại liên hệ Garage' },
  { config_key: 'GARAGE_ADDRESS', config_value: '123 Đường số 4, Khu Công Nghệ Cao, Thủ Đức, TP.HCM', description: 'Địa chỉ Garage' },
  { config_key: 'GARAGE_EMAIL', config_value: 'contact@agm-intelligent.vn', description: 'Email liên hệ Garage' },
  { config_key: 'GARAGE_HOURS_WEEKDAY', config_value: '08:00 - 18:00', description: 'Giờ hoạt động Thứ 2 - Thứ 6' },
  { config_key: 'GARAGE_HOURS_SATURDAY', config_value: '08:00 - 16:00', description: 'Giờ hoạt động Thứ 7' },
  { config_key: 'GARAGE_HOURS_SUNDAY', config_value: 'Đóng cửa', description: 'Giờ hoạt động Chủ Nhật' },
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    // bulkInsert với ignoreDuplicates trên Postgres không đáng tin cậy — chèn từng dòng, bỏ qua
    // nếu key đã tồn tại, để chắc chắn không bỏ sót dòng nào (đã gặp bug thật với cách cũ).
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
