const db = require('../models');

async function sync() {
  try {
    console.log('--- BẮT ĐẦU ĐỒNG BỘ CÁC SEQUENCE CỦA POSTGRESQL ---');
    // List of tables that have auto-incrementing integer IDs
    const tables = [
      'Inventory_Logs',
      'Inventory_Batches',
      'Spare_Parts',
      'Part_Categories',
      'Suppliers',
      'Users',
      'Appointments',
      'Service_Orders',
      'Service_Catalogs',
      'Customers',
      'Vehicles',
      'Role',
      'Warehouse_Locations'
    ];

    for (const table of tables) {
      try {
        const query = `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE(max(id), 1)) FROM "${table}";`;
        await db.sequelize.query(query);
        console.log(`✔ Đã đồng bộ sequence cho bảng: ${table}`);
      } catch (err) {
        console.warn(`- Không thể đồng bộ sequence cho bảng "${table}":`, err.message);
      }
    }
    console.log('--- ĐỒNG BỘ SEQUENCE HOÀN TẤT ---');
    process.exit(0);
  } catch (error) {
    console.error('Lỗi khi đồng bộ:', error);
    process.exit(1);
  }
}

sync();
