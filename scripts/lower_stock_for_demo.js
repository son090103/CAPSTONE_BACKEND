const db = require('../models');

async function run() {
  try {
    console.log('--- BẮT ĐẦU HẠ TỒN KHO ĐỂ DEMO (ĐA DẠNG DỮ LIỆU) ---');
    
    // 1. Hạ Bugi BMW 320i xuống 1 (Min 3)
    const part3 = await db.Spare_Parts.findOne({ where: { sku: 'SP-BMW-0003' } });
    if (part3) {
      part3.stock_quantity = 1;
      await part3.save();
      console.log(`✔ Đã hạ tồn kho ${part3.name} xuống: 1 (Min: ${part3.min_threshold})`);
    }

    // 2. Hạ Lọc dầu Mercedes C200 xuống 2 (Min 3)
    const part4 = await db.Spare_Parts.findOne({ where: { sku: 'SP-MER-0004' } });
    if (part4) {
      part4.stock_quantity = 2;
      await part4.save();
      console.log(`✔ Đã hạ tồn kho ${part4.name} xuống: 2 (Min: ${part4.min_threshold})`);
    }

    // 3. Hạ Lọc dầu Toyota Vios xuống 3 (Min 5)
    const part1 = await db.Spare_Parts.findOne({ where: { sku: 'SP-TOY-0001' } });
    if (part1) {
      part1.stock_quantity = 3;
      await part1.save();
      console.log(`✔ Đã hạ tồn kho ${part1.name} xuống: 3 (Min: ${part1.min_threshold})`);
    }

    // 4. Hạ Má phanh Honda City xuống 4 (Min 5)
    const part2 = await db.Spare_Parts.findOne({ where: { sku: 'SP-HON-0002' } });
    if (part2) {
      part2.stock_quantity = 4;
      await part2.save();
      console.log(`✔ Đã hạ tồn kho ${part2.name} xuống: 4 (Min: ${part2.min_threshold})`);
    }

    console.log('--- CẬP NHẬT TỒN KHO THÀNH CÔNG (ĐA DẠNG DỮ LIỆU) ---');
    process.exit(0);
  } catch (error) {
    console.error('Lỗi khi hạ tồn kho:', error);
    process.exit(1);
  }
}

run();
