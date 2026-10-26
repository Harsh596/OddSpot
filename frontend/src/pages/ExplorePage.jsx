import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { OddspotMap } from '../components/map/OddspotMap';
import { LoadingSkeleton, EmptyState, ErrorBanner } from '../components/ui/StatusViews';

const RADIUS_OPTIONS = [
  { label: '1 km', value: 1000 },
  { label: '2 km', value: 2000 },
  { label: '5 km', value: 5000 },
  { label: '10 km', value: 10000 },
  { label: '25 km', value: 25000 },
];

const CATEGORY_TAGS = [
  { id: 'all', label: 'All Anomalies', icon: '✨' },
  { id: 'urban_decay', label: 'Urban Decay', icon: '🏚️' },
  { id: 'hidden_art', label: 'Hidden Art', icon: '🎨' },
  { id: 'nature_anomaly', label: 'Nature Glitch', icon: '🌿' },
  { id: 'historic_echo', label: 'Historic Echo', icon: '🏛️' },
  { id: 'quirky_sign', label: 'Quirky Sign', icon: '🪧' },
  { id: 'architecture', label: 'Architecture', icon: '📐' },
];

const PRESET_CITIES = [
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946, country: 'India' },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194, country: 'USA' },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, country: 'Japan' },
  { name: 'London', lat: 51.5074, lng: -0.1278, country: 'UK' },
  { name: 'Berlin', lat: 52.52, lng: 13.405, country: 'Germany' },
];

/**
 * ExplorePage - Combined geospatial radar & regional feed explorer
 * with interactive Leaflet map, deterministic clustering, category pills,
 * and split/list/map viewport view switchers.
 */
export function ExplorePage({ navigate }) {
  const { user } = useAuth();

  // Mode: 'nearby' (GPS) vs 'city' (Regional)
  const [feedMode, setFeedMode] = useState('nearby');
  const [selectedCity, setSelectedCity] = useState(PRESET_CITIES[0]);

  // View Layout: 'split' | 'list' | 'map'
  const [viewMode, setViewMode] = useState('split');

  // Location state
  const [coords, setCoords] = useState(null); // { lat, lng }
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [geoError, setGeoError] = useState('');
  const [radius, setRadius] = useState(10000);

  // Filters & Sorting
  const [activeCategory, setActiveCategory] = useState('all');
  const [sortOption, setSortOption] = useState('hot');
  const [searchQuery, setSearchQuery] = useState('');

  // Data & Pagination
  const [posts, setPosts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Selection & Local voting
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [votedPosts, setVotedPosts] = useState({});

  // Request browser geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser. Enter coordinates below.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setCoords(userCoords);
        setManualLat(userCoords.lat.toFixed(4));
        setManualLng(userCoords.lng.toFixed(4));
        setGeoError('');
      },
      (err) => {
        setGeoError(`Location access unavailable (${err.message}). Enter coordinates manually or select a city.`);
        // Fallback to default city coords
        setCoords({ lat: PRESET_CITIES[0].lat, lng: PRESET_CITIES[0].lng });
        setManualLat(PRESET_CITIES[0].lat.toString());
        setManualLng(PRESET_CITIES[0].lng.toString());
      },
      { timeout: 8000, enableHighAccuracy: false }
    );
  }, []);

  // Fetch feed content based on active mode
  const fetchFeed = useCallback(
    async (currentPage = 1, append = false) => {
      setLoading(true);
      setError('');

      try {
        let fetchedPosts = [];
        let moreAvailable = false;

        if (feedMode === 'nearby') {
          if (!coords) return;
          const res = await api.getNearby(coords.lat, coords.lng, radius, currentPage, 12);
          fetchedPosts = res.posts || [];
          moreAvailable = fetchedPosts.length === 12;
        } else {
          // City feed
          const res = await api.getCityFeed({
            city: selectedCity.name,
            country: selectedCity.country,
            sort: sortOption,
            limit: 12,
          });
          fetchedPosts = res.posts || [];
          moreAvailable = Boolean(res.hasMore || res.nextCursor);
        }

        if (append) {
          setPosts((prev) => [...prev, ...fetchedPosts]);
        } else {
          setPosts(fetchedPosts);
        }
        setHasMore(moreAvailable);
      } catch (err) {
        setError(err.message || 'Failed to scan sectors for oddities.');
      } finally {
        setLoading(false);
      }
    },
    [feedMode, coords, radius, selectedCity, sortOption]
  );

  useEffect(() => {
    setPage(1);
    fetchFeed(1, false);
  }, [fetchFeed]);

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
      setError(err.message || 'Failed to submit vote.');
    }
  };

  // Filter posts by category and search text
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // Category tag match
      if (activeCategory !== 'all') {
        const tags = Array.isArray(post.tags) ? post.tags : [];
        const hasTag = tags.some((t) => t.toLowerCase().includes(activeCategory));
        const matchesType = post.type && post.type.toLowerCase().includes(activeCategory);
        if (!hasTag && !matchesType) return false;
      }

      // Realtime search text filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const inTitle = post.title?.toLowerCase().includes(query);
        const inBody = post.body?.toLowerCase().includes(query);
        const inCity = post.place?.city?.toLowerCase().includes(query);
        if (!inTitle && !inBody && !inCity) return false;
      }

      return true;
    });
  }, [posts, activeCategory, searchQuery]);

  // Map center calculation
  const mapCenter = useMemo(() => {
    if (feedMode === 'nearby' && coords) {
      return [coords.lat, coords.lng];
    }
    return [selectedCity.lat, selectedCity.lng];
  }, [feedMode, coords, selectedCity]);

  const formatDistance = (meters) => {
    if (meters === undefined || meters === null) return '';
    if (meters < 1000) return `${meters} m away`;
    return `${(meters / 1000).toFixed(1)} km away`;
  };

  return (
    <div className="explore-page-container" style={{ width: '100%', padding: '0 var(--space-4, 16px)' }}>
      {/* Top Header & Feed Mode Switcher */}
      <div
        className="explore-header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4, 16px)',
          margin: 'var(--space-6, 24px) 0 var(--space-4, 16px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3, 12px)' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 'var(--text-3xl, 1.875rem)', letterSpacing: '-0.5px' }}>
              Anomaly Radar
            </h1>
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary, #94a3b8)', fontSize: 'var(--text-sm, 0.875rem)' }}>
              Locate oddities, mysterious architecture, and hidden artifacts on the map.
            </p>
          </div>

          {/* Mode Switcher Tabs */}
          <div
            className="feed-mode-tabs"
            role="tablist"
            aria-label="Feed Mode"
            style={{
              display: 'flex',
              background: 'var(--bg-surface, #121722)',
              padding: '4px',
              borderRadius: 'var(--radius-lg, 12px)',
              border: '1px solid var(--border-subtle, #202738)',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={feedMode === 'nearby'}
              className={`mode-tab ${feedMode === 'nearby' ? 'active' : ''}`}
              onClick={() => setFeedMode('nearby')}
              style={{
                cursor: 'pointer',
                padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                borderRadius: 'var(--radius-md, 8px)',
                border: 'none',
                background: feedMode === 'nearby' ? 'var(--accent, #00f0ff)' : 'transparent',
                color: feedMode === 'nearby' ? 'var(--text-inverse, #0b0e14)' : 'var(--text-secondary, #94a3b8)',
                fontWeight: 700,
                fontSize: 'var(--text-xs, 0.75rem)',
                transition: 'all var(--transition-fast, 150ms ease)',
              }}
            >
              📍 GPS Radar
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={feedMode === 'city'}
              className={`mode-tab ${feedMode === 'city' ? 'active' : ''}`}
              onClick={() => setFeedMode('city')}
              style={{
                cursor: 'pointer',
                padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                borderRadius: 'var(--radius-md, 8px)',
                border: 'none',
                background: feedMode === 'city' ? 'var(--accent, #00f0ff)' : 'transparent',
                color: feedMode === 'city' ? 'var(--text-inverse, #0b0e14)' : 'var(--text-secondary, #94a3b8)',
                fontWeight: 700,
                fontSize: 'var(--text-xs, 0.75rem)',
                transition: 'all var(--transition-fast, 150ms ease)',
              }}
            >
              🏙️ City Explorer
            </button>
          </div>
        </div>

        {/* Location Alerts & Manual Coordinate Override */}
        {geoError && feedMode === 'nearby' && (
          <div
            className="geo-alert-box"
            style={{
              padding: 'var(--space-3, 12px) var(--space-4, 16px)',
              background: 'var(--color-warning-bg, rgba(245, 158, 11, 0.12))',
              border: '1px solid var(--color-warning, #f59e0b)',
              borderRadius: 'var(--radius-md, 8px)',
              fontSize: 'var(--text-xs, 0.75rem)',
              color: 'var(--text-primary, #f0f4fc)',
            }}
          >
            <p style={{ margin: '0 0 var(--space-2, 8px)' }}>{geoError}</p>
            <form onSubmit={handleManualCoordsSubmit} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={manualLat}
                onChange={(e) => setManualLat(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--border-subtle, #202738)',
                  background: 'var(--bg-elevated, #1a2030)',
                  color: 'var(--text-primary, #f0f4fc)',
                }}
                required
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={manualLng}
                onChange={(e) => setManualLng(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: '1px solid var(--border-subtle, #202738)',
                  background: 'var(--bg-elevated, #1a2030)',
                  color: 'var(--text-primary, #f0f4fc)',
                }}
                required
              />
              <button
                type="submit"
                style={{
                  padding: '4px 12px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: 'none',
                  background: 'var(--accent, #00f0ff)',
                  color: 'var(--text-inverse, #0b0e14)',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Set Coordinates
              </button>
            </form>
          </div>
        )}

        {/* Global Control Bar: Radius/City + Sort + Search + View Switcher */}
        <div
          className="controls-bar"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 'var(--space-3, 12px)',
            padding: 'var(--space-3, 12px) var(--space-4, 16px)',
            background: 'var(--bg-surface, #121722)',
            border: '1px solid var(--border-subtle, #202738)',
            borderRadius: 'var(--radius-lg, 12px)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3, 12px)', flexWrap: 'wrap' }}>
            {feedMode === 'nearby' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs, 0.75rem)' }}>
                <label htmlFor="radius-select" style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
                  Radar Radius:
                </label>
                <select
                  id="radius-select"
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    background: 'var(--bg-elevated, #1a2030)',
                    color: 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-subtle, #202738)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                  }}
                >
                  {RADIUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs, 0.75rem)' }}>
                <label htmlFor="city-select" style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
                  Sector City:
                </label>
                <select
                  id="city-select"
                  value={selectedCity.name}
                  onChange={(e) => {
                    const match = PRESET_CITIES.find((c) => c.name === e.target.value);
                    if (match) setSelectedCity(match);
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 'var(--radius-sm, 4px)',
                    background: 'var(--bg-elevated, #1a2030)',
                    color: 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-subtle, #202738)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                  }}
                >
                  {PRESET_CITIES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} ({c.country})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs, 0.75rem)' }}>
              <label htmlFor="sort-select" style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
                Sort:
              </label>
              <select
                id="sort-select"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                style={{
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  background: 'var(--bg-elevated, #1a2030)',
                  color: 'var(--text-primary, #f0f4fc)',
                  border: '1px solid var(--border-subtle, #202738)',
                  fontSize: 'var(--text-xs, 0.75rem)',
                }}
              >
                <option value="hot">🔥 Hot & Trending</option>
                <option value="new">⚡ Latest Sightings</option>
                <option value="top">🏆 Highest Rated</option>
              </select>
            </div>
          </div>

          {/* Search Input & View Switchers */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3, 12px)' }}>
            <input
              type="text"
              placeholder="Search spots..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Filter spots by title or place"
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--bg-elevated, #1a2030)',
                color: 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                fontSize: 'var(--text-xs, 0.75rem)',
                width: '140px',
              }}
            />

            {/* View Mode Toggle: Split / List / Map */}
            <div
              className="view-mode-buttons"
              role="group"
              aria-label="Viewport Layout"
              style={{
                display: 'flex',
                background: 'var(--bg-elevated, #1a2030)',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '2px',
                border: '1px solid var(--border-subtle, #202738)',
              }}
            >
              <button
                type="button"
                title="Split View (Map + List)"
                aria-label="Split View"
                aria-pressed={viewMode === 'split'}
                onClick={() => setViewMode('split')}
                style={{
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: 'none',
                  background: viewMode === 'split' ? 'var(--accent, #00f0ff)' : 'transparent',
                  color: viewMode === 'split' ? 'var(--text-inverse, #0b0e14)' : 'var(--text-secondary, #94a3b8)',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                Split
              </button>
              <button
                type="button"
                title="List View Only"
                aria-label="List View"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                style={{
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: 'none',
                  background: viewMode === 'list' ? 'var(--accent, #00f0ff)' : 'transparent',
                  color: viewMode === 'list' ? 'var(--text-inverse, #0b0e14)' : 'var(--text-secondary, #94a3b8)',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                List
              </button>
              <button
                type="button"
                title="Map View Only"
                aria-label="Map View"
                aria-pressed={viewMode === 'map'}
                onClick={() => setViewMode('map')}
                style={{
                  cursor: 'pointer',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-sm, 4px)',
                  border: 'none',
                  background: viewMode === 'map' ? 'var(--accent, #00f0ff)' : 'transparent',
                  color: viewMode === 'map' ? 'var(--text-inverse, #0b0e14)' : 'var(--text-secondary, #94a3b8)',
                  fontSize: '11px',
                  fontWeight: 700,
                }}
              >
                Map
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div
          className="category-pills"
          role="region"
          aria-label="Category filters"
          style={{
            display: 'flex',
            gap: 'var(--space-2, 8px)',
            overflowX: 'auto',
            paddingBottom: '4px',
            scrollbarWidth: 'none',
          }}
        >
          {CATEGORY_TAGS.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              aria-pressed={activeCategory === cat.id}
              style={{
                cursor: 'pointer',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full, 9999px)',
                background: activeCategory === cat.id ? 'var(--accent-subtle, rgba(0,240,255,0.15))' : 'var(--bg-surface, #121722)',
                color: activeCategory === cat.id ? 'var(--accent, #00f0ff)' : 'var(--text-secondary, #94a3b8)',
                border: activeCategory === cat.id ? '1px solid var(--accent, #00f0ff)' : '1px solid var(--border-subtle, #202738)',
                fontSize: 'var(--text-xs, 0.75rem)',
                fontWeight: activeCategory === cat.id ? 700 : 500,
                transition: 'all var(--transition-fast, 150ms ease)',
              }}
            >
              <span>{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {/* Main Viewport Content: Split / Map / List */}
      <div
        className={`explore-viewport view-${viewMode}`}
        style={{
          display: 'grid',
          gridTemplateColumns:
            viewMode === 'split' ? 'minmax(380px, 1fr) minmax(340px, 1fr)' : '1fr',
          gap: 'var(--space-6, 24px)',
          alignItems: 'start',
          marginBottom: 'var(--space-8, 32px)',
        }}
      >
        {/* Map Section (Shown in 'split' and 'map' modes) */}
        {(viewMode === 'split' || viewMode === 'map') && (
          <div
            className="explore-map-container"
            style={{
              position: viewMode === 'split' ? 'sticky' : 'relative',
              top: viewMode === 'split' ? '80px' : 0,
              width: '100%',
              height: viewMode === 'map' ? '650px' : '520px',
            }}
          >
            <OddspotMap
              posts={filteredPosts}
              center={mapCenter}
              zoom={13}
              selectedPostId={selectedPostId}
              onSelectPost={(post) => setSelectedPostId(post._id)}
              style={{ height: '100%' }}
            />
          </div>
        )}

        {/* Feed List Section (Shown in 'split' and 'list' modes) */}
        {(viewMode === 'split' || viewMode === 'list') && (
          <div className="explore-feed-list" style={{ width: '100%' }}>
            {loading && posts.length === 0 && <LoadingSkeleton count={4} type="feed" />}

            {!loading && filteredPosts.length === 0 && (
              <EmptyState
                title="No Anomalies in this Sector"
                message={
                  searchQuery || activeCategory !== 'all'
                    ? 'No spots matched your current search or category filters. Try expanding your parameters.'
                    : `No weird spots found within ${radius / 1000} km. Be the first scout to report an anomaly here!`
                }
                icon="🛸"
                actionText="+ Post a Find"
                onAction={() => navigate('#/create')}
              />
            )}

            <div
              className="post-grid"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-4, 16px)',
              }}
            >
              {filteredPosts.map((post) => {
                const myVote = votedPosts[post._id];
                const hasImage = post.images && post.images.length > 0;
                const isSelected = selectedPostId === post._id;

                return (
                  <div
                    key={post._id}
                    className={`post-card ${isSelected ? 'selected-card' : ''}`}
                    onClick={() => {
                      setSelectedPostId(post._id);
                      navigate(`#/post/${post._id}`);
                    }}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      gap: 'var(--space-4, 16px)',
                      padding: 'var(--space-4, 16px)',
                      background: 'var(--bg-surface, #121722)',
                      border: isSelected
                        ? '1px solid var(--accent, #00f0ff)'
                        : '1px solid var(--border-subtle, #202738)',
                      borderRadius: 'var(--radius-lg, 12px)',
                      boxShadow: isSelected
                        ? 'var(--accent-glow, 0 0 14px rgba(0,240,255,0.3))'
                        : 'var(--shadow-card, 0 4px 12px rgba(0,0,0,0.3))',
                      transition: 'all var(--transition-fast, 150ms ease)',
                    }}
                  >
                    {hasImage && (
                      <div
                        className="post-thumbnail-wrap"
                        style={{
                          width: '110px',
                          height: '110px',
                          flexShrink: 0,
                          borderRadius: 'var(--radius-md, 8px)',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        <img
                          src={post.images[0].url}
                          alt={post.title}
                          className="post-thumbnail"
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {post.images.length > 1 && (
                          <span
                            className="image-badge"
                            style={{
                              position: 'absolute',
                              bottom: '4px',
                              right: '4px',
                              background: 'rgba(0,0,0,0.75)',
                              color: '#fff',
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 5px',
                              borderRadius: '4px',
                            }}
                          >
                            +{post.images.length - 1}
                          </span>
                        )}
                      </div>
                    )}

                    <div
                      className="post-card-content"
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flexGrow: 1,
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div
                          className="post-badges"
                          style={{
                            display: 'flex',
                            gap: '6px',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            marginBottom: '6px',
                          }}
                        >
                          <span
                            className={`tier-badge tier-${post.tier || 'city'}`}
                            style={{
                              fontSize: 'var(--text-2xs, 11px)',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: 'var(--radius-sm, 4px)',
                              background: 'var(--accent-subtle, rgba(0,240,255,0.12))',
                              color: 'var(--accent, #00f0ff)',
                              textTransform: 'uppercase',
                            }}
                          >
                            {(post.tier || 'city').toUpperCase()} TIER
                          </span>

                          {post.hideExact && (
                            <span
                              className="badge-fuzzed"
                              style={{
                                fontSize: 'var(--text-2xs, 11px)',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: 'var(--radius-sm, 4px)',
                                background: 'var(--color-warning-bg, rgba(245, 158, 11, 0.12))',
                                color: 'var(--color-warning, #f59e0b)',
                                border: '1px dashed var(--color-warning, #f59e0b)',
                              }}
                            >
                              ◌ 400m Area
                            </span>
                          )}

                          {post.distanceMeters !== undefined && (
                            <span
                              className="distance-badge"
                              style={{
                                fontSize: 'var(--text-2xs, 11px)',
                                color: 'var(--text-muted, #64748b)',
                              }}
                            >
                              {formatDistance(post.distanceMeters)}
                            </span>
                          )}
                        </div>

                        <h3
                          className="post-title"
                          style={{
                            margin: '0 0 6px',
                            fontSize: 'var(--text-base, 1rem)',
                            fontWeight: 700,
                            color: 'var(--text-primary, #f0f4fc)',
                            lineHeight: 1.3,
                          }}
                        >
                          {post.title}
                        </h3>

                        {post.body && (
                          <p
                            className="post-body-snippet"
                            style={{
                              margin: '0 0 8px',
                              fontSize: 'var(--text-xs, 0.75rem)',
                              color: 'var(--text-secondary, #94a3b8)',
                              lineHeight: 1.4,
                            }}
                          >
                            {post.body.length > 110 ? `${post.body.slice(0, 110)}...` : post.body}
                          </p>
                        )}
                      </div>

                      <div
                        className="post-footer"
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '8px',
                          paddingTop: '8px',
                          borderTop: '1px solid var(--border-subtle, #202738)',
                        }}
                      >
                        <div
                          className="meter-display"
                          style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--text-secondary, #94a3b8)' }}
                        >
                          Score: <strong style={{ color: 'var(--accent, #00f0ff)' }}>{post.meter?.score ?? 0}</strong>
                        </div>

                        <div className="vote-actions" style={{ display: 'flex', gap: '6px' }}>
                          <button
                            type="button"
                            className={`btn-vote ${myVote === 1 ? 'voted-up' : ''}`}
                            onClick={(e) => handleVote(post._id, 1, e)}
                            style={{
                              cursor: 'pointer',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm, 4px)',
                              background: myVote === 1 ? 'var(--color-success-bg, rgba(16,185,129,0.2))' : 'var(--bg-elevated, #1a2030)',
                              color: myVote === 1 ? 'var(--color-success, #10b981)' : 'var(--text-primary, #f0f4fc)',
                              border: '1px solid var(--border-subtle, #202738)',
                              fontSize: 'var(--text-xs, 0.75rem)',
                              fontWeight: 600,
                            }}
                          >
                            👍 {post.meter?.likes ?? 0}
                          </button>
                          <button
                            type="button"
                            className={`btn-vote ${myVote === -1 ? 'voted-down' : ''}`}
                            onClick={(e) => handleVote(post._id, -1, e)}
                            style={{
                              cursor: 'pointer',
                              padding: '2px 8px',
                              borderRadius: 'var(--radius-sm, 4px)',
                              background: myVote === -1 ? 'var(--color-danger-bg, rgba(239,68,68,0.2))' : 'var(--bg-elevated, #1a2030)',
                              color: myVote === -1 ? 'var(--color-danger, #ef4444)' : 'var(--text-primary, #f0f4fc)',
                              border: '1px solid var(--border-subtle, #202738)',
                              fontSize: 'var(--text-xs, 0.75rem)',
                              fontWeight: 600,
                            }}
                          >
                            👎 {post.meter?.dislikes ?? 0}
                          </button>
                          <span
                            style={{
                              padding: '2px 8px',
                              fontSize: 'var(--text-xs, 0.75rem)',
                              color: 'var(--text-muted, #64748b)',
                              display: 'flex',
                              alignItems: 'center',
                            }}
                          >
                            💬 {post.meter?.comments ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && filteredPosts.length > 0 && (
              <div style={{ textAlign: 'center', margin: 'var(--space-6, 24px) 0' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    const nextPage = page + 1;
                    setPage(nextPage);
                    fetchFeed(nextPage, true);
                  }}
                  disabled={loading}
                  style={{
                    cursor: 'pointer',
                    padding: 'var(--space-2, 8px) var(--space-6, 24px)',
                    background: 'var(--bg-surface, #121722)',
                    color: 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-strong, #2f3b54)',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--text-sm, 0.875rem)',
                    fontWeight: 600,
                  }}
                >
                  {loading ? 'Scanning Radar...' : 'Load More Oddities'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Responsive media query layout */}
      <style>{`
        @media (max-width: 900px) {
          .explore-viewport.view-split {
            grid-template-columns: 1fr !important;
          }
          .explore-map-container {
            position: relative !important;
            top: 0 !important;
            height: 380px !important;
          }
        }
      `}</style>
    </div>
  );
}
