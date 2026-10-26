const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { serializePost } = require('../utils/postSerializer');
const meter = require('../services/meter');
const cfg = require('../config/meter');

describe('Phase F5: Task F5-T1 - Post Serializer Meter & Threshold Metadata', () => {
  it('1. Exposes label, score, likes, dislikes, comments, commenters, visits, reactions, countryThreshold, pointsToNextTier', () => {
    const rawPost = {
      _id: '507f1f77bcf86cd799439011',
      title: 'Strange Monolith',
      tier: 'city',
      hideExact: false,
      place: { city: 'Portland', country: 'USA' },
      meter: {
        score: 18,
        likes: 5,
        dislikes: 1,
        comments: 3,
        commenters: 2,
        visits: 2,
        reactions: 1,
      },
    };

    const serialized = serializePost(rawPost);

    assert.ok(serialized.meter, 'post.meter must be defined');
    assert.equal(serialized.meter.label, 'Oddometer', 'meter.label must default to Oddometer');
    assert.equal(serialized.meter.score, 18);
    assert.equal(serialized.meter.likes, 5);
    assert.equal(serialized.meter.dislikes, 1);
    assert.equal(serialized.meter.comments, 3);
    assert.equal(serialized.meter.commenters, 2);
    assert.equal(serialized.meter.visits, 2);
    assert.equal(serialized.meter.reactions, 1);
    assert.equal(serialized.meter.countryThreshold, 50);
    assert.equal(serialized.meter.pointsToNextTier, 32, '50 - 18 = 32 points to next tier');
  });

  it('2. Computes pointsToNextTier as 0 when tier is country or score >= threshold', () => {
    const countryPost = {
      _id: '507f1f77bcf86cd799439012',
      title: 'Nationwide Famous Mystery',
      tier: 'country',
      meter: { score: 75 },
    };
    const sCountry = serializePost(countryPost);
    assert.equal(sCountry.meter.pointsToNextTier, 0, 'pointsToNextTier must be 0 for country tier');

    const highCityPost = {
      _id: '507f1f77bcf86cd799439013',
      title: 'About to Level Up',
      tier: 'city',
      meter: { score: 60 },
    };
    const sCity = serializePost(highCityPost);
    assert.equal(sCity.meter.pointsToNextTier, 0, 'pointsToNextTier must clamp to 0 if score >= threshold');
  });

  it('3. Falls back safely when post.meter is undefined or partial', () => {
    const barePost = {
      _id: '507f1f77bcf86cd799439014',
      title: 'Bare Spot',
    };
    const sBare = serializePost(barePost);
    assert.ok(sBare.meter);
    assert.equal(sBare.meter.score, 0);
    assert.equal(sBare.meter.likes, 0);
    assert.equal(sBare.meter.dislikes, 0);
    assert.equal(sBare.meter.comments, 0);
    assert.equal(sBare.meter.commenters, 0);
    assert.equal(sBare.meter.visits, 0);
    assert.equal(sBare.meter.reactions, 0);
    assert.equal(sBare.meter.countryThreshold, 50);
    assert.equal(sBare.meter.pointsToNextTier, 50);
  });

  it('4. meter service exposes getCountryThreshold and calculatePointsToNextTier', () => {
    assert.equal(typeof meter.getCountryThreshold, 'function');
    assert.equal(typeof meter.calculatePointsToNextTier, 'function');
    assert.equal(meter.getCountryThreshold(), 50);
    assert.equal(meter.calculatePointsToNextTier(20, 'city'), 30);
    assert.equal(meter.calculatePointsToNextTier(20, 'country'), 0);
    assert.equal(meter.calculatePointsToNextTier(60, 'city'), 0);
  });

  it('5. Evaluates visual stages across boundary values', () => {
    function getStage(score, threshold = 50) {
      if (score >= threshold) return 'Country-Wide Certified Oddity!';
      if (score >= 35) return 'City Sensation';
      if (score >= 15) return 'Neighborhood Eyebrow-Raiser';
      return 'Local Whisper';
    }

    assert.equal(getStage(0), 'Local Whisper');
    assert.equal(getStage(14), 'Local Whisper');
    assert.equal(getStage(15), 'Neighborhood Eyebrow-Raiser');
    assert.equal(getStage(34), 'Neighborhood Eyebrow-Raiser');
    assert.equal(getStage(35), 'City Sensation');
    assert.equal(getStage(49), 'City Sensation');
    assert.equal(getStage(50), 'Country-Wide Certified Oddity!');
    assert.equal(getStage(120), 'Country-Wide Certified Oddity!');
  });
});
