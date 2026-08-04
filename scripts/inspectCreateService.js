const service = require('./src/service/admin/serviceCatalog.service');
(async () => {
  try {
    const result = await service.createServiceCatalog(1, 'Test Import Service', 'Test description', 60, true, 150000, null);
    console.log('SUCCESS', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('ERROR TYPE:', err && err.constructor && err.constructor.name);
    console.error('ERROR MESSAGE:', err && err.message);
    console.error('ERROR ERRORS:', JSON.stringify(err && err.errors, null, 2));
    console.error('ERROR FIELDS:', JSON.stringify(err && err.fields, null, 2));
    console.error('ERROR ORIGINAL:', JSON.stringify(err && err.original, null, 2));
    console.error(err);
  }
})();
