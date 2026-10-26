// backend/utils/coordinates.js
// Coordinate validation, Null Island rejection, and 6-decimal precision rounding.

/**
 * Validates and rounds an individual coordinate to 6 decimal places (~10cm precision).
 */
function parseStrictCoordinate(val, options = {}) {
  const { min, max, name = 'Coordinate' } = options;

  if (val === undefined || val === null || val === '') {
    const err = new Error(`${name} is required`);
    err.statusCode = 400;
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) {
    const err = new Error(`${name} must be a valid finite number`);
    err.statusCode = 400;
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  if (typeof min === 'number' && num < min) {
    const err = new Error(`${name} must be between ${min} and ${max}`);
    err.statusCode = 400;
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  if (typeof max === 'number' && num > max) {
    const err = new Error(`${name} must be between ${min} and ${max}`);
    err.statusCode = 400;
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  return Number(num.toFixed(6));
}

/**
 * Parses [lng, lat] or coordinate object, checks bounds, rejects (0, 0) Null Island,
 * and rounds both components to 6 decimal places.
 * Returns [lng, lat] in standard GeoJSON format.
 */
function parseLngLat(input) {
  if (!input) {
    const err = new Error('Coordinates are required');
    err.statusCode = 400;
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  let rawLng;
  let rawLat;

  if (Array.isArray(input)) {
    if (input.length !== 2) {
      const err = new Error('Coordinates array must contain exactly [longitude, latitude]');
      err.statusCode = 400;
      err.code = 'VALIDATION_FAILED';
      throw err;
    }
    [rawLng, rawLat] = input;
  } else if (typeof input === 'object') {
    rawLng = input.longitude !== undefined ? input.longitude : input.lng;
    rawLat = input.latitude !== undefined ? input.latitude : input.lat;
  } else {
    const err = new Error('Invalid coordinate format');
    err.statusCode = 400;
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  const lat = parseStrictCoordinate(rawLat, { min: -90, max: 90, name: 'Latitude' });
  const lng = parseStrictCoordinate(rawLng, { min: -180, max: 180, name: 'Longitude' });

  // Null Island rejection (0, 0)
  if (lat === 0 && lng === 0) {
    const err = new Error('Coordinates (0, 0) - Null Island is not permitted');
    err.statusCode = 400;
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  return [lng, lat];
}

module.exports = {
  parseStrictCoordinate,
  parseLngLat,
};
