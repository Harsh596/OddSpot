import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const RADIUS_OPTIONS = [
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
  { label: '25 km', value: 25000 },
];

export function NearbyFeed({ navigate }) {
  const { user } = useAuth();
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [geoError, setGeoError] = useState('');
  const [radius, setRadius] = useState(10000);

  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Track vote states locally for instant UI feedback
  const [votedPosts, setVotedPosts] = useState({});

  // Request browser location on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser. Please enter coordinates manually.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setManualLat(pos.coords.latitude.toFixed(4));
        setManualLng(pos.coords.longitude.toFixed(4));
        setGeoError('');
      },
      (err) => {
        setGeoError(`Location access denied or unavailable (${err.message}). Enter coordinates manually below.`);
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  }, []);

  const fetchFeed = useCallback(
    async (currentPage = 1, append = false) => {
      if (!coords) return;
      setLoading(true);
      setError('');

      try {
        const res = await api.getNearby(coords.lat, coords.lng, radius, currentPage, 10);
        if (append) {
          setPosts((prev) => [...prev, ...res.posts]);
        } else {
          setPosts(res.posts);
        }
        setHasMore(res.posts.length === 10);
      } catch (err) {
        setError(err.message || 'Failed to load nearby feed.');
      } finally {
        setLoading(false);
      }
    },
    [coords, radius]
  );

  useEffect(() => {
    if (coords) {
      setPage(1);
      fetchFeed(1, false);
    }
  }, [coords, radius, fetchFeed]);

  const handleManualCoordsSubmit = (e) => {
    e.preventDefault();
    const latNum = parseFloat(manualLat);
    const lngNum = parseFloat(manualLng);

    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError('Latitude must be between -90 and 90.');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setError('Longitude must be between -180 and 180.');
      return;
    }

    setCoords({ lat: latNum, lng: lngNum });
    setGeoError('');
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchFeed(nextPage, true);
  };

  const handleVote = async (postId, value, e) => {
    e.stopPropagation();
    if (!user) {
      navigate('#/login');
      return;
    }

    try {
      const res = await api.votePost(postId, value);
      setVotedPosts((prev) => ({
        ...prev,
        [postId]: value,
      }));

      // Update post in feed
      setPosts((prev) =>
        prev.map((p) => {
          if (p._id === postId) {
            return {
              ...p,
              meter: res.meter || p.meter,
              tier: res.tier || p.tier,
            };
          }
          return p;
        })
      );
    } catch (err) {
      alert(err.message || 'Failed to submit vote.');
    }
  };

  const formatDistance = (meters) => {
    if (meters === undefined || meters === null) return '';
    if (meters < 1000) return `${meters} m away`;
    return `${(meters / 1000).toFixed(1)} km away`;
  };

  return (
    <div className="feed-container">
      <div className="feed-header">
        <h1>Nearby Oddities</h1>
        <p className="subtitle">Curated anomalies and weird spots reported around you.</p>

        {geoError && (
          <div className="alert-warning">
            <p>{geoError}</p>
            <form onSubmit={handleManualCoordsSubmit} className="inline-form">
              <input
                type="number"
                step="any"
                placeholder="Latitude (e.g. 12.9716)"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                required
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude (e.g. 77.5946)"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                required
              />
              <button type="submit" className="btn-secondary">
                Set Location
              </button>
            </form>
          </div>
        )}

        <div className="controls-row">
          <div className="radius-control">
            <label htmlFor="radius-select">Search Radius: </label>
            <select
              id="radius-select"
              value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
            >
              {RADIUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {coords && (
            <div className="current-coords">
              📍 Coordinates: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {loading && posts.length === 0 && (
        <div className="loading-state">Scanning radar for nearby oddities...</div>
      )}

      {!loading && !coords && !geoError && (
        <div className="loading-state">Requesting location permissions...</div>
      )}

      {!loading && coords && posts.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🛸</div>
          <h3>No weird spots found within {radius / 1000} km</h3>
          <p>Be the first scout to document an anomaly here!</p>
          <button className="btn-primary" onClick={() => navigate('#/create')}>
            Post a Find
          </button>
        </div>
      )}

      <div className="post-grid">
        {posts.map((post) => {
          const myVote = votedPosts[post._id];
          const hasImage = post.images && post.images.length > 0;

          return (
            <div
              key={post._id}
              className="post-card"
              onClick={() => navigate(`#/post/${post._id}`)}
            >
              {hasImage && (
                <div className="post-thumbnail-wrap">
                  <img
                    src={post.images[0].url}
                    alt={post.title}
                    className="post-thumbnail"
                    loading="lazy"
                  />
                  {post.images.length > 1 && (
                    <span className="image-badge">+{post.images.length - 1}</span>
                  )}
                </div>
              )}

              <div className="post-card-content">
                <div className="post-badges">
                  <span className={`tier-badge tier-${post.tier || 'city'}`}>
                    {(post.tier || 'city').toUpperCase()} TIER
                  </span>
                  {post.hideExact ? (
                    <span className="badge-fuzzed">Approximate location</span>
                  ) : null}
                  <span className="distance-badge">{formatDistance(post.distanceMeters)}</span>
                </div>

                <h3 className="post-title">{post.title}</h3>

                {post.body && (
                  <p className="post-body-snippet">
                    {post.body.length > 120 ? `${post.body.slice(0, 120)}...` : post.body}
                  </p>
                )}

                <div className="post-meta">
                  <span>
                    📍 {post.place?.city}, {post.place?.country}
                  </span>
                  <span>By {post.author?.username || 'Scout'}</span>
                </div>

                <div className="post-footer">
                  <div className="meter-display">
                    <span className="meter-label">Oddity Score:</span>
                    <strong className="meter-value">{post.meter?.score ?? 0}</strong>
                  </div>

                  <div className="vote-actions">
                    <button
                      className={`btn-vote ${myVote === 1 ? 'voted-up' : ''}`}
                      onClick={(e) => handleVote(post._id, 1, e)}
                      title="Like"
                    >
                      👍 {post.meter?.likes ?? 0}
                    </button>
                    <button
                      className={`btn-vote ${myVote === -1 ? 'voted-down' : ''}`}
                      onClick={(e) => handleVote(post._id, -1, e)}
                      title="Dislike"
                    >
                      👎 {post.meter?.dislikes ?? 0}
                    </button>
                    <button
                      className="btn-comment-count"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`#/post/${post._id}`);
                      }}
                    >
                      💬 {post.meter?.comments ?? 0}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && posts.length > 0 && (
        <div className="load-more-wrap">
          <button className="btn-secondary" onClick={handleLoadMore} disabled={loading}>
            {loading ? 'Loading...' : 'Load More Nearby'}
          </button>
        </div>
      )}
    </div>
  );
}
