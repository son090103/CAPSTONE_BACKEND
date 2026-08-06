const db = require('./models');

async function check() {
  try {
    const serviceOrder = await db.Service_Orders.findByPk(334);
    console.log("Service Order 334:", serviceOrder ? "EXISTS" : "DOES NOT EXIST");
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
check();
