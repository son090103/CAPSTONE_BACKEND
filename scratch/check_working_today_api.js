const db = require("../models");
const technicianService = require("../src/service/receptionist/technician.service");

async function main() {
  try {
    const result = await technicianService.getTechniciansWorkingToday();
    console.log("Technicians Working Today according to Service:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Error calling service:", error);
  } finally {
    process.exit(0);
  }
}

main();
