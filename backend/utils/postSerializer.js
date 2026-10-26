// backend/utils/postSerializer.js
// Post serialization helper: replaces exact location with feedLocation when hideExact is true,
// quantizes distances to 500m increments for anti-trilateration, and cleans internal fields.

const { fuzzLocation, getHaversineDistance } = require('./fuzzLocation');
const cfg = require('../config/meter');
const meter = require('../services/meter');

/**
 * Serializes a post for public API consumption:
 * - If hideExact is true: replaces location with feedLocation (or computed HMAC fuzzed point) and tags fuzzed: true.
 * - Quantizes distanceMeters to 500m multiples when hideExact is true.
 * - Strips internal database fields like feedLocation before sending to client.
 * - Exposes full meter breakdown, configurable label, countryThreshold, and pointsToNextTier.
 *
 * @param {object} post - Post document or plain object
 * @param {[number, number]|null} [queryCoords=null] - Optional [longitude, latitude] of search origin
 * @returns {object} Serialized post
 */
function serializePost(post, queryCoords = null) {
  if (!post) return null;
  const doc = post.toObject ? post.toObject() : { ...post };

  if (doc.hideExact) {
    const fuzzedCoordinates =
      doc.feedLocation && Array.isArray(doc.feedLocation.coordinates)
        ? doc.feedLocation.coordinates
        : fuzzLocation(doc.location?.coordinates || [0, 0], doc._id?.toString());

    doc.location = {
      type: 'Point',
      coordinates: fuzzedCoordinates,
      fuzzed: true,
    };

    if (queryCoords && Array.isArray(queryCoords)) {
      const dist = getHaversineDistance(queryCoords, fuzzedCoordinates);
      doc.distanceMeters = Math.round(dist / 500) * 500;
    } else if (doc.distanceMeters !== undefined) {
      doc.distanceMeters = Math.round(doc.distanceMeters / 500) * 500;
    }
  } else if (doc.distanceMeters !== undefined) {
    doc.distanceMeters = Math.round(doc.distanceMeters);
  }

  // Remove internal feedLocation to avoid leaking redundant or internal structures
  delete doc.feedLocation;

  // Augment doc.meter with label, countryThreshold, and pointsToNextTier
  const countryThreshold = meter.getCountryThreshold
    ? meter.getCountryThreshold()
    : (process.env.METER_COUNTRY_THRESHOLD ? Number(process.env.METER_COUNTRY_THRESHOLD) : (cfg.thresholds?.country ?? 50));
  const score = doc.meter?.score !== undefined ? Number(doc.meter.score) : 0;
  const tier = doc.tier || 'city';
  const pointsToNextTier = meter.calculatePointsToNextTier
    ? meter.calculatePointsToNextTier(score, tier)
    : (tier === 'country' ? 0 : Math.max(0, countryThreshold - score));

  doc.meter = {
    ...(doc.meter || {}),
    label: cfg.label || 'Oddometer',
    score,
    likes: Number(doc.meter?.likes) || 0,
    dislikes: Number(doc.meter?.dislikes) || 0,
    comments: Number(doc.meter?.comments) || 0,
    commenters: Number(doc.meter?.commenters !== undefined ? doc.meter.commenters : (doc.meter?.comments || 0)),
    visits: Number(doc.meter?.visits) || 0,
    reactions: Number(doc.meter?.reactions) || 0,
    countryThreshold,
    pointsToNextTier,
  };

  return doc;
}

module.exports = {
  serializePost,
  sanitizePost: serializePost,
};
