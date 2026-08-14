const db = require('../models');
const { importSparePart } = require('../src/service/inventory/importAndExportManagement.service');

async function test() {
  try {
    // Find category for 'Lốp xe'
    const cat = await db.Part_Categories.findOne({ where: { category_name: 'Lốp xe' } });
    if (!cat) {
      console.log('Category "Lốp xe" not found in DB!');
      process.exit(1);
    }
    
    // Find a supplier
    const sup = await db.Suppliers.findOne();
    if (!sup) {
      console.log('No supplier found in DB!');
      process.exit(1);
    }

    // Find a user manager
    const manager = await db.User.findOne();
    if (!manager) {
      console.log('No manager found!');
      process.exit(1);
    }

    console.log('Inputs found:');
    console.log(`- Category ID: ${cat.id} (${cat.category_name})`);
    console.log(`- Supplier ID: ${sup.id} (${sup.name})`);
    console.log(`- Manager ID: ${manager.id} (${manager.fullName})`);

    const items = [
      {
        part_id: null, // creating a new part
        name: 'Lốp xe Michelin Primacy 4 21',
        brand: 'Michelin',
        category_id: cat.id,
        warranty_period_months: 6,
        warranty_km_limit: 5000,
        quantity: 4,
        unit_price: 2500000,
        retail_price: 2500000
      }
    ];

    console.log('Running importSparePart...');
    const res = await importSparePart(manager.id, sup.id, items);
    console.log('SUCCESS:', res);
    process.exit(0);
  } catch (err) {
    console.error('ERROR DETECTED:');
    console.error(err);
    if (err.errors) {
      console.error('SEQUELIZE VALIDATION ERRORS:');
      err.errors.forEach(e => {
        console.error(`- Path: ${e.path}, Message: ${e.message}, Type: ${e.type}, Value: ${e.value}`);
      });
    }
    process.exit(1);
  }
}

test();
