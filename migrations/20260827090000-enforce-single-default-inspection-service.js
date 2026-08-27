'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      DELETE FROM "Service_Catalogs" current_service
      USING "Service_Catalogs" newer_service
      WHERE current_service."is_default_inspection_service" = TRUE
        AND newer_service."is_default_inspection_service" = TRUE
        AND current_service.id < newer_service.id;
    `);

    await queryInterface.sequelize.query(`
      CREATE UNIQUE INDEX "service_catalogs_single_default_inspection_idx"
      ON "Service_Catalogs" ("is_default_inspection_service")
      WHERE "is_default_inspection_service" = TRUE;
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(`
      DROP INDEX IF EXISTS "service_catalogs_single_default_inspection_idx";
    `);
  },
};