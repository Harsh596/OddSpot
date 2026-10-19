// All tunable numbers live here. Change after you see real engagement.
module.exports = {
  weights: {
    reaction: 5,   // animated reactions (later)
    visit: 4,      // verified visits
    comment: 3,
    like: 1,
    dislike: -0.5, // counts less than a like, resists brigading
  },
  // Score needed to move up a tier. Tier only ever goes up.
  thresholds: {
    country: process.env.METER_COUNTRY_THRESHOLD ? Number(process.env.METER_COUNTRY_THRESHOLD) : 50,
  },
  reportFuzzThreshold: process.env.REPORT_FUZZ_THRESHOLD ? Number(process.env.REPORT_FUZZ_THRESHOLD) : 3,
  decayHalfLifeHours: 48, // score halves every 48h in ranking (not stored score)
  newAccountWeight: 0.5,  // votes from accounts younger than newAccountDays
  newAccountDays: 3,
  duplicateRadiusMeters: 20,
  visitRadiusMeters: 50,
};
