const db = require("../models");

async function main() {
  try {
    console.log("=== START UPDATING TECHNICIANS & SHIFTS ===");

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    console.log(`Today's Date: ${todayStr}`);

    // 1. Update driving licenses for KTVs
    const techIds = [3, 7, 8];
    const updateResult = await db.User.update(
      { hasDrivingLicense: true },
      { where: { id: techIds } }
    );
    console.log(`Updated driving licenses for ${updateResult[0]} technicians.`);

    // 2. Clean existing templates for today
    await db.Shift_Templates.destroy({
      where: { work_date: todayStr }
    });
    console.log("Cleaned existing templates for today.");

    // 3. Create shifts for today (Slot ID 1: Morning, Slot ID 2: Afternoon)
    for (const techId of techIds) {
      // Create morning shift template
      await db.Shift_Templates.create({
        user_id: techId,
        slot_id: 1,
        work_date: todayStr,
        is_confirmed: true
      });

      // Create afternoon shift template
      await db.Shift_Templates.create({
        user_id: techId,
        slot_id: 2,
        work_date: todayStr,
        is_confirmed: true
      });
    }

    console.log(`Successfully created Morning & Afternoon confirmed shifts for technicians ${techIds.join(", ")}.`);

  } catch (error) {
    console.error("Error during seeding today's shifts:", error);
  } finally {
    process.exit(0);
  }
}

main();
