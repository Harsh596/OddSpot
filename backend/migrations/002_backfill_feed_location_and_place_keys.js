// backend/migrations/002_backfill_feed_location_and_place_keys.js
const { backfillFeedLocation } = require('../scripts/backfillFeedLocation');

module.exports = {
  version: 2,
  name: '002_backfill_feed_location_and_place_keys',
  async up(db) {
    await backfillFeedLocation({ quiet: true });
  },
};
