// backend/migrations/003_apply_collmod_validators.js
const { applyCollectionValidators } = require('../scripts/applySchemaValidation');

module.exports = {
  version: 3,
  name: '003_apply_collmod_validators',
  async up(db) {
    await applyCollectionValidators(db);
  },
};
