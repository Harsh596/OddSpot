// backend/test/mapCluster.test.js
// Unit tests for Web Mercator projection and deterministic marker clustering

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

describe('Map Clustering & Web Mercator Projection Unit Tests', async () => {
  const {
    latLngToPixel,
    pixelToLatLng,
    extractPostCoords,
    clusterMarkers,
  } = await import('../../frontend/src/utils/mapCluster.js');

  it('1. latLngToPixel and pixelToLatLng roundtrip accurately', () => {
    const lat = 12.9716;
    const lng = 77.5946;
    const zoom = 14;

    const pixel = latLngToPixel(lat, lng, zoom);
    assert.ok(typeof pixel.x === 'number' && typeof pixel.y === 'number');
    assert.ok(pixel.x > 0 && pixel.y > 0);

    const roundtrip = pixelToLatLng(pixel.x, pixel.y, zoom);
    assert.ok(Math.abs(roundtrip.lat - lat) < 0.0001, `Lat mismatch: ${roundtrip.lat} vs ${lat}`);
    assert.ok(Math.abs(roundtrip.lng - lng) < 0.0001, `Lng mismatch: ${roundtrip.lng} vs ${lng}`);
  });

  it('2. extractPostCoords handles GeoJSON, feedLocation, and scalar coordinates', () => {
    // GeoJSON [lng, lat]
    const p1 = { location: { coordinates: [77.59, 12.97] } };
    assert.deepEqual(extractPostCoords(p1), { lat: 12.97, lng: 77.59 });

    // feedLocation [lng, lat]
    const p2 = { feedLocation: { coordinates: [-122.41, 37.77] } };
    assert.deepEqual(extractPostCoords(p2), { lat: 37.77, lng: -122.41 });

    // Scalar lat/lng
    const p3 = { latitude: 51.5074, longitude: -0.1278 };
    assert.deepEqual(extractPostCoords(p3), { lat: 51.5074, lng: -0.1278 });

    // Missing / invalid
    assert.equal(extractPostCoords(null), null);
    assert.equal(extractPostCoords({}), null);
    assert.equal(extractPostCoords({ location: { coordinates: [0, 0] } }), null);
  });

  it('3. clusterMarkers groups adjacent posts and preserves distant posts', () => {
    const posts = [
      // Close cluster in Bangalore (within ~50m)
      { _id: 'post_1', title: 'Spot A', location: { coordinates: [77.5946, 12.9716] } },
      { _id: 'post_2', title: 'Spot B', location: { coordinates: [77.5948, 12.9718] } },
      { _id: 'post_3', title: 'Spot C', location: { coordinates: [77.5950, 12.9717] } },
      // Distant post (Whitefield ~15 km away)
      { _id: 'post_4', title: 'Spot D', location: { coordinates: [77.7500, 12.9700] } },
    ];

    const clusters = clusterMarkers(posts, 12, 50);

    // Should produce 2 groups: 1 cluster of 3 spots, and 1 single spot
    assert.equal(clusters.length, 2);

    const multi = clusters.find((c) => c.isCluster);
    const single = clusters.find((c) => !c.isCluster);

    assert.ok(multi, 'Expected a cluster');
    assert.equal(multi.count, 3);
    assert.equal(multi.posts.length, 3);

    assert.ok(single, 'Expected a single marker');
    assert.equal(single.count, 1);
    assert.equal(single.post._id, 'post_4');
  });

  it('4. clusterMarkers is deterministic independent of input array order', () => {
    const posts1 = [
      { _id: 'a', location: { coordinates: [77.59, 12.97] } },
      { _id: 'b', location: { coordinates: [77.5905, 12.9705] } },
      { _id: 'c', location: { coordinates: [77.80, 13.10] } },
    ];

    const posts2 = [
      { _id: 'c', location: { coordinates: [77.80, 13.10] } },
      { _id: 'a', location: { coordinates: [77.59, 12.97] } },
      { _id: 'b', location: { coordinates: [77.5905, 12.9705] } },
    ];

    const res1 = clusterMarkers(posts1, 10, 50);
    const res2 = clusterMarkers(posts2, 10, 50);

    assert.equal(res1.length, res2.length);
    assert.equal(res1[0].count, res2[0].count);
    assert.equal(res1[1].count, res2[1].count);
  });

  it('5. clusterMarkers handles empty or invalid inputs gracefully', () => {
    assert.deepEqual(clusterMarkers([]), []);
    assert.deepEqual(clusterMarkers(null), []);
    assert.deepEqual(clusterMarkers([{ _id: 'invalid', location: null }]), []);
  });
});
