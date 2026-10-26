import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingSkeleton, EmptyState, ErrorBanner } from '../components/ui/StatusViews';

const TELEPORT_COUNTRIES = [
  { code: '', label: '🌐 All Global Sectors', icon: '🌍' },
  { code: 'IN', label: 'India', icon: '🇮🇳' },
  { code: 'US', label: 'United States', icon: '🇺🇸' },
  { code: 'JP', label: 'Japan', icon: '🇯🇵' },
  { code: 'GB', label: 'United Kingdom', icon: '🇬🇧' },
  { code: 'DE', label: 'Germany', icon: '🇩🇪' },
  { code: 'FR', label: 'France', icon: '🇫🇷' },
  { code: 'AU', label: 'Australia', icon: '🇦🇺' },
];

/**
 * RandomPage - Discovery portal for country-tier anomalies with animated
 * "Surprise Me!" roll action, "Teleport Mode" country filtering, and Shift + R shortcut.
 */
export function RandomPage({ navigate }) {
  const { user } = useAuth();
  const [selectedCountry, setSelectedCountry] = useState('');
  const [spot, setSpot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRolling, setIsRolling] = useState(false);
  const [error, setError] = useState('');
  const [myVote, setMyVote] = useState(0);

  // Fetch a random country-tier post
  const fetchRandomSpot = useCallback(
    async (isShuffle = false) => {
      if (isShuffle) setIsRolling(true);
      setLoading(true);
      setError('');

      try {
        const res = await api.getRandomFeed({
          countryCode: selectedCountry || undefined,
        });

        const posts = res.posts || [];
        if (posts.length > 0) {
          // Select random from returned sample
          const chosen = posts[Math.floor(Math.random() * posts.length)];
          setSpot(chosen);
          setMyVote(0);
        } else {
          setSpot(null);
        }
      } catch (err) {
        setError(err.message || 'Failed to teleport to a random anomaly.');
      } finally {
        setLoading(false);
        if (isShuffle) {
          setTimeout(() => setIsRolling(false), 300);
        }
      }
    },
    [selectedCountry]
  );

  useEffect(() => {
    fetchRandomSpot(false);
  }, [fetchRandomSpot]);

  // Global Shift + R keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ensure target is not an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      if (e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        fetchRandomSpot(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [fetchRandomSpot]);

  const handleVote = async (value) => {
    if (!spot) return;
    if (!user) {
      navigate('#/login');
      return;
    }

    try {
      const res = await api.votePost(spot._id, value);
      setMyVote(value);
      setSpot((prev) => ({
        ...prev,
        meter: res.meter || prev.meter,
        tier: res.tier || prev.tier,
      }));
    } catch (err) {
      setError(err.message || 'Failed to submit vote.');
    }
  };

  return (
    <div className="random-page-container" style={{ width: '100%', maxWidth: '860px', margin: '0 auto', padding: '0 var(--space-4, 16px)' }}>
      {/* Header & Teleport Action Bar */}
      <div
        className="random-header"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 'var(--space-4, 16px)',
          margin: 'var(--space-6, 24px) 0 var(--space-8, 32px)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-xs, 0.75rem)',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: 'var(--accent, #00f0ff)',
            background: 'var(--accent-subtle, rgba(0,240,255,0.12))',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full, 9999px)',
            border: '1px solid var(--accent-border, rgba(0,240,255,0.35))',
          }}
        >
          🌌 Teleportation Matrix
        </span>

        <h1
          style={{
            margin: 0,
            fontSize: 'var(--text-4xl, 2.25rem)',
            fontFamily: 'var(--font-heading, sans-serif)',
            letterSpacing: '-0.5px',
          }}
        >
          Discover a Random Anomaly
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: '540px',
            color: 'var(--text-secondary, #94a3b8)',
            fontSize: 'var(--text-sm, 0.875rem)',
            lineHeight: 'var(--leading-relaxed, 1.6)',
          }}
        >
          Country-tier oddities that crossed the viral threshold. Press the button or hit{' '}
          <kbd
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--bg-elevated, #1a2030)',
              border: '1px solid var(--border-subtle, #202738)',
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '11px',
              color: 'var(--accent, #00f0ff)',
            }}
          >
            Shift + R
          </kbd>{' '}
          to jump to another coordinate.
        </p>

        {/* Teleport Mode Controls */}
        <div
          className="teleport-controls"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3, 12px)',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: 'var(--space-2, 8px)',
          }}
        >
          {/* Teleport Button */}
          <button
            type="button"
            className="btn-surprise-me"
            onClick={() => fetchRandomSpot(true)}
            disabled={loading}
            aria-label="Surprise Me (Shift + R)"
            style={{
              cursor: 'pointer',
              padding: 'var(--space-3, 12px) var(--space-8, 32px)',
              borderRadius: 'var(--radius-xl, 20px)',
              background: 'var(--accent, #00f0ff)',
              color: 'var(--text-inverse, #0b0e14)',
              border: 'none',
              fontWeight: 800,
              fontSize: 'var(--text-base, 1rem)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: isRolling
                ? '0 0 24px rgba(0, 240, 255, 0.8)'
                : 'var(--shadow-card, 0 4px 16px rgba(0,0,0,0.4))',
              transform: isRolling ? 'scale(0.97) rotate(-1deg)' : 'scale(1)',
              transition: 'all 200ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <span style={{ fontSize: '1.25rem', transform: isRolling ? 'rotate(180deg)' : 'none', transition: 'transform 300ms ease' }}>
              🎲
            </span>
            <span>{isRolling ? 'Teleporting...' : 'Surprise Me!'}</span>
          </button>

          {/* Country Sector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs, 0.75rem)' }}>
            <label htmlFor="teleport-country" style={{ color: 'var(--text-secondary, #94a3b8)', fontWeight: 600 }}>
              Teleport Sector:
            </label>
            <select
              id="teleport-country"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--bg-surface, #121722)',
                color: 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-strong, #2f3b54)',
                fontSize: 'var(--text-xs, 0.75rem)',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {TELEPORT_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <ErrorBanner message={error} retry={() => fetchRandomSpot(true)} />}

      {/* Spot Card Showcase */}
      {loading ? (
        <div style={{ padding: 'var(--space-6, 24px)', background: 'var(--bg-surface, #121722)', borderRadius: 'var(--radius-xl, 20px)', border: '1px solid var(--border-subtle, #202738)' }}>
          <LoadingSkeleton count={1} type="card" />
        </div>
      ) : !spot ? (
        <EmptyState
          title={selectedCountry ? 'No Country-Tier Spots in this Sector' : 'The Teleportation Matrix is Quiet'}
          message={
            selectedCountry
              ? 'No oddities in this sector have reached country tier yet. Try teleporting globally or report the first one!'
              : 'Be the first scout to discover a high-voltage anomaly!'
          }
          icon="🛸"
          actionText="Teleport Globally"
          onAction={() => {
            setSelectedCountry('');
            fetchRandomSpot(true);
          }}
          secondaryActionText="+ Post an Anomaly"
          onSecondaryAction={() => navigate('#/create')}
        />
      ) : (
        <article
          className="random-spot-showcase"
          style={{
            background: 'var(--bg-surface, #121722)',
            border: '1px solid var(--border-strong, #2f3b54)',
            borderRadius: 'var(--radius-xl, 20px)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.65))',
            display: 'flex',
            flexDirection: 'column',
            marginBottom: 'var(--space-12, 48px)',
            animation: 'random-card-appear 300ms ease-out',
          }}
        >
          {/* Showcase Hero Image */}
          {spot.images && spot.images.length > 0 ? (
            <div
              style={{
                width: '100%',
                height: '360px',
                position: 'relative',
                background: 'var(--bg-elevated, #1a2030)',
                overflow: 'hidden',
              }}
            >
              <img
                src={spot.images[0].url}
                alt={spot.title}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    background: 'var(--accent, #00f0ff)',
                    color: 'var(--text-inverse, #0b0e14)',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    letterSpacing: '0.5px',
                  }}
                >
                  COUNTRY TIER
                </span>
                {spot.hideExact && (
                  <span
                    style={{
                      background: 'rgba(0,0,0,0.85)',
                      color: 'var(--color-warning, #f59e0b)',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 8px',
                      borderRadius: '6px',
                      border: '1px dashed var(--color-warning, #f59e0b)',
                    }}
                  >
                    ◌ 400m Approximate Area
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              style={{
                width: '100%',
                height: '160px',
                background: 'linear-gradient(135deg, var(--bg-elevated, #1a2030), var(--bg-surface, #121722))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '3rem',
              }}
            >
              👁️
            </div>
          )}

          {/* Details Content */}
          <div style={{ padding: 'var(--space-6, 24px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-3, 12px)', marginBottom: 'var(--space-3, 12px)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--text-muted, #64748b)', marginBottom: '4px' }}>
                  📍 {spot.place?.city ? `${spot.place.city}, ` : ''}{spot.place?.country || 'Unknown Sector'}
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-2xl, 1.5rem)',
                    fontFamily: 'var(--font-heading, sans-serif)',
                    color: 'var(--text-primary, #f0f4fc)',
                    lineHeight: 1.25,
                  }}
                >
                  {spot.title}
                </h2>
              </div>

              {/* Oddity Score Display */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  background: 'var(--bg-elevated, #1a2030)',
                  border: '1px solid var(--border-subtle, #202738)',
                  borderRadius: 'var(--radius-md, 8px)',
                  padding: '6px 14px',
                }}
              >
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted, #64748b)', fontWeight: 700 }}>
                  Oddity Score
                </span>
                <span style={{ fontSize: 'var(--text-xl, 1.25rem)', fontWeight: 900, color: 'var(--accent, #00f0ff)' }}>
                  {spot.meter?.score ?? 0}
                </span>
              </div>
            </div>

            {spot.body && (
              <p
                style={{
                  margin: '0 0 var(--space-5, 20px)',
                  fontSize: 'var(--text-base, 1rem)',
                  color: 'var(--text-secondary, #94a3b8)',
                  lineHeight: 'var(--leading-relaxed, 1.6)',
                }}
              >
                {spot.body}
              </p>
            )}

            {/* Tags row */}
            {spot.tags && spot.tags.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: 'var(--space-5, 20px)' }}>
                {spot.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: '11px',
                      padding: '3px 8px',
                      background: 'var(--bg-elevated, #1a2030)',
                      color: 'var(--text-secondary, #94a3b8)',
                      borderRadius: 'var(--radius-sm, 4px)',
                      border: '1px solid var(--border-subtle, #202738)',
                    }}
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            {/* Actions Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 'var(--space-3, 12px)',
                paddingTop: 'var(--space-4, 16px)',
                borderTop: '1px solid var(--border-subtle, #202738)',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn-vote ${myVote === 1 ? 'voted-up' : ''}`}
                  onClick={() => handleVote(1)}
                  style={{
                    cursor: 'pointer',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    background: myVote === 1 ? 'var(--color-success-bg, rgba(16,185,129,0.2))' : 'var(--bg-elevated, #1a2030)',
                    color: myVote === 1 ? 'var(--color-success, #10b981)' : 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-subtle, #202738)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontWeight: 600,
                  }}
                >
                  👍 Like ({spot.meter?.likes ?? 0})
                </button>
                <button
                  type="button"
                  className={`btn-vote ${myVote === -1 ? 'voted-down' : ''}`}
                  onClick={() => handleVote(-1)}
                  style={{
                    cursor: 'pointer',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-md, 8px)',
                    background: myVote === -1 ? 'var(--color-danger-bg, rgba(239,68,68,0.2))' : 'var(--bg-elevated, #1a2030)',
                    color: myVote === -1 ? 'var(--color-danger, #ef4444)' : 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-subtle, #202738)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontWeight: 600,
                  }}
                >
                  👎 Dislike ({spot.meter?.dislikes ?? 0})
                </button>
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-3, 12px)' }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => navigate(`#/post/${spot._id}`)}
                  style={{
                    cursor: 'pointer',
                    padding: 'var(--space-2, 8px) var(--space-5, 20px)',
                    borderRadius: 'var(--radius-md, 8px)',
                    background: 'var(--accent, #00f0ff)',
                    color: 'var(--text-inverse, #0b0e14)',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 'var(--text-sm, 0.875rem)',
                  }}
                >
                  Inspect Full Details →
                </button>
              </div>
            </div>
          </div>
        </article>
      )}

      <style>{`
        @keyframes random-card-appear {
          0% { opacity: 0; transform: translateY(10px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
