const db = require('../models');

async function check() {
  const parts = await db.Spare_Parts.findAll({ raw: true });
  console.log('SPARE PARTS IN DB:');
  parts.forEach(p => {
    console.log(`ID: ${p.id}, SKU: ${p.sku}, Name: ${p.name}, Stock: ${p.stock_quantity}, Min: ${p.min_threshold}`);
  });
  process.exit(0);
}

check();
