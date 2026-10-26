// backend/services/geocoder.js
// Geocoder interface: stub default with optional OpenStreetMap Nominatim reverse geocoding.

const { resolveCountry, toCityKey } = require('../utils/place');

/**
 * Reverse geocodes coordinates [lng, lat] into place metadata.
 *
 * @param {number} lng - Longitude
 * @param {number} lat - Latitude
 * @param {object} [fallbackPlace={}] - Client-supplied place fallback
 * @returns {Promise<{ city: string, state?: string, country: string, countryCode: string, cityKey: string }>}
 */
async function reverseGeocode(lng, lat, fallbackPlace = {}) {
  const city = fallbackPlace.city || 'Unknown';
  const state = fallbackPlace.state || undefined;
  const countryInput = fallbackPlace.country || 'India';
  const resolved = resolveCountry(countryInput);
  const country = resolved ? resolved.name : countryInput;
  const countryCode = resolved ? resolved.code : 'IN';
  const cityKey = toCityKey(city);

  // If external Nominatim geocoding is explicitly enabled via environment
  if (process.env.GEODECODER_ENABLED === 'true' && process.env.NOMINATIM_URL) {
    try {
      const url = `${process.env.NOMINATIM_URL}/reverse?format=json&lat=${lat}&lon=${lng}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Oddspot-Backend/1.0' },
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json();
        const address = data.address || {};
        const geoCity = address.city || address.town || address.village || address.suburb || city;
        const geoState = address.state || state;
        const geoCountry = address.country || country;
        const geoCountryCode = address.country_code ? address.country_code.toUpperCase() : countryCode;

        return {
          city: geoCity,
          state: geoState,
          country: geoCountry,
          countryCode: geoCountryCode,
          cityKey: toCityKey(geoCity),
        };
      }
    } catch {
      // Graceful fallback on network timeout or failure
    }
  }

  return {
    city,
    state,
    country,
    countryCode,
    cityKey,
  };
}

module.exports = {
  reverseGeocode,
};
