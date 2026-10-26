// Creates collections and builds every index defined in the models.
const { connect, mongoose } = require('../db');
const models = require('../models');

// One-time migration/backfill helper ensuring existing records without usernameLower are populated
async function backfillUsernameLower() {
  const usersToUpdate = await models.User.find({
    $or: [{ usernameLower: { $exists: false } }, { usernameLower: null }],
  });
  let updatedCount = 0;
  for (const user of usersToUpdate) {
    if (user.username) {
      await models.User.updateOne(
        { _id: user._id },
        { $set: { usernameLower: user.username.toLowerCase().trim() } }
      );
      updatedCount++;
    }
  }
  if (updatedCount > 0) {
    console.log(`Backfilled usernameLower for ${updatedCount} users.`);
  }
}

async function syncAllIndexes({ disconnectAfter = (require.main === module) } = {}) {
  const needsConnect = mongoose.connection.readyState !== 1;
  if (needsConnect) {
    await connect();
  }
  await backfillUsernameLower();
  for (const [name, Model] of Object.entries(models)) {
    await Model.createCollection().catch(() => {});
    await Model.createIndexes();
    const indexes = await Model.collection.indexes();
    console.log(`${name}: ${indexes.length} indexes`);
    for (const idx of indexes) {
      console.log(`  - ${name}.${idx.name}`);
    }
  }
  if (disconnectAfter) {
    await mongoose.disconnect();
  }
  console.log('Done syncing indexes.');
}

if (require.main === module) {
  syncAllIndexes({ disconnectAfter: true }).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { backfillUsernameLower, syncAllIndexes };
