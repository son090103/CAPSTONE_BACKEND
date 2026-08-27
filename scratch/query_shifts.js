const db = require("../models");

async function main() {
  try {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    console.log(`Today: ${todayStr}`);

    // Query users
    const users = await db.User.findAll({
      where: { id: [3, 7, 8] }
    });
    console.log("Users:");
    for (const u of users) {
      console.log(`ID: ${u.id}, Name: ${u.fullName}, RoleID: ${u.roleId}, Driving License: ${u.hasDrivingLicense}, Status: ${u.status}`);
    }

    // Query slots
    const slots = await db.Shift_Slots.findAll();
    console.log("Slots:");
    for (const s of slots) {
      console.log(`Slot ID: ${s.id}, Name: ${s.slot_name}, Start: ${s.start_time}, End: ${s.end_time}`);
    }

    // Query templates for today
    const templates = await db.Shift_Templates.findAll({
      where: { work_date: todayStr }
    });
    console.log("Templates for today:");
    for (const t of templates) {
      console.log(`Template ID: ${t.id}, UserID: ${t.user_id}, SlotID: ${t.shift_slot_id}, Confirmed: ${t.is_confirmed}`);
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    process.exit(0);
  }
}

main();
