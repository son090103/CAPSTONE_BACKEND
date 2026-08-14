const db = require('../models');

async function migrate() {
  try {
    console.log('--- BẮT ĐẦU CẬP NHẬT CẤU TRÚC BẢNG DATABASE ---');
    
    // 1. Thêm cột reception_condition vào Appointments
    await db.sequelize.query(`
      ALTER TABLE "Appointments" 
      ADD COLUMN IF NOT EXISTS "reception_condition" TEXT;
    `);
    console.log('✔ Đã kiểm tra/thêm cột "reception_condition" vào bảng "Appointments"');

    // 2. Thêm cột recommended_interval_days vào Service_Catalogs
    await db.sequelize.query(`
      ALTER TABLE "Service_Catalogs" 
      ADD COLUMN IF NOT EXISTS "recommended_interval_days" INTEGER;
    `);
    console.log('✔ Đã kiểm tra/thêm cột "recommended_interval_days" vào bảng "Service_Catalogs"');

    // 3. Thêm cột requires_bay vào Service_Catalogs
    await db.sequelize.query(`
      ALTER TABLE "Service_Catalogs" 
      ADD COLUMN IF NOT EXISTS "requires_bay" BOOLEAN DEFAULT TRUE;
    `);
    console.log('✔ Đã kiểm tra/thêm cột "requires_bay" vào bảng "Service_Catalogs"');

    // 3. Thêm cột requires_bay vào Service_Catalogs
    await db.sequelize.query(`
      ALTER TABLE "Service_Catalogs" 
      ADD COLUMN IF NOT EXISTS "requires_bay" BOOLEAN DEFAULT TRUE;
    `);
    console.log('✔ Đã kiểm tra/thêm cột "requires_bay" vào bảng "Service_Catalogs"');

    // 3. Thêm cột requires_bay vào Service_Catalogs
    await db.sequelize.query(`
      ALTER TABLE "Service_Catalogs" 
      ADD COLUMN IF NOT EXISTS "requires_bay" BOOLEAN DEFAULT TRUE;
    `);
    console.log('✔ Đã kiểm tra/thêm cột "requires_bay" vào bảng "Service_Catalogs"');

    console.log('--- CẬP NHẬT THÀNH CÔNG ---');
    process.exit(0);
  } catch (error) {
    console.error('Lỗi khi chạy lệnh cập nhật database:', error);
    process.exit(1);
  }
}

migrate();
