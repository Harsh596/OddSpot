import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingSkeleton, EmptyState, ErrorBanner } from '../components/ui/StatusViews';

/**
 * HomePage - Community field intelligence dispatch with Default & Custom Feed Rules,
 * trending digest strip, and seamless fallback to country highlights.
 */
export function HomePage({ navigate }) {
  const { user } = useAuth();

  // Mode: 'default' | 'custom'
  const [feedRuleMode, setFeedRuleMode] = useState('default');
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const [selectedTag, setSelectedTag] = useState('all');
  const [sortOption, setSortOption] = useState('hot');

  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [votedPosts, setVotedPosts] = useState({});

  const fetchHomeFeed = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const res = await api.getHomeFeed({ sort: sortOption, limit: 20 });
      setPosts(res.posts || []);
    } catch (err) {
      setError(err.message || 'Failed to retrieve home anomaly dispatch.');
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

  // Trending digest strip: top 4 highest scoring spots
  const trendingDigest = useMemo(() => {
    return [...posts]
      .sort((a, b) => (b.meter?.score ?? 0) - (a.meter?.score ?? 0))
      .slice(0, 4);
  }, [posts]);

  // Filtered posts based on Custom Feed Rules
  const displayedPosts = useMemo(() => {
    if (feedRuleMode === 'default') {
      return posts;
    }

    // Apply custom user rules
    return posts.filter((post) => {
      const score = post.meter?.score ?? 0;
      if (score < minScoreFilter) return false;

      if (selectedTag !== 'all') {
        const tags = Array.isArray(post.tags) ? post.tags : [];
        const hasTag = tags.some((t) => t.toLowerCase().includes(selectedTag.toLowerCase()));
        if (!hasTag) return false;
      }

      return true;
    });
  }, [posts, feedRuleMode, minScoreFilter, selectedTag]);

  return (
    <div className="home-page-container" style={{ width: '100%', padding: '0 var(--space-4, 16px)' }}>
      {/* Hero Dispatch Banner */}
      <div
        className="home-hero-banner"
        style={{
          margin: 'var(--space-6, 24px) 0 var(--space-6, 24px)',
          padding: 'var(--space-8, 32px) var(--space-6, 24px)',
          background: 'var(--bg-surface, #121722)',
          border: '1px solid var(--border-subtle, #202738)',
          borderRadius: 'var(--radius-xl, 20px)',
          boxShadow: 'var(--shadow-card, 0 4px 16px rgba(0,0,0,0.4))',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4, 16px)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4, 16px)' }}>
          <div>
            <div
              style={{
                fontSize: 'var(--text-xs, 0.75rem)',
                fontWeight: 800,
                color: 'var(--accent, #00f0ff)',
                textTransform: 'uppercase',
                letterSpacing: '1px',
                marginBottom: '4px',
              }}
            >
              📡 Oddspot Field Dispatch
            </div>
            <h1
              style={{
                margin: '0 0 var(--space-2, 8px)',
                fontSize: 'var(--text-3xl, 1.875rem)',
                fontFamily: 'var(--font-heading, sans-serif)',
                color: 'var(--text-primary, #f0f4fc)',
                letterSpacing: '-0.5px',
              }}
            >
              Real-World Anomalies & Overlooked Wonders
            </h1>
            <p
              style={{
                margin: 0,
                color: 'var(--text-secondary, #94a3b8)',
                fontSize: 'var(--text-sm, 0.875rem)',
                maxWidth: '620px',
                lineHeight: 'var(--leading-relaxed, 1.6)',
              }}
            >
              Community intelligence reported by local scouts. Track architectural glitches,
              clandestine street art, and urban legends vetted across the globe.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-3, 12px)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => navigate('#/explore')}
              style={{
                cursor: 'pointer',
                padding: 'var(--space-3, 12px) var(--space-5, 20px)',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--accent, #00f0ff)',
                color: 'var(--text-inverse, #0b0e14)',
                border: 'none',
                fontWeight: 700,
                fontSize: 'var(--text-sm, 0.875rem)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: 'var(--shadow-sm, 0 2px 6px rgba(0,0,0,0.3))',
              }}
            >
              <span>🧭</span>
              <span>Open Radar Map</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => navigate('#/random')}
              style={{
                cursor: 'pointer',
                padding: 'var(--space-3, 12px) var(--space-5, 20px)',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--bg-elevated, #1a2030)',
                color: 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-strong, #2f3b54)',
                fontWeight: 600,
                fontSize: 'var(--text-sm, 0.875rem)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>🎲</span>
              <span>Surprise Me</span>
            </button>
          </div>
        </div>
      </div>

      {/* Trending Digest Strip */}
      {trendingDigest.length > 0 && (
        <section
          aria-label="Trending Digest Strip"
          style={{ marginBottom: 'var(--space-8, 32px)' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 'var(--space-3, 12px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.25rem' }}>🔥</span>
              <h2
                style={{
                  margin: 0,
                  fontSize: 'var(--text-lg, 1.125rem)',
                  fontFamily: 'var(--font-heading, sans-serif)',
                  color: 'var(--text-primary, #f0f4fc)',
                }}
              >
                Trending Digest
              </h2>
            </div>
            <span style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--text-muted, #64748b)' }}>
              Top Vetted Finds
            </span>
          </div>

          <div
            className="trending-digest-strip"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 'var(--space-3, 12px)',
            }}
          >
            {trendingDigest.map((spot) => (
              <div
                key={`digest-${spot._id}`}
                onClick={() => navigate(`#/post/${spot._id}`)}
                style={{
                  cursor: 'pointer',
                  padding: 'var(--space-3, 12px)',
                  background: 'var(--bg-surface, #121722)',
                  border: '1px solid var(--border-subtle, #202738)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  boxShadow: 'var(--shadow-card, 0 2px 8px rgba(0,0,0,0.3))',
                  display: 'flex',
                  gap: 'var(--space-3, 12px)',
                  alignItems: 'center',
                  transition: 'all var(--transition-fast, 150ms ease)',
                }}
              >
                {spot.images && spot.images.length > 0 && (
                  <img
                    src={spot.images[0].url}
                    alt={spot.title}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: 'var(--radius-md, 8px)',
                      objectFit: 'cover',
                      flexShrink: 0,
                    }}
                  />
                )}
                <div style={{ minWidth: 0, flexGrow: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: 'var(--accent, #00f0ff)',
                        background: 'var(--accent-subtle, rgba(0,240,255,0.12))',
                        padding: '1px 5px',
                        borderRadius: '3px',
                      }}
                    >
                      ★ {spot.meter?.score ?? 0}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
                      {spot.place?.city || spot.place?.country || 'Sector'}
                    </span>
                  </div>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 'var(--text-xs, 0.75rem)',
                      fontWeight: 700,
                      color: 'var(--text-primary, #f0f4fc)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {spot.title}
                  </h4>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Mode Toggle & Feed Controls: Default vs Custom Rules */}
      <div
        className="feed-controls-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-3, 12px)',
          marginBottom: 'var(--space-4, 16px)',
          paddingBottom: 'var(--space-3, 12px)',
          borderBottom: '1px solid var(--border-subtle, #202738)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3, 12px)' }}>
          <div
            className="rule-mode-pills"
            role="tablist"
            aria-label="Feed Rules"
            style={{
              display: 'flex',
              background: 'var(--bg-surface, #121722)',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '3px',
              border: '1px solid var(--border-subtle, #202738)',
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={feedRuleMode === 'default'}
              onClick={() => setFeedRuleMode('default')}
              style={{
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: 'none',
                background: feedRuleMode === 'default' ? 'var(--accent, #00f0ff)' : 'transparent',
                color: feedRuleMode === 'default' ? 'var(--text-inverse, #0b0e14)' : 'var(--text-secondary, #94a3b8)',
                fontWeight: 700,
                fontSize: 'var(--text-xs, 0.75rem)',
              }}
            >
              Default Dispatch
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={feedRuleMode === 'custom'}
              onClick={() => setFeedRuleMode('custom')}
              style={{
                cursor: 'pointer',
                padding: '4px 12px',
                borderRadius: 'var(--radius-sm, 6px)',
                border: 'none',
                background: feedRuleMode === 'custom' ? 'var(--accent, #00f0ff)' : 'transparent',
                color: feedRuleMode === 'custom' ? 'var(--text-inverse, #0b0e14)' : 'var(--text-secondary, #94a3b8)',
                fontWeight: 700,
                fontSize: 'var(--text-xs, 0.75rem)',
              }}
            >
              Custom Feed Rules
            </button>
          </div>

          <span style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--text-muted, #64748b)' }}>
            Showing {displayedPosts.length} spots
          </span>
        </div>

        {/* Sort selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs, 0.75rem)' }}>
          <label htmlFor="home-sort" style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
            Sort:
          </label>
          <select
            id="home-sort"
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

      {/* Custom Rules Settings Drawer (when in custom mode) */}
      {feedRuleMode === 'custom' && (
        <div
          className="custom-rules-panel"
          style={{
            marginBottom: 'var(--space-6, 24px)',
            padding: 'var(--space-4, 16px)',
            background: 'var(--bg-surface, #121722)',
            border: '1px dashed var(--accent, #00f0ff)',
            borderRadius: 'var(--radius-lg, 12px)',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-4, 16px)',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs, 0.75rem)' }}>
            <label style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
              Min Score: <strong>{minScoreFilter}</strong>
            </label>
            <input
              type="range"
              min="0"
              max="50"
              step="5"
              value={minScoreFilter}
              onChange={(e) => setMinScoreFilter(Number(e.target.value))}
              style={{ accentColor: 'var(--accent, #00f0ff)', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs, 0.75rem)' }}>
            <label style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
              Filter Tag:
            </label>
            <select
              value={selectedTag}
              onChange={(e) => setSelectedTag(e.target.value)}
              style={{
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'var(--bg-elevated, #1a2030)',
                color: 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                fontSize: 'var(--text-xs, 0.75rem)',
              }}
            >
              <option value="all">All Tags</option>
              <option value="art">Art</option>
              <option value="historic">Historic</option>
              <option value="urban">Urban</option>
              <option value="glitch">Glitch</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              setMinScoreFilter(0);
              setSelectedTag('all');
            }}
            style={{
              cursor: 'pointer',
              background: 'transparent',
              border: '1px solid var(--border-subtle, #202738)',
              color: 'var(--text-secondary, #94a3b8)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
            }}
          >
            Reset Rules
          </button>
        </div>
      )}

      {error && <ErrorBanner message={error} retry={fetchHomeFeed} />}

      {/* Posts List */}
      {loading && posts.length === 0 ? (
        <LoadingSkeleton count={4} type="feed" />
      ) : displayedPosts.length === 0 ? (
        <EmptyState
          title={feedRuleMode === 'custom' ? 'No Spots Match Your Custom Rules' : 'No Community Dispatch Found'}
          message={
            feedRuleMode === 'custom'
              ? 'Try relaxing your score threshold or tag filters to see more field reports.'
              : 'Be the first scout to document an anomaly and initiate the home dispatch!'
          }
          icon="📡"
          actionText="Scan Radar"
          onAction={() => navigate('#/explore')}
          secondaryActionText="+ Post a Find"
          onSecondaryAction={() => navigate('#/create')}
        />
      ) : (
        <div
          className="post-grid"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4, 16px)',
            marginBottom: 'var(--space-8, 32px)',
          }}
        >
          {displayedPosts.map((post) => {
            const myVote = votedPosts[post._id];
            const hasImage = post.images && post.images.length > 0;

            return (
              <div
                key={post._id}
                className="post-card"
                onClick={() => navigate(`#/post/${post._id}`)}
                style={{
                  cursor: 'pointer',
                  display: 'flex',
                  gap: 'var(--space-4, 16px)',
                  padding: 'var(--space-4, 16px)',
                  background: 'var(--bg-surface, #121722)',
                  border: '1px solid var(--border-subtle, #202738)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  boxShadow: 'var(--shadow-card, 0 4px 12px rgba(0,0,0,0.3))',
                  transition: 'all var(--transition-fast, 150ms ease)',
                }}
              >
                {hasImage && (
                  <div
                    className="post-thumbnail-wrap"
                    style={{
                      width: '120px',
                      height: '120px',
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
                          ◌ Approximate Area
                        </span>
                      )}

                      <span
                        style={{
                          fontSize: 'var(--text-2xs, 11px)',
                          color: 'var(--text-muted, #64748b)',
                        }}
                      >
                        📍 {post.place?.city || 'Unknown'}, {post.place?.country || ''}
                      </span>
                    </div>

                    <h3
                      className="post-title"
                      style={{
                        margin: '0 0 6px',
                        fontSize: 'var(--text-lg, 1.125rem)',
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
                          fontSize: 'var(--text-sm, 0.875rem)',
                          color: 'var(--text-secondary, #94a3b8)',
                          lineHeight: 1.4,
                        }}
                      >
                        {post.body.length > 130 ? `${post.body.slice(0, 130)}...` : post.body}
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
                      Oddity Score: <strong style={{ color: 'var(--accent, #00f0ff)' }}>{post.meter?.score ?? 0}</strong>
                    </div>

                    <div className="vote-actions" style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className={`btn-vote ${myVote === 1 ? 'voted-up' : ''}`}
                        onClick={(e) => handleVote(post._id, 1, e)}
                        style={{
                          cursor: 'pointer',
                          padding: '3px 10px',
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
                          padding: '3px 10px',
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
                          padding: '3px 8px',
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
      )}
    </div>
  );
}
