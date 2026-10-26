// backend/utils/fuzzLocation.js
// Deterministic HMAC-SHA256 polar coordinate fuzzing (150m..400m).
// Anti-trilateration guarantee: The fuzzed location is computed once, indexed as feedLocation,
// and all distances are measured relative to feedLocation, making geometric trilateration impossible.

const crypto = require('crypto');

const EARTH_RADIUS_METERS = 6371000;
const MIN_FUZZ_DISTANCE = 150; // 150 meters minimum offset
const MAX_FUZZ_DISTANCE = 400; // 400 meters maximum offset

/**
 * Deterministically fuzzes geographic coordinates using HMAC-SHA256 polar coordinates.
 * Displaces the original coordinates by a distance r in [150m, 400m] at an angle theta in [0, 2*PI).
 *
 * @param {[number, number]} coordinates - [longitude, latitude]
 * @param {string} [seed=''] - Optional post ID or identifier for per-resource unique fuzzing
 * @returns {[number, number]} - Fuzzed [longitude, latitude] rounded to 6 decimals
 */
function fuzzLocation(coordinates, seed = '') {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return coordinates;
  }
  const [lng, lat] = coordinates;
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    return coordinates;
  }

  const salt =
    process.env.LOCATION_FUZZ_SALT ||
    'oddspot-default-location-fuzz-salt-2026';

  const message = `${seed || ''}:${lng.toFixed(6)}:${lat.toFixed(6)}`;
  const hmac = crypto.createHmac('sha256', salt).update(message).digest();

  // Derive angle theta in [0, 2*PI) from the first 4 bytes
  const angleInt = hmac.readUInt32BE(0);
  const theta = (angleInt / 0xffffffff) * 2 * Math.PI;

  // Derive distance r in [150m, 400m] from bytes 4..7
  const distInt = hmac.readUInt32BE(4);
  const r = MIN_FUZZ_DISTANCE + (distInt / 0xffffffff) * (MAX_FUZZ_DISTANCE - MIN_FUZZ_DISTANCE);

  // Spherical displacement
  const deltaLat = (r * Math.cos(theta) / EARTH_RADIUS_METERS) * (180 / Math.PI);
  const latRad = (lat * Math.PI) / 180;
  // Guard against division by 0 at the exact poles
  const cosLat = Math.max(0.00001, Math.cos(latRad));
  const deltaLng = (r * Math.sin(theta) / (EARTH_RADIUS_METERS * cosLat)) * (180 / Math.PI);

  let fuzzedLat = Number((lat + deltaLat).toFixed(6));
  let fuzzedLng = Number((lng + deltaLng).toFixed(6));

  // Clamp bounds
  fuzzedLat = Math.max(-90, Math.min(90, fuzzedLat));
  if (fuzzedLng > 180) fuzzedLng -= 360;
  if (fuzzedLng < -180) fuzzedLng += 360;
  fuzzedLng = Number(fuzzedLng.toFixed(6));

  return [fuzzedLng, fuzzedLat];
}

/**
 * Computes the great-circle distance between two [lng, lat] points in meters using Haversine formula.
 *
 * @param {[number, number]} coord1 - [lng1, lat1]
 * @param {[number, number]} coord2 - [lng2, lat2]
 * @returns {number} Distance in meters
 */
function getHaversineDistance(coord1, coord2) {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;

  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

module.exports = {
  fuzzLocation,
  getHaversineDistance,
  MIN_FUZZ_DISTANCE,
  MAX_FUZZ_DISTANCE,
};
