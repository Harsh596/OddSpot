// backend/utils/postSerializer.js
// Post serialization helper: replaces exact location with feedLocation when hideExact is true,
// quantizes distances to 500m increments for anti-trilateration, and cleans internal fields.

const { fuzzLocation, getHaversineDistance } = require('./fuzzLocation');

/**
 * Serializes a post for public API consumption:
 * - If hideExact is true: replaces location with feedLocation (or computed HMAC fuzzed point) and tags fuzzed: true.
 * - Quantizes distanceMeters to 500m multiples when hideExact is true.
 * - Strips internal database fields like feedLocation before sending to client.
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

  return doc;
}

module.exports = {
  serializePost,
  sanitizePost: serializePost,
};
