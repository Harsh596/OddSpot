// backend/utils/impossibleTravel.js
// Velocity-based anomaly detection: flags impossible physical travel (> 1000 km/h).

const { getHaversineDistance } = require('./fuzzLocation');

const MAX_PHYSICAL_SPEED_KMH = 1000; // 1000 km/h maximum plausible physical travel speed

/**
 * Checks if travel from user's last post location to current location exceeds physical limits.
 *
 * @param {object} user - User document
 * @param {[number, number]} currentCoords - [longitude, latitude]
 * @param {Date} [currentTime=new Date()]
 * @returns {{ impossible: boolean, speedKmH?: number, distanceKm?: number, elapsedHours?: number }}
 */
function checkImpossibleTravel(user, currentCoords, currentTime = new Date()) {
  if (
    !user ||
    !user.lastPostLocation ||
    !Array.isArray(user.lastPostLocation.coordinates) ||
    user.lastPostLocation.coordinates.length !== 2
  ) {
    return { impossible: false };
  }

  const lastCoords = user.lastPostLocation.coordinates;
  const lastTime = user.lastPostAt || user.updatedAt || user.createdAt;
  if (!lastTime) return { impossible: false };

  const elapsedMs = new Date(currentTime).getTime() - new Date(lastTime).getTime();
  if (elapsedMs <= 0) {
    return { impossible: false };
  }

  const elapsedHours = elapsedMs / (1000 * 60 * 60);
  const distanceMeters = getHaversineDistance(lastCoords, currentCoords);
  const distanceKm = distanceMeters / 1000;

  // Ignore negligible distances under 5km (local moves, jitter)
  if (distanceKm < 5) {
    return { impossible: false };
  }

  const speedKmH = distanceKm / elapsedHours;

  if (speedKmH > MAX_PHYSICAL_SPEED_KMH) {
    return {
      impossible: true,
      speedKmH: Math.round(speedKmH),
      distanceKm: Math.round(distanceKm),
      elapsedHours: Number(elapsedHours.toFixed(2)),
    };
  }

  return { impossible: false, speedKmH: Math.round(speedKmH), distanceKm: Math.round(distanceKm) };
}

module.exports = {
  checkImpossibleTravel,
  MAX_PHYSICAL_SPEED_KMH,
};
