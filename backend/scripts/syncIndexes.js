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

async function syncAllIndexes() {
  await connect();
  await backfillUsernameLower();
  for (const [name, Model] of Object.entries(models)) {
    await Model.createCollection().catch(() => {});
    await Model.syncIndexes();
    const idx = await Model.collection.indexes();
    console.log(`${name}: ${idx.length} indexes`);
  }
  await mongoose.disconnect();
  console.log('Done.');
}

if (require.main === module) {
  syncAllIndexes().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { backfillUsernameLower, syncAllIndexes };
