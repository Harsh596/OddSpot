// backend/migrations/001_initial_indexes.js
const models = require('../models');

module.exports = {
  version: 1,
  name: '001_initial_indexes',
  async up(db) {
    const usersColl = db.collection('users');
    const usersMissingLower = await usersColl
      .find({
        $or: [{ usernameLower: { $exists: false } }, { usernameLower: null }],
      })
      .toArray();

    for (const u of usersMissingLower) {
      const lower = u.username ? u.username.toLowerCase().trim() : u._id.toString();
      await usersColl.updateOne({ _id: u._id }, { $set: { usernameLower: lower } });
    }

    for (const [name, Model] of Object.entries(models)) {
      if (typeof Model.createCollection === 'function') {
        await Model.createCollection().catch(() => {});
      }
      if (typeof Model.createIndexes === 'function') {
        await Model.createIndexes().catch((err) => {
          console.warn(`Warning creating indexes for ${name}:`, err.message);
        });
      }
    }
  },
};
