import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingSkeleton, EmptyState, ErrorBanner } from '../components/ui/StatusViews';
import { OddometerPill } from '../components/meter/OddometerPill';

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

/**
 * HomePage - Editorial Tailwind-inspired layout with:
 * - Architectural Hero Section with exposed grid and crosshairs
 * - Trending Anomaly Bento Strip (Asymmetric 12-column grid: #1 feature card + #2-#4 index cards)
 * - Dispatch Control Bar (Universal Search + + Filters Engine with Mission Intent)
 * - Feed Cards with 16/10 aspect ratio images, tier badges, localStorage bookmarking, and 40px vote buttons
 */
export function HomePage({ navigate }) {
  const { user } = useAuth();

  // Search & Filter system (+ Filters)
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [filterIntent, setFilterIntent] = useState('all');
  const [filterTier, setFilterTier] = useState('all');
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortOption, setSortOption] = useState('hot');

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterIntent !== 'all') count++;
    if (filterTier !== 'all') count++;
    if (minScoreFilter > 0) count++;
    if (filterStatus !== 'all') count++;
    return count;
  }, [filterIntent, filterTier, minScoreFilter, filterStatus]);

  const resetAllFilters = () => {
    setFilterIntent('all');
    setFilterTier('all');
    setMinScoreFilter(0);
    setFilterStatus('all');
    setSearchQuery('');
  };

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [votedPosts, setVotedPosts] = useState({});

  // Local storage saved spots bookmarking
  const [savedSpots, setSavedSpots] = useState(() => {
    try {
      const raw = localStorage.getItem('oddspot_saved_spots');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const handleToggleSave = (postId, e) => {
    e.stopPropagation();
    setSavedSpots((prev) => {
      const isSaved = prev.includes(postId);
      const next = isSaved ? prev.filter((id) => id !== postId) : [...prev, postId];
      try {
        localStorage.setItem('oddspot_saved_spots', JSON.stringify(next));
      } catch {
        // storage disabled or quota exceeded
      }
      return next;
    });
  };

  const fetchHomeFeed = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.getHomeFeed({ sort: sortOption, limit: 24 });
      setPosts(res.posts || []);
    } catch (err) {
      setError(err.message || 'Failed to retrieve home feed.');
    } finally {
      setLoading(false);
    }
  }, [sortOption]);

  useEffect(() => {
    fetchHomeFeed();
  }, [fetchHomeFeed]);

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

  // Top 4 highest scoring spots for Trending Anomaly Bento Strip
  const trendingDigest = useMemo(() => {
    return [...posts]
      .sort((a, b) => (b.meter?.score ?? 0) - (a.meter?.score ?? 0))
      .slice(0, 4);
  }, [posts]);

  // Filtered posts based on Search, Mission Intent, Tier, and Status
  const displayedPosts = useMemo(() => {
    return posts.filter((post) => {
      // 1. Search query (matches title, body, city, country, state, tags)
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

      // 2. Mission Intent ("What do you want to do?")
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

      // 3. Anomaly Tier
      if (filterTier !== 'all') {
        const tier = (post.tier || 'city').toLowerCase();
        if (tier !== filterTier) return false;
      }

      // 4. Min Oddometer Score
      if (minScoreFilter > 0) {
        if ((post.meter?.score ?? 0) < minScoreFilter) return false;
      }

      // 5. Verification Status
      if (filterStatus !== 'all') {
        if (filterStatus === 'unsolved' && post.solved === true) return false;
        if (filterStatus === 'solved' && post.solved !== true) return false;
        if (filterStatus === 'visited') {
          const visits = post.visitsCount || (Array.isArray(post.visits) ? post.visits.length : 0);
          if (visits <= 0) return false;
        }
        if (filterStatus === 'photo' && (!post.images || post.images.length === 0)) return false;
      }

      return true;
    });
  }, [posts, searchQuery, filterIntent, filterTier, minScoreFilter, filterStatus]);

  return (
    <div className="home-page-container">
      {/* 1. Architectural Hero Section with exposed grid & crosshairs */}
      <section
        className="tw-grid-section tw-card"
        style={{
          margin: '1.5rem 0 2rem',
          padding: '2.5rem 2rem',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle, #ECE7DF)',
          background: 'var(--bg-surface, #FFFFFF)',
          boxShadow: 'var(--shadow-card, 0 1px 3px rgba(24, 24, 27, 0.05))',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '820px' }}>
          {/* Monospace kicker pill */}
          <div>
            <span
              className="tw-kicker"
              style={{
                fontSize: '11px',
                padding: '3px 10px',
                borderRadius: '6px',
                background: 'var(--bg-elevated, #FFF7ED)',
                color: 'var(--accent-primary, #FF6F00)',
                border: '1px solid var(--border-subtle, #ECE7DF)',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 600,
                letterSpacing: '0.06em',
              }}
            >
              [ FIELD DISPATCH INDEX · LIVE GEOSPATIAL LOG ]
            </span>
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: 'clamp(1.85rem, 3.5vw, 3rem)',
              fontFamily: 'var(--font-heading, "Plus Jakarta Sans", sans-serif)',
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 1.15,
              color: 'var(--text-primary, #18181B)',
            }}
          >
            Real-world oddities, mapped by local scouts.
          </h1>

          <p
            style={{
              margin: 0,
              color: 'var(--text-secondary, #524C46)',
              fontSize: '1rem',
              lineHeight: 1.6,
              maxWidth: '680px',
            }}
          >
            Oddities advance from City to Country status through community Oddometer scoring,
            discussion clues, and verified physical reconnaissance within 50 meters.
          </p>
        </div>

        {/* Action Row & City Quick Teleports */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '1rem',
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-subtle, #ECE7DF)',
          }}
        >
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('#/create')}
              style={{
                padding: '0.625rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: 'var(--accent-cta, #B83818)',
                color: 'var(--text-on-accent, #FFFFFF)',
                border: 'none',
                boxShadow: '0 2px 8px rgba(184, 56, 24, 0.35)',
              }}
            >
              <span>📍</span>
              <span>Post a Find</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('#/explore')}
              style={{
                padding: '0.625rem 1.25rem',
                fontSize: '0.875rem',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              <span>🧭</span>
              <span>Open Live Radar</span>
            </button>
          </div>

        </div>
      </section>

      {/* 2. Trending Oddities Bento Strip (Top 4 Dispatches) */}
      {trendingDigest.length > 0 && (
        <section aria-label="Trending Oddities Bento Digest" style={{ marginBottom: '2.5rem' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.1rem' }}>🔥</span>
              <h2
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontFamily: 'var(--font-heading, "Plus Jakarta Sans", sans-serif)',
                  fontWeight: 800,
                  color: 'var(--text-primary, #18181B)',
                  letterSpacing: '-0.02em',
                }}
              >
                Top Trending Dispatches
              </h2>
            </div>
            <span
              className="tw-kicker"
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '4px',
                background: 'var(--bg-elevated, #FFF7ED)',
                border: '1px solid var(--border-subtle, #ECE7DF)',
              }}
            >
              HIGHEST SCORING FIELD REPORTS
            </span>
          </div>

          {/* Asymmetric 12-Column Bento Grid */}
          <div className="bento-grid-strip">
            {/* Featured Dossier Card (Rank #1, 6 Columns Desktop / Stacked Mobile) */}
            {trendingDigest[0] && (
              <div
                onClick={() => navigate(`#/post/${trendingDigest[0]._id}`)}
                className="tw-card bento-col-featured"
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden',
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-subtle, #ECE7DF)',
                  borderRadius: '14px',
                  boxShadow: 'var(--shadow-card, 0 1px 3px rgba(24, 24, 27, 0.05))',
                  position: 'relative',
                  transition: 'all 160ms ease',
                }}
              >
                {/* 16/10 Image */}
                <div
                  style={{
                    width: '100%',
                    aspectRatio: '16/10',
                    position: 'relative',
                    overflow: 'hidden',
                    background: 'var(--bg-elevated, #FFF7ED)',
                  }}
                >
                  {trendingDigest[0].images?.[0]?.url ? (
                    <img
                      src={trendingDigest[0].images[0].url}
                      alt={trendingDigest[0].title}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '2rem' }}>
                      👁️
                    </div>
                  )}

                  {/* Top-Left Rank & Tier Badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      display: 'flex',
                      gap: '6px',
                      zIndex: 2,
                    }}
                  >
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: 'var(--accent-cta, #C2410C)',
                        color: 'var(--text-on-accent, #FFFFFF)',
                        fontSize: '11px',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono, monospace)',
                      }}
                    >
                      #1 SPOTLIGHT
                    </span>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: trendingDigest[0].tier === 'country' ? 'var(--accent-cta, #C2410C)' : 'var(--badge-gold-bg, #FEF3C7)',
                        color: trendingDigest[0].tier === 'country' ? 'var(--text-on-accent, #FFFFFF)' : 'var(--badge-gold-text, #92400E)',
                        border: trendingDigest[0].tier === 'country' ? 'none' : '1px solid var(--badge-gold-border, #FDE68A)',
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                      }}
                    >
                      {(trendingDigest[0].tier || 'city').toUpperCase()} TIER
                    </span>
                  </div>

                  {/* Top-Right Bookmark Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleSave(trendingDigest[0]._id, e)}
                    aria-label={savedSpots.includes(trendingDigest[0]._id) ? 'Remove saved spot' : 'Save spot'}
                    style={{
                      position: 'absolute',
                      top: '10px',
                      right: '10px',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.92)',
                      border: '1px solid var(--border-subtle, #ECE7DF)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '14px',
                      boxShadow: 'var(--shadow-sm)',
                      zIndex: 2,
                    }}
                  >
                    {savedSpots.includes(trendingDigest[0]._id) ? '🔖' : '🏷️'}
                  </button>
                </div>

                {/* Card Body */}
                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '8px', flexGrow: 1, justifyContent: 'space-between' }}>
                  <div>
                    <div
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--accent-primary, #FF6F00)',
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        marginBottom: '4px',
                      }}
                    >
                      {trendingDigest[0].place?.city || 'SECTOR'}, {trendingDigest[0].place?.country || 'GLOBAL'}
                    </div>

                    <h3
                      style={{
                        margin: 0,
                        fontSize: '1.25rem',
                        fontWeight: 800,
                        lineHeight: 1.3,
                        color: 'var(--text-primary, #18181B)',
                      }}
                    >
                      {trendingDigest[0].title}
                    </h3>

                    {trendingDigest[0].body && (
                      <p
                        style={{
                          margin: '6px 0 0',
                          fontSize: '0.875rem',
                          color: 'var(--text-secondary, #524C46)',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {trendingDigest[0].body}
                      </p>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-subtle, #ECE7DF)',
                    }}
                  >
                    <OddometerPill
                      score={trendingDigest[0].meter?.score}
                      countryThreshold={trendingDigest[0].meter?.countryThreshold}
                      label={trendingDigest[0].meter?.label}
                      tier={trendingDigest[0].tier}
                      size="sm"
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted, #655E56)', fontFamily: 'var(--font-mono, monospace)' }}>
                      👍 {trendingDigest[0].meter?.likes ?? 0} · 💬 {trendingDigest[0].meter?.comments ?? 0}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Ranks #2, #3, #4 (Stacked in Right 6 Columns Desktop / Stacked Mobile) */}
            <div
              className="bento-col-sub"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              {trendingDigest.slice(1, 4).map((spot, index) => {
                const rankNum = index + 2;
                const isSaved = savedSpots.includes(spot._id);

                return (
                  <div
                    key={`bento-rank-${spot._id}`}
                    onClick={() => navigate(`#/post/${spot._id}`)}
                    className="tw-card"
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '10px 14px',
                      background: 'var(--bg-surface, #FFFFFF)',
                      border: '1px solid var(--border-subtle, #ECE7DF)',
                      borderRadius: '12px',
                      boxShadow: 'var(--shadow-card, 0 1px 3px rgba(24, 24, 27, 0.05))',
                      flexGrow: 1,
                      transition: 'all 120ms ease',
                    }}
                  >
                    {/* Rank Number Monospace Pill */}
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        background: 'var(--bg-elevated, #FFF7ED)',
                        border: '1px solid var(--border-subtle, #ECE7DF)',
                        color: 'var(--accent-primary, #FF6F00)',
                        fontFamily: 'var(--font-mono, monospace)',
                        fontWeight: 800,
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      #{rankNum}
                    </div>

                    {/* Thumbnail */}
                    <div
                      style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        flexShrink: 0,
                        background: 'var(--bg-elevated, #FFF7ED)',
                      }}
                    >
                      {spot.images?.[0]?.url ? (
                        <img
                          src={spot.images[0].url}
                          alt={spot.title}
                          loading="lazy"
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '1.25rem' }}>
                          👁️
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span
                          style={{
                            fontFamily: 'var(--font-mono, monospace)',
                            fontSize: '10px',
                            color: 'var(--text-muted, #655E56)',
                            textTransform: 'uppercase',
                          }}
                        >
                          {spot.place?.city || 'SECTOR'}
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--border-strong, #D6CEC2)' }}>•</span>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            color: spot.tier === 'country' ? '#FF6F00' : 'var(--text-secondary, #524C46)',
                          }}
                        >
                          {(spot.tier || 'city').toUpperCase()} TIER
                        </span>
                      </div>

                      <h4
                        style={{
                          margin: 0,
                          fontSize: '0.9375rem',
                          fontWeight: 700,
                          color: 'var(--text-primary, #18181B)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {spot.title}
                      </h4>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-primary, #FF6F00)', fontFamily: 'var(--font-mono, monospace)' }}>
                          ★ {spot.meter?.score ?? 0} pts
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted, #655E56)' }}>
                          💬 {spot.meter?.comments ?? 0}
                        </span>
                      </div>
                    </div>

                    {/* Bookmark Toggle */}
                    <button
                      type="button"
                      onClick={(e) => handleToggleSave(spot._id, e)}
                      aria-label={isSaved ? 'Remove saved spot' : 'Save spot'}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '14px',
                        padding: '4px',
                        flexShrink: 0,
                        color: 'var(--text-muted)',
                      }}
                    >
                      {isSaved ? '🔖' : '🏷️'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 3. Dispatch Control Bar: Search + "+ Filters" Engine */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid var(--border-subtle, #ECE7DF)',
          marginBottom: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          {/* Search bar + "+ Filters" toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: '1 1 360px', maxWidth: '640px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                placeholder="Search anomalies, folklore, or city (e.g. Tokyo, London)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  height: '38px',
                  borderRadius: '8px',
                  border: '1px solid var(--input-border)',
                  background: 'var(--input-bg)',
                  padding: '0 32px 0 34px',
                  fontSize: '13px',
                  color: 'var(--input-text)',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ position: 'absolute', left: '10px', top: '10px', fontSize: '14px', opacity: 0.6 }} aria-hidden="true">
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
                    fontSize: '13px',
                    padding: '2px',
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFilterDrawer((prev) => !prev)}
              style={{
                height: '38px',
                padding: '0 14px',
                borderRadius: '8px',
                border: activeFilterCount > 0 ? '1px solid var(--accent-cta, #B83818)' : '1px solid var(--border-subtle)',
                background: activeFilterCount > 0 ? 'var(--badge-gold-bg)' : (showFilterDrawer ? 'var(--bg-card-inner)' : 'var(--btn-secondary-bg)'),
                color: activeFilterCount > 0 ? 'var(--badge-gold-text)' : 'var(--text-primary)',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
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
                    padding: '1px 6px',
                    fontSize: '10px',
                    fontWeight: 800,
                    lineHeight: 1,
                  }}
                >
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {/* Post count & Sort selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted, #655E56)', fontWeight: 600 }}>
              {displayedPosts.length} oddity spots
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="home-sort" style={{ color: 'var(--text-secondary, #524C46)', fontSize: '0.8125rem', fontWeight: 600 }}>
                Sort:
              </label>
              <select
                id="home-sort"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: 'var(--bg-surface, #FFFFFF)',
                  color: 'var(--text-primary, #18181B)',
                  border: '1px solid var(--border-subtle, #ECE7DF)',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <option value="hot">🔥 Hot &amp; Trending</option>
                <option value="new">⚡ Latest Sightings</option>
                <option value="top">🏆 Highest Rated</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active Filter Chips Ribbon */}
        {(activeFilterCount > 0 || searchQuery) && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', paddingTop: '2px' }}>
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
            {minScoreFilter > 0 && (
              <span className="active-filter-pill">
                ≥ {minScoreFilter} pts
                <button type="button" onClick={() => setMinScoreFilter(0)}>✕</button>
              </span>
            )}
            {filterStatus !== 'all' && (
              <span className="active-filter-pill">
                Status: {filterStatus}
                <button type="button" onClick={() => setFilterStatus('all')}>✕</button>
              </span>
            )}
            {searchQuery && (
              <span className="active-filter-pill">
                Search: "{searchQuery}"
                <button type="button" onClick={() => setSearchQuery('')}>✕</button>
              </span>
            )}
            <button
              type="button"
              onClick={resetAllFilters}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                fontSize: '11.5px',
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
              padding: '1.25rem',
              background: 'var(--bg-card-inner, #FFF7ED)',
              border: '1px solid var(--border-subtle, #ECE7DF)',
              borderRadius: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.1rem',
            }}
          >
            {/* Section 1: What do you want to do? */}
            <div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'var(--text-secondary)',
                  marginBottom: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>🎯 What do you want to do?</span>
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Mission Intent</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '6px' }}>
                {INTENT_OPTIONS.map((opt) => {
                  const isSelected = filterIntent === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFilterIntent(opt.id)}
                      style={{
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        border: isSelected ? '1px solid var(--accent-cta, #B83818)' : '1px solid var(--border-subtle)',
                        background: isSelected ? 'var(--badge-gold-bg)' : 'var(--bg-surface)',
                        color: isSelected ? 'var(--badge-gold-text)' : 'var(--text-primary)',
                        fontSize: '11.5px',
                        fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '7px',
                        transition: 'all 0.12s ease',
                      }}
                    >
                      <span style={{ fontSize: '13px' }}>{opt.icon}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Anomaly Tier, Minimum Score & Verification */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', alignItems: 'flex-start' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}
                >
                  Anomaly Tier
                </label>
                <select
                  value={filterTier}
                  onChange={(e) => setFilterTier(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
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
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}
                >
                  Min Oddometer Score
                </label>
                <select
                  value={minScoreFilter}
                  onChange={(e) => setMinScoreFilter(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  <option value={0}>Any Score (0+)</option>
                  <option value={15}>15+ Neighborhood</option>
                  <option value={30}>30+ City Sensation</option>
                  <option value={50}>50+ Country Wide</option>
                </select>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '10.5px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary)',
                    marginBottom: '4px',
                  }}
                >
                  Verification Status
                </label>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {[
                    { id: 'all', label: 'All' },
                    { id: 'unsolved', label: '❓ Unsolved' },
                    { id: 'solved', label: '✅ Solved' },
                    { id: 'visited', label: '📍 Visits' },
                    { id: 'photo', label: '📸 Photos' },
                  ].map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setFilterStatus(st.id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '5px',
                        border: filterStatus === st.id ? '1px solid var(--accent-cta, #B83818)' : '1px solid var(--border-subtle)',
                        background: filterStatus === st.id ? 'var(--badge-gold-bg)' : 'var(--bg-surface)',
                        color: filterStatus === st.id ? 'var(--badge-gold-text)' : 'var(--text-secondary)',
                        fontSize: '11px',
                        fontWeight: filterStatus === st.id ? 700 : 500,
                        cursor: 'pointer',
                      }}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Drawer Footer Actions */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingTop: '8px',
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
                  fontSize: '11.5px',
                  cursor: 'pointer',
                  padding: '4px 8px',
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
                  padding: '6px 14px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Done ({displayedPosts.length} Anomalies)
              </button>
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} retry={fetchHomeFeed} />}

      {/* 4. Posts Grid: 16/10 aspect ratio images, tier badge, localStorage bookmark, and 40px vote buttons */}
      {loading && posts.length === 0 ? (
        <LoadingSkeleton count={4} type="feed" />
      ) : displayedPosts.length === 0 ? (
        <EmptyState
          title={activeFilterCount > 0 || searchQuery ? 'No Spots Match Your Active Filters' : 'No Community Dispatch Found'}
          message={
            activeFilterCount > 0 || searchQuery
              ? 'Try relaxing your mission intent, tier, or search query to see more field reports.'
              : 'Be the first scout to document an oddity and initiate the home dispatch!'
          }
          icon="📡"
          actionText="Scan Radar"
          onAction={() => navigate('#/explore')}
          secondaryActionText="+ Post a Find"
          onSecondaryAction={() => navigate('#/create')}
        />
      ) : (
        <div className="home-feed-cards-grid">
          {displayedPosts.map((post) => {
            const myVote = votedPosts[post._id];
            const isSaved = savedSpots.includes(post._id);
            const hasImage = post.images && post.images.length > 0;
            const isCountryTier = post.tier === 'country';

            return (
              <div
                key={post._id}
                onClick={() => navigate(`#/post/${post._id}`)}
                className="tw-card"
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-subtle, #ECE7DF)',
                  borderRadius: '14px',
                  boxShadow: 'var(--shadow-card, 0 1px 3px rgba(24, 24, 27, 0.05))',
                  overflow: 'hidden',
                  transition: 'all 150ms ease',
                }}
              >
                {/* 16/10 Image Container */}
                <div
                  style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16/10',
                    background: 'var(--bg-elevated, #FFF7ED)',
                    overflow: 'hidden',
                  }}
                >
                  {hasImage ? (
                    <img
                      src={post.images[0].url}
                      alt={post.title}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '2rem' }}>
                      👁️
                    </div>
                  )}

                  {/* Top-Left Tier Badge */}
                  <div style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 2 }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        background: isCountryTier ? 'var(--accent-cta, #C2410C)' : 'var(--badge-gold-bg, #FEF3C7)',
                        color: isCountryTier ? 'var(--text-on-accent, #FFFFFF)' : 'var(--badge-gold-text, #92400E)',
                        border: isCountryTier ? 'none' : '1px solid var(--badge-gold-border, #FDE68A)',
                        fontSize: '10px',
                        fontWeight: 800,
                        fontFamily: 'var(--font-mono, monospace)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {(post.tier || 'city').toUpperCase()} TIER
                    </span>
                  </div>

                  {/* Top-Right Bookmark Button */}
                  <button
                    type="button"
                    onClick={(e) => handleToggleSave(post._id, e)}
                    aria-label={isSaved ? 'Remove saved spot' : 'Save spot'}
                    title={isSaved ? 'Saved spot' : 'Save spot'}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-subtle, #ECE7DF)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '14px',
                      boxShadow: 'var(--shadow-sm)',
                      zIndex: 2,
                    }}
                  >
                    {isSaved ? '🔖' : '🏷️'}
                  </button>
                </div>

                {/* Card Content */}
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'space-between' }}>
                  <div>
                    {/* Monospace Location Header */}
                    <div
                      style={{
                        fontFamily: 'var(--font-mono, monospace)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: post.hideExact ? 'var(--color-warning, #B45309)' : 'var(--text-muted, #655E56)',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        marginBottom: '6px',
                      }}
                    >
                      {post.hideExact
                        ? '[ 🔒 APPROXIMATE AREA ]'
                        : `${(post.place?.city || 'SECTOR').toUpperCase()}, ${(post.place?.country || 'INT').toUpperCase()}`}
                    </div>

                    {/* Bold Title */}
                    <h3
                      style={{
                        margin: '0 0 6px',
                        fontSize: '1.05rem',
                        fontWeight: 700,
                        color: 'var(--text-primary, #18181B)',
                        lineHeight: 1.35,
                      }}
                    >
                      {post.title}
                    </h3>

                    {/* 2-line Excerpt */}
                    {post.body && (
                      <p
                        style={{
                          margin: '0 0 8px',
                          fontSize: '0.8125rem',
                          color: 'var(--text-secondary, #524C46)',
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {post.body}
                      </p>
                    )}

                    {/* Tag Chips */}
                    {Array.isArray(post.tags) && post.tags.length > 0 && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                        {post.tags.slice(0, 3).map((tag, idx) => (
                          <span
                            key={idx}
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: 'var(--bg-elevated, #FFF7ED)',
                              border: '1px solid var(--border-subtle, #ECE7DF)',
                              color: 'var(--text-muted, #655E56)',
                              fontFamily: 'var(--font-mono, monospace)',
                            }}
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Footer: OddometerPill + 40px Upvote/Downvote Pill Bar */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-subtle, #ECE7DF)',
                      marginTop: '6px',
                    }}
                  >
                    <OddometerPill
                      score={post.meter?.score}
                      countryThreshold={post.meter?.countryThreshold}
                      label={post.meter?.label}
                      tier={post.tier}
                      size="sm"
                    />

                    {/* Upvote/Downvote Pill Bar with min-height: 40px */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: 'var(--bg-elevated, #FFF7ED)',
                        border: '1px solid var(--border-subtle, #ECE7DF)',
                        borderRadius: '8px',
                        overflow: 'hidden',
                        minHeight: '40px',
                      }}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleVote(post._id, 1, e)}
                        aria-label="Upvote spot"
                        style={{
                          height: '40px',
                          padding: '0 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: myVote === 1 ? 'rgba(5, 150, 105, 0.12)' : 'transparent',
                          color: myVote === 1 ? '#059669' : 'var(--text-primary, #18181B)',
                          border: 'none',
                          borderRight: '1px solid var(--border-subtle, #ECE7DF)',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '0.8125rem',
                          transition: 'all 120ms ease',
                        }}
                      >
                        <span>👍</span>
                        <span>{post.meter?.likes ?? 0}</span>
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleVote(post._id, -1, e)}
                        aria-label="Downvote spot"
                        style={{
                          height: '40px',
                          padding: '0 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          background: myVote === -1 ? 'rgba(220, 38, 38, 0.12)' : 'transparent',
                          color: myVote === -1 ? '#DC2626' : 'var(--text-primary, #18181B)',
                          border: 'none',
                          borderRight: '1px solid var(--border-subtle, #ECE7DF)',
                          cursor: 'pointer',
                          fontWeight: 700,
                          fontSize: '0.8125rem',
                          transition: 'all 120ms ease',
                        }}
                      >
                        <span>👎</span>
                        <span>{post.meter?.dislikes ?? 0}</span>
                      </button>

                      <span
                        style={{
                          height: '40px',
                          padding: '0 10px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.75rem',
                          color: 'var(--text-muted, #655E56)',
                          fontWeight: 600,
                        }}
                      >
                        <span>💬</span>
                        <span>{post.meter?.comments ?? 0}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
