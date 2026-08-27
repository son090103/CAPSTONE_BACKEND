const db = require('../models');

async function check() {
  const cats = await db.Part_Categories.findAll({ raw: true });
  console.log('PART CATEGORIES IN DB:');
  cats.forEach(c => {
    console.log(`ID: ${c.id}, Code: ${c.code}, Name: ${c.category_name}`);
  });
  process.exit(0);
}

check();
