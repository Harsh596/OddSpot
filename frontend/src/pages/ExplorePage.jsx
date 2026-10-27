import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { OddspotMap } from '../components/map/OddspotMap';
import { LoadingSkeleton, EmptyState, ErrorBanner } from '../components/ui/StatusViews';

const RADIUS_OPTIONS = [
  { label: '1 km (Walking)', value: 1000 },
  { label: '2 km (Neighborhood)', value: 2000 },
  { label: '5 km (District)', value: 5000 },
  { label: '10 km (Metropolitan)', value: 10000 },
  { label: '25 km (Regional)', value: 25000 },
  { label: '50 km (Wide Angle)', value: 50000 },
];

const INTENT_OPTIONS = [
  { id: 'all', label: 'All Missions', icon: '✨' },
  { id: 'photo', label: 'Photograph & Benchmark', icon: '📸' },
  { id: 'visit', label: 'Visit on Foot & Check-in', icon: '🚶' },
  { id: 'unsolved', label: 'Investigate Mysteries', icon: '🕵️' },
  { id: 'acoustic', label: 'Hear Acoustic Anomalies', icon: '🎧' },
  { id: 'botanical', label: 'Botanical Curiosities', icon: '🌿' },
  { id: 'architecture', label: 'Architectural Relics', icon: '🏛️' },
  { id: 'subterranean', label: 'Subterranean Vaults', icon: '🕳️' },
  { id: 'high_score', label: 'Track Breakout Oddities', icon: '⚡' },
  { id: 'certified', label: 'Certified National Legends', icon: '🏆' },
];

const PRESET_CITIES = [
  { name: 'Bengaluru', lat: 12.9716, lng: 77.5946, country: 'India', flag: '🇮🇳' },
  { name: 'London', lat: 51.5074, lng: -0.1278, country: 'UK', flag: '🇬🇧' },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503, country: 'Japan', flag: '🇯🇵' },
  { name: 'New York', lat: 40.7128, lng: -74.006, country: 'USA', flag: '🇺🇸' },
  { name: 'Reykjavík', lat: 64.1466, lng: -21.9426, country: 'Iceland', flag: '🇮🇸' },
  { name: 'Berlin', lat: 52.52, lng: 13.405, country: 'Germany', flag: '🇩🇪' },
  { name: 'Paris', lat: 48.8566, lng: 2.3522, country: 'France', flag: '🇫🇷' },
  { name: 'San Francisco', lat: 37.7749, lng: -122.4194, country: 'USA', flag: '🇺🇸' },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093, country: 'Australia', flag: '🇦🇺' },
];

/**
 * ExplorePage - Combined geospatial radar & regional feed explorer
 */
export function ExplorePage({ navigate }) {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();

  // Location state
  const [coords, setCoords] = useState({ lat: 12.9716, lng: 77.5946 }); // default Bengaluru
  const [geoNotice, setGeoNotice] = useState('');
  const [radius, setRadius] = useState(10000);

  // Search & Filter system (+ Filters)
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [filterIntent, setFilterIntent] = useState('all');
  const [filterTier, setFilterTier] = useState('all');
  const [minScore, setMinScore] = useState(0);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortOption, setSortOption] = useState('hot');

  // Count active filters (excluding default state)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterIntent !== 'all') count++;
    if (filterTier !== 'all') count++;
    if (minScore > 0) count++;
    if (filterStatus !== 'all') count++;
    if (radius !== 10000) count++;
    if (sortOption !== 'hot') count++;
    return count;
  }, [filterIntent, filterTier, minScore, filterStatus, radius, sortOption]);

  const resetAllFilters = () => {
    setFilterIntent('all');
    setFilterTier('all');
    setMinScore(0);
    setFilterStatus('all');
    setRadius(10000);
    setSortOption('hot');
    setSearchQuery('');
  };

  // Detect city match in search query to offer instant radar teleport
  const matchedCity = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || q.length < 3) return null;
    return PRESET_CITIES.find(
      (c) => c.name.toLowerCase() === q || q.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(q)
    );
  }, [searchQuery]);

  // Data & Pagination
  const [posts, setPosts] = useState([]);
  const [_page, setPage] = useState(1);
  const [_hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Selection & Local voting
  const [selectedPostId, setSelectedPostId] = useState(null);
  const [_votedPosts, setVotedPosts] = useState({});

  // Category scroll container ref
  const _categoryScrollRef = useRef(null);

  // Parse URL Query Params on mount and hash change (e.g. #/explore?city=London or #/explore?q=Tokyo)
  useEffect(() => {
    const parseUrlParams = () => {
      const hash = window.location.hash || '';
      const queryIdx = hash.indexOf('?');
      if (queryIdx !== -1) {
        const queryStr = hash.substring(queryIdx + 1);
        const params = new URLSearchParams(queryStr);
        const cityParam = params.get('city') || params.get('q');
        if (cityParam) {
          setSearchQuery(cityParam);
          const match = PRESET_CITIES.find(
            (c) => c.name.toLowerCase() === cityParam.toLowerCase()
          );
          if (match) {
            setCoords({ lat: match.lat, lng: match.lng });
          }
        }
      }
    };

    parseUrlParams();
    window.addEventListener('hashchange', parseUrlParams);
    return () => window.removeEventListener('hashchange', parseUrlParams);
  }, []);

  // Request browser geolocation on mount
  useEffect(() => {
    const hash = window.location.hash || '';
    if (hash.includes('?city=') || hash.includes('?q=')) {
      return;
    }

    if (!navigator.geolocation) {
      setGeoNotice('GPS not available. Centered on default coordinates. Use search to fly to any city.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setGeoNotice('');
      },
      () => {
        setGeoNotice('Live GPS access unavailable. Use search to locate any city or sector.');
      },
      { timeout: 7000, enableHighAccuracy: false }
    );
  }, []);

  // Fetch feed content based on radar coordinates and radius
  const fetchFeed = useCallback(
    async (currentPage = 1, append = false) => {
      setLoading(true);
      setError('');

      try {
        let fetchedPosts = [];
        let moreAvailable = false;

        const activeLat = coords?.lat ?? 12.9716;
        const activeLng = coords?.lng ?? 77.5946;
        const res = await api.getNearby(activeLat, activeLng, radius, currentPage, 24);
        fetchedPosts = res.posts || [];
        moreAvailable = fetchedPosts.length === 24;

        // If local nearby returns few and user wants broad exploration, also pull from home feed
        if (fetchedPosts.length < 6) {
          try {
            const homeRes = await api.getHomeFeed({ sort: sortOption, limit: 30 });
            if (homeRes?.posts?.length) {
              const existingIds = new Set(fetchedPosts.map((p) => String(p._id)));
              const extra = homeRes.posts.filter((p) => !existingIds.has(String(p._id)));
              fetchedPosts = [...fetchedPosts, ...extra];
            }
          } catch {
            // ignore fallback error
          }
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
    [coords, radius, sortOption]
  );

  useEffect(() => {
    setPage(1);
    fetchFeed(1, false);
  }, [fetchFeed]);

  const _handleVote = async (postId, value, e) => {
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

  // Filter posts by search query, mission intent, tier, min score, and verification status
  const filteredPosts = useMemo(() => {
    return posts.filter((post) => {
      // 1. Search Query (matches title, body, city, state, country, or tags)
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const inTitle = post.title?.toLowerCase().includes(query);
        const inBody = post.body?.toLowerCase().includes(query);
        const inCity = post.place?.city?.toLowerCase().includes(query);
        const inCountry = post.place?.country?.toLowerCase().includes(query);
        const inState = post.place?.state?.toLowerCase().includes(query);
        const inTags = Array.isArray(post.tags) && post.tags.some((t) => t.toLowerCase().includes(query));
        if (!inTitle && !inBody && !inCity && !inCountry && !inState && !inTags) {
          return false;
        }
      }

      // 2. What do you want to do? (Intent Filter)
      if (filterIntent !== 'all') {
        const tags = Array.isArray(post.tags) ? post.tags.map((t) => t.toLowerCase()) : [];
        const type = (post.type || '').toLowerCase();
        const text = `${post.title || ''} ${post.body || ''}`.toLowerCase();

        if (filterIntent === 'photo') {
          if (!post.images || post.images.length === 0) return false;
        } else if (filterIntent === 'visit') {
          const visits = post.visitsCount || (Array.isArray(post.visits) ? post.visits.length : 0);
          if (visits <= 0) return false;
        } else if (filterIntent === 'unsolved') {
          if (post.solved === true) return false;
        } else if (filterIntent === 'acoustic') {
          const isAcoustic =
            tags.some((t) => t.includes('acoustic') || t.includes('sound') || t.includes('echo') || t.includes('audio') || t.includes('hum')) ||
            type.includes('acoustic') ||
            text.includes('acoustic') ||
            text.includes('echo') ||
            text.includes('whisper');
          if (!isAcoustic) return false;
        } else if (filterIntent === 'botanical') {
          const isBotanical =
            tags.some((t) => t.includes('botanical') || t.includes('tree') || t.includes('plant') || t.includes('flora') || t.includes('nature') || t.includes('banyan')) ||
            type.includes('botanical') ||
            text.includes('banyan') ||
            text.includes('roots') ||
            text.includes('tree');
          if (!isBotanical) return false;
        } else if (filterIntent === 'architecture') {
          const isArch =
            tags.some((t) => t.includes('arch') || t.includes('relic') || t.includes('ruin') || t.includes('historic') || t.includes('masonry')) ||
            type.includes('arch') ||
            text.includes('architecture') ||
            text.includes('masonry') ||
            text.includes('tower') ||
            text.includes('staircase');
          if (!isArch) return false;
        } else if (filterIntent === 'subterranean') {
          const isSub =
            tags.some((t) => t.includes('subterranean') || t.includes('tunnel') || t.includes('vault') || t.includes('cistern') || t.includes('underground')) ||
            type.includes('subterranean') ||
            text.includes('subterranean') ||
            text.includes('tunnel') ||
            text.includes('underground') ||
            text.includes('cistern');
          if (!isSub) return false;
        } else if (filterIntent === 'high_score') {
          if ((post.meter?.score ?? 0) < 30) return false;
        } else if (filterIntent === 'certified') {
          if (post.tier !== 'country') return false;
        }
      }

      // 3. Anomaly Tier Filter
      if (filterTier !== 'all') {
        const tier = (post.tier || 'city').toLowerCase();
        if (tier !== filterTier) return false;
      }

      // 4. Oddometer Score Threshold
      if (minScore > 0) {
        if ((post.meter?.score ?? 0) < minScore) return false;
      }

      // 5. Verification & Status Filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'unsolved' && post.solved === true) return false;
        if (filterStatus === 'solved' && post.solved !== true) return false;
        if (filterStatus === 'visited') {
          const visits = post.visitsCount || (Array.isArray(post.visits) ? post.visits.length : 0);
          if (visits <= 0) return false;
        }
        if (filterStatus === 'photo' && (!post.images || post.images.length === 0)) return false;
        if (filterStatus === 'fuzzed' && !(post.hideExact === true || post.fuzzed === true || post.location?.fuzzed === true)) return false;
      }

      return true;
    }).sort((a, b) => {
      if (sortOption === 'score') {
        return (b.meter?.score ?? 0) - (a.meter?.score ?? 0);
      }
      if (sortOption === 'new') {
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      }
      return (b.hotScore ?? b.meter?.score ?? 0) - (a.hotScore ?? a.meter?.score ?? 0);
    });
  }, [posts, searchQuery, filterIntent, filterTier, minScore, filterStatus, sortOption]);

  // Map center coordinates
  const mapCenter = useMemo(() => {
    return [coords?.lat ?? 12.9716, coords?.lng ?? 77.5946];
  }, [coords]);

  const selectedPost = useMemo(() => {
    if (selectedPostId) {
      const match = filteredPosts.find((p) => String(p._id) === String(selectedPostId));
      if (match) return match;
    }
    return filteredPosts.length > 0 ? filteredPosts[0] : null;
  }, [filteredPosts, selectedPostId]);

  return (
    <div className="explore-page-container" style={{ width: '100%', margin: 0, padding: 0 }}>
      {/* Top Telemetry Kicker Ribbon matching Screenshot 1 */}
      <div
        className="telemetry-ribbon"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.45rem 1.25rem',
          background: 'var(--bg-subtle, #FAF6F0)',
          borderBottom: '1px solid var(--border-subtle, #ECE7DF)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono, monospace)',
          color: 'var(--text-secondary, #524C46)',
          letterSpacing: '0.04em',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span style={{ color: '#DC2626', fontSize: '11px' }}>●</span>
          <strong style={{ color: 'var(--text-primary, #18181B)', letterSpacing: '0.06em' }}>RADAR ARRAY ACTIVE</strong>
          <span style={{ color: 'var(--text-secondary, #524C46)' }}>
            LAT {coords?.lat ? Number(coords.lat).toFixed(4) : '12.9716'}° N · LON {coords?.lng ? Number(coords.lng).toFixed(4) : '77.5946'}° E
          </span>
          <span style={{ opacity: 0.35 }}>|</span>
          <span>📡 SIG: 98.4% LOCK / BEARING: 042° NE</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted, #655E56)', textTransform: 'uppercase', fontSize: '10.5px' }}>PALETTE SUITE:</span>
          <span
            onClick={() => setTheme('sunburst')}
            style={{
              cursor: 'pointer',
              color: theme === 'sunburst' ? 'var(--accent-cta, #C2410C)' : 'var(--text-secondary, #524C46)',
              fontWeight: theme === 'sunburst' ? 800 : 500,
            }}
          >
            ● Sunburst {theme === 'sunburst' ? 'ACTIVE' : ''}
          </span>
          <span style={{ opacity: 0.35 }}>|</span>
          <span
            onClick={() => setTheme('nocturnal-phosphor')}
            style={{
              cursor: 'pointer',
              color: theme === 'nocturnal-phosphor' ? '#10B981' : 'var(--text-secondary, #524C46)',
              fontWeight: theme === 'nocturnal-phosphor' ? 800 : 500,
            }}
          >
            ● Night Radar
          </span>
          <span style={{ opacity: 0.35 }}>|</span>
          <span
            onClick={() => setTheme('field-zine')}
            style={{
              cursor: 'pointer',
              color: theme === 'field-zine' ? '#D95D00' : 'var(--text-secondary, #524C46)',
              fontWeight: theme === 'field-zine' ? 800 : 500,
            }}
          >
            ● Field Zine
          </span>
        </div>
      </div>

      {/* GPS Notice Banner (non-blocking) */}
      {geoNotice && (
        <div
          style={{
            margin: '0.5rem 1rem',
            padding: '0.6rem 1rem',
            background: 'var(--bg-card-inner)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            fontSize: '11.5px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            color: 'var(--text-secondary)',
          }}
        >
          <span>🛰️ {geoNotice}</span>
          <button
            type="button"
            onClick={() => setGeoNotice('')}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}

      {/* Main Split View: Left List + Right Map matching Screenshot 1 */}
      <div
        className="explore-split-view"
        style={{
          display: 'flex',
          height: 'calc(100vh - 105px)',
          width: '100%',
          overflow: 'hidden',
          background: 'var(--bg-primary, #FFFDF9)',
        }}
      >
        {/* Left Column (Radar Dispatches & Controls) */}
        <div
          className="explore-left-pane"
          style={{
            width: '440px',
            minWidth: '360px',
            maxWidth: '460px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--bg-surface, #FFFFFF)',
            borderRight: '1px solid var(--border-subtle, #ECE7DF)',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {/* Top Controls Box: Universal Search + "+ Filters" */}
          <div
            style={{
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
              borderBottom: '1px solid var(--border-subtle, #ECE7DF)',
              background: 'var(--bg-surface)',
            }}
          >
            {/* Top Row: Coordinates & Post Action */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    background: 'var(--bg-card-inner)',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    border: '1px solid var(--border-subtle)',
                  }}
                  title="Current radar focus coordinates"
                >
                  <span style={{ color: '#10B981', fontSize: '9px' }}>●</span>
                  <span>{coords.lat.toFixed(3)}°N, {coords.lng.toFixed(3)}°E</span>
                </span>

                {navigator.geolocation && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                        () => {}
                      );
                    }}
                    style={{
                      background: 'none',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '5px',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                    }}
                    title="Center on my device GPS"
                  >
                    📍 My GPS
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div
                  style={{
                    background: 'var(--badge-gold-bg)',
                    color: 'var(--badge-gold-text)',
                    border: '1px solid var(--badge-gold-border)',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontFamily: 'var(--font-mono, monospace)',
                    fontSize: '10.5px',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                  }}
                >
                  {filteredPosts.length} PINGS
                </div>

                <button
                  type="button"
                  onClick={() => navigate('#/create')}
                  style={{
                    background: '#B83818',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '5px 10px',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    boxShadow: '0 2px 6px rgba(184, 56, 24, 0.35)',
                    whiteSpace: 'nowrap',
                  }}
                  title="Document a new oddity in this sector"
                >
                  <span>📍</span>
                  <span>Post a Find</span>
                </button>
              </div>
            </div>

            {/* Search Input Row + "+ Filters" Button */}
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <input
                  type="text"
                  placeholder="Search oddities, folklore, or city (e.g. Tokyo, London)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    height: '36px',
                    borderRadius: '7px',
                    border: '1px solid var(--input-border)',
                    background: 'var(--input-bg)',
                    padding: '0 30px 0 32px',
                    fontSize: '12px',
                    color: 'var(--input-text)',
                    boxSizing: 'border-box',
                  }}
                />
                <span style={{ position: 'absolute', left: '9px', top: '9px', fontSize: '13px', opacity: 0.6 }} aria-hidden="true">
                  🔍
                </span>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      top: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '12px',
                      padding: '2px',
                    }}
                    aria-label="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* + Filters Toggle Button */}
              <button
                type="button"
                onClick={() => setShowFilterDrawer((prev) => !prev)}
                style={{
                  height: '36px',
                  padding: '0 11px',
                  borderRadius: '7px',
                  border: activeFilterCount > 0 ? '1px solid var(--accent-cta, #B83818)' : '1px solid var(--border-subtle)',
                  background: activeFilterCount > 0 ? 'var(--badge-gold-bg)' : (showFilterDrawer ? 'var(--bg-card-inner)' : 'var(--btn-secondary-bg)'),
                  color: activeFilterCount > 0 ? 'var(--badge-gold-text)' : 'var(--text-primary)',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                <span>{showFilterDrawer ? '▲' : '▼'}</span>
                <span>+ Filters</span>
                {activeFilterCount > 0 && (
                  <span
                    style={{
                      background: 'var(--accent-cta, #B83818)',
                      color: '#FFFFFF',
                      borderRadius: '999px',
                      padding: '1px 5px',
                      fontSize: '9.5px',
                      fontWeight: 800,
                      lineHeight: 1,
                    }}
                  >
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>

            {/* Matched City Auto-Teleport Suggestion (if user typed a known city) */}
            {matchedCity && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: 'var(--badge-gold-bg)',
                  color: 'var(--badge-gold-text)',
                  border: '1px solid var(--badge-gold-border)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  fontWeight: 600,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>{matchedCity.flag}</span>
                  <span>City match: <strong>{matchedCity.name}</strong></span>
                </div>
                <button
                  type="button"
                  onClick={() => setCoords({ lat: matchedCity.lat, lng: matchedCity.lng })}
                  style={{
                    background: 'var(--accent-cta, #B83818)',
                    color: '#FFFFFF',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Teleport Radar Here →
                </button>
              </div>
            )}

            {/* Active Filter Chips Ribbon */}
            {(activeFilterCount > 0 || searchQuery) && (
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '2px' }}>
                {filterIntent !== 'all' && (
                  <span className="active-filter-pill">
                    {INTENT_OPTIONS.find((i) => i.id === filterIntent)?.label}
                    <button type="button" onClick={() => setFilterIntent('all')}>✕</button>
                  </span>
                )}
                {filterTier !== 'all' && (
                  <span className="active-filter-pill">
                    Tier: {filterTier.toUpperCase()}
                    <button type="button" onClick={() => setFilterTier('all')}>✕</button>
                  </span>
                )}
                {minScore > 0 && (
                  <span className="active-filter-pill">
                    ≥ {minScore} pts
                    <button type="button" onClick={() => setMinScore(0)}>✕</button>
                  </span>
                )}
                {filterStatus !== 'all' && (
                  <span className="active-filter-pill">
                    Status: {filterStatus}
                    <button type="button" onClick={() => setFilterStatus('all')}>✕</button>
                  </span>
                )}
                {radius !== 10000 && (
                  <span className="active-filter-pill">
                    Scope: {radius / 1000} km
                    <button type="button" onClick={() => setRadius(10000)}>✕</button>
                  </span>
                )}
                {sortOption !== 'hot' && (
                  <span className="active-filter-pill">
                    Sort: {sortOption}
                    <button type="button" onClick={() => setSortOption('hot')}>✕</button>
                  </span>
                )}
                <button
                  type="button"
                  onClick={resetAllFilters}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    padding: '2px 4px',
                    fontWeight: 600,
                  }}
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Expandable "+ Filters" Panel */}
            {showFilterDrawer && (
              <div
                className="filter-drawer-panel"
                style={{
                  padding: '0.85rem',
                  background: 'var(--bg-card-inner)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '10px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  maxHeight: '360px',
                  overflowY: 'auto',
                }}
              >
                {/* Section 1: What do you want to do? */}
                <div>
                  <div
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-secondary)',
                      marginBottom: '6px',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>🎯 What do you want to do?</span>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Mission Intent</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '5px' }}>
                    {INTENT_OPTIONS.map((opt) => {
                      const isSelected = filterIntent === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setFilterIntent(opt.id)}
                          style={{
                            textAlign: 'left',
                            padding: '6px 8px',
                            borderRadius: '6px',
                            border: isSelected ? '1px solid var(--accent-cta, #B83818)' : '1px solid var(--border-subtle)',
                            background: isSelected ? 'var(--badge-gold-bg)' : 'var(--bg-surface)',
                            color: isSelected ? 'var(--badge-gold-text)' : 'var(--text-primary)',
                            fontSize: '10.5px',
                            fontWeight: isSelected ? 700 : 500,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.12s ease',
                          }}
                        >
                          <span>{opt.icon}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {opt.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Section 2: Anomaly Tier & Oddometer Score */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        marginBottom: '3px',
                      }}
                    >
                      Anomaly Tier
                    </label>
                    <select
                      value={filterTier}
                      onChange={(e) => setFilterTier(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '5px 7px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      <option value="all">All Tiers</option>
                      <option value="local">Local Tier (0-14 pts)</option>
                      <option value="city">City Tier (15-49 pts)</option>
                      <option value="country">Country Legend (50+ pts)</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        marginBottom: '3px',
                      }}
                    >
                      Min Oddometer Score
                    </label>
                    <select
                      value={minScore}
                      onChange={(e) => setMinScore(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '5px 7px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      <option value={0}>Any Score (0+)</option>
                      <option value={15}>15+ Neighborhood</option>
                      <option value={30}>30+ City Sensation</option>
                      <option value={50}>50+ Country Wide</option>
                    </select>
                  </div>
                </div>

                {/* Section 3: Verification & Status */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--text-secondary)',
                      marginBottom: '3px',
                    }}
                  >
                    Verification &amp; Status
                  </label>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: 'All Statuses' },
                      { id: 'unsolved', label: '❓ Unsolved' },
                      { id: 'solved', label: '✅ Solved' },
                      { id: 'visited', label: '📍 Has Visits' },
                      { id: 'photo', label: '📸 Has Photos' },
                      { id: 'fuzzed', label: '🛡️ 400m Perimeter' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setFilterStatus(st.id)}
                        style={{
                          padding: '3px 7px',
                          borderRadius: '5px',
                          border: filterStatus === st.id ? '1px solid var(--accent-cta, #B83818)' : '1px solid var(--border-subtle)',
                          background: filterStatus === st.id ? 'var(--badge-gold-bg)' : 'var(--bg-surface)',
                          color: filterStatus === st.id ? 'var(--badge-gold-text)' : 'var(--text-secondary)',
                          fontSize: '10.5px',
                          fontWeight: filterStatus === st.id ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Section 4: Acoustic / Geo Radar Radius & Sort */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        marginBottom: '3px',
                      }}
                    >
                      Radar Scope Radius
                    </label>
                    <select
                      value={radius}
                      onChange={(e) => setRadius(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '5px 7px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      {RADIUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '10px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        marginBottom: '3px',
                      }}
                    >
                      Sort Sequence
                    </label>
                    <select
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '5px 7px',
                        borderRadius: '6px',
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      <option value="hot">🔥 Hot &amp; Trending</option>
                      <option value="new">⚡ Latest Sightings</option>
                      <option value="score">🏆 Highest Oddometer</option>
                    </select>
                  </div>
                </div>

                {/* Drawer Footer Actions */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    paddingTop: '6px',
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      padding: '3px 6px',
                      fontWeight: 600,
                    }}
                  >
                    Reset Filters
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowFilterDrawer(false)}
                    style={{
                      background: 'var(--accent-cta, #B83818)',
                      color: '#FFFFFF',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '5px 12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Done ({filteredPosts.length} Anomalies)
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Scrollable Anomaly Cards List */}
          <div style={{ flexGrow: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {loading && posts.length === 0 ? (
              <div style={{ padding: '1.5rem' }}>
                <LoadingSkeleton count={3} type="feed" />
              </div>
            ) : filteredPosts.length === 0 ? (
              <div style={{ padding: '2rem 1rem' }}>
                <EmptyState
                  title="No Oddities in this Sector"
                  message="No confirmed oddities match your radar radius or category filter. Try expanding your radius or sector."
                  icon="🧭"
                  actionText="Expand to 25 km"
                  onAction={() => setRadius(25000)}
                />
              </div>
            ) : (
              filteredPosts.map((post) => {
                const isSelected = selectedPost && String(post._id) === String(selectedPost._id);
                return (
                  <div
                    key={post._id}
                    onClick={() => setSelectedPostId(post._id)}
                    style={{
                      padding: '1rem',
                      background: isSelected ? 'var(--bg-card-inner)' : 'var(--bg-surface)',
                      borderBottom: '1px solid var(--border-subtle)',
                      borderLeft: isSelected ? '4px solid var(--primary)' : '4px solid transparent',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                      transition: 'background 120ms ease',
                    }}
                  >
                    {/* Header tags: REF + unlocked/fuzzed + Odd score */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, background: 'var(--bg-card-inner)', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border-subtle)' }}>
                          REF #{String(post._id).slice(-3).toUpperCase()}-{(post.tags?.[0] || 'ANO').slice(0, 3).toUpperCase()}
                        </span>
                        {post.hideExact ? (
                          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, background: 'var(--badge-gold-bg)', color: 'var(--badge-gold-text)', border: '1px dashed var(--badge-gold-border)', padding: '1px 5px', borderRadius: '3px' }}>
                            :: 400m FUZZED AREA
                          </span>
                        ) : (
                          <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 700, background: 'var(--badge-green-bg)', color: 'var(--badge-green-text)', border: '1px solid var(--badge-green-border)', padding: '2px 6px', borderRadius: '3px' }}>
                            ✓ PIN UNLOCKED
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ background: 'var(--badge-gold-bg)', color: 'var(--badge-gold-text)', border: '1px solid var(--badge-gold-border)', padding: '2px 6px', borderRadius: '3px', fontWeight: 900, fontFamily: 'var(--font-mono, monospace)', fontSize: '11px' }}>
                          ODD: {post.meter?.score ?? 85}
                        </div>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                          99th Percentile
                        </span>
                      </div>
                    </div>

                    {/* Headline: Editorial Serif */}
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: 'var(--font-serif, Georgia, serif)',
                        fontSize: '1.2rem',
                        fontWeight: 800,
                        color: 'var(--text-primary, #18181B)',
                        lineHeight: 1.25,
                        letterSpacing: '-0.015em',
                      }}
                    >
                      {post.title}
                    </h3>

                    {/* Excerpt */}
                    <p
                      style={{
                        margin: 0,
                        fontSize: '0.8125rem',
                        color: 'var(--text-secondary, #524C46)',
                        lineHeight: 1.45,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {post.body ? post.body.replace(/[#*`_]/g, '').slice(0, 140) + '...' : 'Aerial roots grow through an abandoned masonry transformer booth, creating acoustic resonances.'}
                    </p>

                    {/* Photograph with overlay badge */}
                    {post.images && post.images.length > 0 && (
                      <div style={{ position: 'relative', width: '100%', height: '140px', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-card-inner)' }}>
                        <img
                          src={post.images[0].url}
                          alt={post.title}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div
                          style={{
                            position: 'absolute',
                            bottom: '6px',
                            left: '6px',
                            background: 'rgba(24, 24, 27, 0.78)',
                            backdropFilter: 'blur(4px)',
                            color: '#FFFFFF',
                            fontSize: '9.5px',
                            fontFamily: 'var(--font-mono, monospace)',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>📷 Verified Field Photograph · Scout @{post.authorId?.username || 'karan_v'}</span>
                        </div>
                      </div>
                    )}

                    {/* Bottom Status Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                      <div style={{ fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-secondary, #524C46)' }}>
                        <span style={{ color: post.hideExact ? '#D97706' : '#15803D' }}>●</span>{' '}
                        {post.distanceMeters ? `${post.distanceMeters < 1000 ? `${post.distanceMeters}m` : `${(post.distanceMeters/1000).toFixed(1)}km`} away` : '320m away'}{' '}
                        · {post.hideExact ? 'Approach <500m to unlock pin' : 'Exact Pin Revealed'}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`#/post/${post._id}`);
                        }}
                        style={{
                          padding: '4px 10px',
                          fontSize: '11px',
                          fontWeight: 700,
                          borderRadius: '4px',
                          background: 'var(--btn-secondary-bg)',
                          border: '1px solid var(--btn-secondary-border)',
                          color: 'var(--primary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                        }}
                      >
                        <span>{post.hideExact ? '🎯 Radar Lock' : '🚶 Route'}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Left Column Bottom Status Bar */}
          <div
            style={{
              marginTop: 'auto',
              padding: '0.5rem 1rem',
              background: 'var(--bg-card-inner)',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '10.5px',
              fontFamily: 'var(--font-mono, monospace)',
              color: 'var(--text-muted)',
              letterSpacing: '0.04em',
            }}
          >
            <span>RADAR ENGINE V2.4-CARTOGRAPHIC</span>
            <span style={{ color: 'var(--badge-green-text)', fontWeight: 700 }}>● LIVE TELEMETRY SYNCED</span>
          </div>
        </div>

        {/* Right Column (Map with Floating Bottom Card) */}
        <div
          className="explore-right-pane"
          style={{
            flexGrow: 1,
            height: '100%',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <OddspotMap
            posts={filteredPosts}
            center={mapCenter}
            zoom={13}
            selectedPostId={selectedPost?._id}
            onSelectPost={(post) => setSelectedPostId(post._id)}
            style={{ width: '100%', height: '100%', borderRadius: 0, border: 'none' }}
          />

          {/* Floating Post a Find Button on Map */}
          <button
            type="button"
            onClick={() => navigate('#/create')}
            className="floating-map-post-btn"
            style={{
              position: 'absolute',
              top: '14px',
              right: '14px',
              zIndex: 1000,
              padding: '8px 14px',
              borderRadius: '8px',
              background: '#B83818',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 4px 14px rgba(184, 56, 24, 0.45)',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            title="Document a new spot at this location"
          >
            <span style={{ fontSize: '13px' }}>📍</span>
            <span>Post a Find</span>
          </button>

          {/* Floating Anomaly Detail Card over map matching Screenshot 1 */}
          {selectedPost && (
            <div
              className="floating-map-anomaly-card"
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: 'calc(100% - 48px)',
                maxWidth: '560px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.25)',
                padding: '0.85rem',
                display: 'flex',
                gap: '12px',
                alignItems: 'center',
                zIndex: 1000,
              }}
            >
              {selectedPost.images && selectedPost.images.length > 0 && (
                <div style={{ position: 'relative', width: '84px', height: '84px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                  <img src={selectedPost.images[0].url} alt={selectedPost.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <span style={{ position: 'absolute', top: '2px', left: '2px', background: 'var(--primary)', color: 'var(--text-on-accent, #FFFFFF)', fontSize: '9px', fontWeight: 800, padding: '1px 4px', borderRadius: '2px', fontFamily: 'var(--font-mono, monospace)' }}>
                    #{String(selectedPost._id).slice(-3)}
                  </span>
                </div>
              )}

              <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--primary)', fontWeight: 800, letterSpacing: '0.06em' }}>
                    {(selectedPost.tags?.[0] || 'BOTANICAL ODDITY').toUpperCase()} · {selectedPost.distanceMeters ? `${selectedPost.distanceMeters}m Away` : '320m Away'}
                  </span>
                  <button type="button" onClick={() => setSelectedPostId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: 'var(--text-muted)' }}>
                    ×
                  </button>
                </div>

                <h4 style={{ margin: '2px 0 4px', fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {selectedPost.title}
                </h4>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  <span>📍 12.9982° N, 77.5711° E</span>
                  <span style={{ background: 'var(--badge-gold-bg)', color: 'var(--badge-gold-text)', border: '1px solid var(--badge-gold-border)', padding: '1px 5px', borderRadius: '3px', fontWeight: 700 }}>
                    Oddometer {selectedPost.meter?.score ?? 94}/100
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={() => navigate(`#/post/${selectedPost._id}`)}
                    style={{
                      flexGrow: 1,
                      height: '32px',
                      background: 'var(--accent-cta, #B83818)',
                      color: 'var(--text-on-accent, #FFFFFF)',
                      border: 'none',
                      borderRadius: '5px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px',
                    }}
                  >
                    <span>🎯</span>
                    <span>Log Verified Visit (≤50m)</span>
                  </button>
                  <button type="button" title="Bookmark" style={{ width: '32px', height: '32px', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--btn-secondary-text)', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
                    🔖
                  </button>
                  <button type="button" title="Share" style={{ width: '32px', height: '32px', background: 'var(--btn-secondary-bg)', border: '1px solid var(--btn-secondary-border)', color: 'var(--btn-secondary-text)', borderRadius: '5px', cursor: 'pointer', fontSize: '12px' }}>
                    🔗
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
