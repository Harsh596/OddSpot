// Creates collections and builds every index defined in the models.
const { connect, mongoose } = require('../db');
const models = require('../models');

(async () => {
  await connect();
  for (const [name, Model] of Object.entries(models)) {
    await Model.createCollection().catch(() => {});
    await Model.syncIndexes();
    const idx = await Model.collection.indexes();
    console.log(`${name}: ${idx.length} indexes`);
  }
  await mongoose.disconnect();
  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });
