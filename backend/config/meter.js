const cfg = {
  label: process.env.METER_LABEL || 'Oddometer',
  weights: {
    reaction: 5,   // animated reactions (weight: 5)
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

function updateMeterConfig(newConfig = {}) {
  if (newConfig.countryThreshold !== undefined) {
    const val = Number(newConfig.countryThreshold);
    if (!Number.isNaN(val) && val >= 1) {
      cfg.thresholds.country = val;
    }
  }
  if (newConfig.countryThresholdMin !== undefined) {
    const val = Number(newConfig.countryThresholdMin);
    if (!Number.isNaN(val) && val >= 1) {
      cfg.thresholds.country = val;
    }
  }
  if (newConfig.reportFuzzThreshold !== undefined) {
    const val = Number(newConfig.reportFuzzThreshold);
    if (!Number.isNaN(val) && val >= 1) {
      cfg.reportFuzzThreshold = val;
    }
  }
  if (newConfig.weights && typeof newConfig.weights === 'object') {
    for (const [k, v] of Object.entries(newConfig.weights)) {
      const num = Number(v);
      if (!Number.isNaN(num)) {
        cfg.weights[k] = num;
      }
    }
  }
  return { ...cfg };
}

function getMeterConfig() {
  return { ...cfg };
}

cfg.updateMeterConfig = updateMeterConfig;
cfg.getMeterConfig = getMeterConfig;

module.exports = cfg;

