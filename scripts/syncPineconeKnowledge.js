require('dotenv').config();
const db = require('../models');
const { syncAllKnowledgeToPinecone } = require('../src/service/ai/vectorStore.service');

function parseArgs(argv) {
  const typeArg = argv.find(arg => arg.startsWith('--types='));
  return {
    dryRun: argv.includes('--dry-run'),
    replace: !argv.includes('--no-delete'),
    types: typeArg ? typeArg.slice('--types='.length).split(',').map(x => x.trim()).filter(Boolean) : undefined
  };
}

(async () => {
  const options = parseArgs(process.argv.slice(2));
  const result = await syncAllKnowledgeToPinecone(options);
  console.log(JSON.stringify(result, null, 2));
  await db.sequelize.close();
})().catch(async error => {
  console.error('[RAG Sync] Thất bại:', error.message);
  try { await db.sequelize.close(); } catch (_) {}
  process.exit(1);
});
