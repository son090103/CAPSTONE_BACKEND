const db = require('../models');

async function seed() {
  try {
    console.log('--- BẮT ĐẦU SEED THÊM DANH MỤC PHỤ TÙNG ---');
    const newCategories = [
      { code: 'TIRE', category_name: 'Lốp xe', description: 'Các loại lốp ô tô du lịch và SUV', is_active: true },
      { code: 'BATT', category_name: 'Ắc quy', description: 'Ắc quy khô, ắc quy nước các dòng xe', is_active: true },
      { code: 'FLUID', category_name: 'Dầu nhớt & Hóa chất', description: 'Dầu động cơ, dầu hộp số, nước làm mát', is_active: true },
      { code: 'SUSP', category_name: 'Hệ thống gầm & Treo', description: 'Giảm xóc, rô-tin, thanh cân bằng', is_active: true },
      { code: 'FILT', category_name: 'Lọc gió & Điều hòa', description: 'Lọc gió động cơ, lọc gió cabin', is_active: true },
      { code: 'LIGHT', category_name: 'Hệ thống đèn chiếu sáng', description: 'Đèn pha, đèn hậu, bóng led và halogen', is_active: true }
    ];

    for (const cat of newCategories) {
      const [record, created] = await db.Part_Categories.findOrCreate({
        where: { code: cat.code },
        defaults: cat
      });
      if (created) {
        console.log(`✔ Đã tạo danh mục: ${cat.category_name} (${cat.code})`);
      } else {
        console.log(`- Danh mục đã tồn tại: ${cat.category_name} (${cat.code})`);
      }
    }

    console.log('--- SEED THÊM DANH MỤC THÀNH CÔNG ---');
    process.exit(0);
  } catch (error) {
    console.error('Lỗi khi seed danh mục:', error);
    process.exit(1);
  }
}

seed();
