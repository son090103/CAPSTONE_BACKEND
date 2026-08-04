const fs = require('fs');
const path = require('path');
const util = require('util');
const service = require('./src/service/admin/serviceCatalog.service');
(async () => {
  try {
    const csv = fs.readFileSync(path.join(process.cwd(), 'temp_service_import.csv'));
    const result = await service.importServiceCatalog(csv, 'temp_service_import.csv');
    console.log('RESULT', util.inspect(result, { depth: null, colors: false }));
  } catch (err) {
    console.error('ERR TYPE:', err && err.constructor && err.constructor.name);
    console.error('ERR MESSAGE:', err && err.message);
    console.error('ERR KEYS:', Object.keys(err || {}));
    console.error('ERR PROPS:', util.inspect(err, { depth: null, colors: false }));
  }
})();
