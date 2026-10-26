// frontend/src/utils/mapCluster.js
// Deterministic Web Mercator projection and marker clustering engine

const TILE_SIZE = 256;

/**
 * Projects latitude and longitude coordinates to Web Mercator pixel space at a given zoom level.
 * @param {number} lat - Latitude in degrees (-85.0511 to 85.0511)
 * @param {number} lng - Longitude in degrees (-180 to 180)
 * @param {number} zoom - Map zoom level (0 to 22)
 * @returns {{ x: number, y: number }} Pixel coordinates
 */
export function latLngToPixel(lat, lng, zoom = 0) {
  const worldSize = TILE_SIZE * Math.pow(2, zoom);
  const x = ((lng + 180) / 360) * worldSize;

  const sinLat = Math.max(Math.min(Math.sin((lat * Math.PI) / 180), 0.9999), -0.9999);
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;

  return { x, y };
}

/**
 * Converts Web Mercator pixel coordinates back to latitude and longitude degrees.
 * @param {number} x - Pixel X coordinate
 * @param {number} y - Pixel Y coordinate
 * @param {number} zoom - Map zoom level
 * @returns {{ lat: number, lng: number }}
 */
export function pixelToLatLng(x, y, zoom = 0) {
  const worldSize = TILE_SIZE * Math.pow(2, zoom);
  const lng = (x / worldSize) * 360 - 180;

  const n = Math.PI - (2 * Math.PI * y) / worldSize;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

  return { lat, lng };
}

/**
 * Safely extracts latitude and longitude from a post document.
 * Handles GeoJSON Point coordinates [lng, lat], fuzzed feedLocation, and scalar lat/lng.
 * @param {object} post - Post document
 * @returns {{ lat: number, lng: number } | null}
 */
export function extractPostCoords(post) {
  if (!post) return null;

  // 1. Check GeoJSON location Point: coordinates: [longitude, latitude]
  if (
    post.location &&
    Array.isArray(post.location.coordinates) &&
    post.location.coordinates.length >= 2
  ) {
    const lng = Number(post.location.coordinates[0]);
    const lat = Number(post.location.coordinates[1]);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && !(lat === 0 && lng === 0)) {
      return { lat, lng };
    }
  }

  // 2. Check feedLocation Point (for fuzzed posts)
  if (
    post.feedLocation &&
    Array.isArray(post.feedLocation.coordinates) &&
    post.feedLocation.coordinates.length >= 2
  ) {
    const lng = Number(post.feedLocation.coordinates[0]);
    const lat = Number(post.feedLocation.coordinates[1]);
    if (!Number.isNaN(lat) && !Number.isNaN(lng) && !(lat === 0 && lng === 0)) {
      return { lat, lng };
    }
  }

  // 3. Check direct lat / lng or latitude / longitude properties
  const lat = Number(post.latitude ?? post.lat ?? post.location?.lat);
  const lng = Number(post.longitude ?? post.lng ?? post.location?.lng);

  if (!Number.isNaN(lat) && !Number.isNaN(lng) && !(lat === 0 && lng === 0)) {
    return { lat, lng };
  }

  return null;
}

/**
 * Calculates Euclidean pixel distance between two projected coordinates.
 */
function getPixelDistance(p1, p2) {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Groups an array of posts into deterministic clusters based on Web Mercator pixel proximity.
 *
 * @param {Array<object>} posts - Array of post items
 * @param {number} [zoomLevel=13] - Current map zoom level
 * @param {number} [clusterRadiusPx=50] - Distance in pixels within which markers merge
 * @returns {Array<object>} Array of cluster items and individual posts
 */
export function clusterMarkers(posts = [], zoomLevel = 13, clusterRadiusPx = 50) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return [];
  }

  // Filter posts with valid coordinates and compute their pixel positions
  const validItems = [];
  for (const post of posts) {
    const coords = extractPostCoords(post);
    if (coords && coords.lat >= -90 && coords.lat <= 90 && coords.lng >= -180 && coords.lng <= 180) {
      const pixel = latLngToPixel(coords.lat, coords.lng, zoomLevel);
      validItems.push({
        post,
        lat: coords.lat,
        lng: coords.lng,
        pixelX: pixel.x,
        pixelY: pixel.y,
        id: String(post._id || post.id || Math.random()),
      });
    }
  }

  // Sort deterministically by ID to ensure stable clustering independent of input order
  validItems.sort((a, b) => a.id.localeCompare(b.id));

  const clusters = [];

  for (const item of validItems) {
    let closestCluster = null;
    let minDistance = Infinity;

    // Check existing clusters
    for (const cluster of clusters) {
      const dist = getPixelDistance(
        { x: item.pixelX, y: item.pixelY },
        { x: cluster.pixelX, y: cluster.pixelY }
      );
      if (dist <= clusterRadiusPx && dist < minDistance) {
        minDistance = dist;
        closestCluster = cluster;
      }
    }

    if (closestCluster) {
      // Add to cluster and update centroid
      closestCluster.items.push(item);
      const count = closestCluster.items.length;

      // Incremental weighted center
      closestCluster.lat =
        (closestCluster.lat * (count - 1) + item.lat) / count;
      closestCluster.lng =
        (closestCluster.lng * (count - 1) + item.lng) / count;

      // Update projected center
      const newPixel = latLngToPixel(closestCluster.lat, closestCluster.lng, zoomLevel);
      closestCluster.pixelX = newPixel.x;
      closestCluster.pixelY = newPixel.y;

      // Update bounding box
      closestCluster.bounds.minLat = Math.min(closestCluster.bounds.minLat, item.lat);
      closestCluster.bounds.maxLat = Math.max(closestCluster.bounds.maxLat, item.lat);
      closestCluster.bounds.minLng = Math.min(closestCluster.bounds.minLng, item.lng);
      closestCluster.bounds.maxLng = Math.max(closestCluster.bounds.maxLng, item.lng);
    } else {
      // Start a new cluster
      clusters.push({
        id: `cluster-${item.id}`,
        lat: item.lat,
        lng: item.lng,
        pixelX: item.pixelX,
        pixelY: item.pixelY,
        items: [item],
        bounds: {
          minLat: item.lat,
          maxLat: item.lat,
          minLng: item.lng,
          maxLng: item.lng,
        },
      });
    }
  }

  // Format final output
  return clusters.map((cluster) => {
    const count = cluster.items.length;
    const isCluster = count > 1;

    if (!isCluster) {
      const singleItem = cluster.items[0];
      return {
        id: singleItem.id,
        isCluster: false,
        count: 1,
        lat: singleItem.lat,
        lng: singleItem.lng,
        post: singleItem.post,
        posts: [singleItem.post],
        bounds: cluster.bounds,
      };
    }

    return {
      id: cluster.id,
      isCluster: true,
      count,
      lat: cluster.lat,
      lng: cluster.lng,
      posts: cluster.items.map((it) => it.post),
      post: cluster.items[0].post,
      bounds: cluster.bounds,
    };
  });
}
