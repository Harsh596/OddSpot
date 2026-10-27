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
            color: 'var(--accent-primary, #FF6F00)',
            background: 'var(--accent-highlight, #FFF8E1)',
            padding: '4px 14px',
            borderRadius: '9999px',
            border: '1px solid #FFCC80',
          }}
        >
          🌌 Teleportation Matrix
        </span>

        <h1
          style={{
            margin: 0,
            fontSize: 'var(--text-4xl, 2.25rem)',
            fontFamily: 'var(--font-heading, "Plus Jakarta Sans", sans-serif)',
            fontWeight: 800,
            color: 'var(--text-primary, #1A1814)',
            letterSpacing: '-0.5px',
          }}
        >
          Discover a Random Anomaly
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: '540px',
            color: 'var(--text-secondary, #6E675F)',
            fontSize: 'var(--text-sm, 0.925rem)',
            lineHeight: 'var(--leading-relaxed, 1.6)',
          }}
        >
          Country-tier oddities that crossed the viral threshold. Press the button or hit{' '}
          <kbd
            style={{
              padding: '2px 8px',
              borderRadius: '6px',
              background: 'var(--bg-elevated, #FFF3E0)',
              border: '1px solid var(--border-color, #E6DFD5)',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--accent-primary, #FF6F00)',
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
              padding: '12px 32px',
              borderRadius: '9999px',
              background: 'linear-gradient(135deg, #FF6F00 0%, #FFB300 100%)',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 800,
              fontSize: 'var(--text-base, 1rem)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: isRolling
                ? '0 0 24px rgba(255, 111, 0, 0.6)'
                : '0 6px 20px rgba(255, 111, 0, 0.28)',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs, 0.8rem)' }}>
            <label htmlFor="teleport-country" style={{ color: 'var(--text-secondary, #6E675F)', fontWeight: 700 }}>
              Teleport Sector:
            </label>
            <select
              id="teleport-country"
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                background: 'var(--bg-surface, #FFFFFF)',
                color: 'var(--text-primary, #1A1814)',
                border: '1px solid var(--border-color, #E6DFD5)',
                fontSize: 'var(--text-xs, 0.825rem)',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-card, 0 4px 20px -2px rgba(255, 111, 0, 0.08))',
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
        <div style={{ padding: 'var(--space-6, 24px)', background: 'var(--bg-surface, #FFFFFF)', borderRadius: 'var(--radius-card, 16px)', border: '1px solid var(--border-color, #E6DFD5)' }}>
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
            background: 'var(--bg-surface, #FFFFFF)',
            border: '1px solid var(--border-color, #E6DFD5)',
            borderRadius: 'var(--radius-card, 16px)',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-card, 0 4px 20px -2px rgba(255, 111, 0, 0.08))',
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
                background: 'var(--bg-elevated, #FFF3E0)',
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
                    background: 'var(--accent-primary, #FF6F00)',
                    color: '#FFFFFF',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '4px 10px',
                    borderRadius: '9999px',
                    letterSpacing: '0.5px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  }}
                >
                  COUNTRY TIER
                </span>
                {spot.hideExact && (
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.95)',
                      color: '#B45309',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '9999px',
                      border: '1px dashed #F59E0B',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
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
                background: 'linear-gradient(135deg, var(--bg-elevated, #FFF3E0), var(--accent-highlight, #FFF8E1))',
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
                <div style={{ fontSize: 'var(--text-xs, 0.75rem)', color: 'var(--text-secondary, #6E675F)', fontWeight: 600, marginBottom: '4px' }}>
                  📍 {spot.place?.city ? `${spot.place.city}, ` : ''}{spot.place?.country || 'Unknown Sector'}
                </div>
                <h2
                  style={{
                    margin: 0,
                    fontSize: 'var(--text-2xl, 1.625rem)',
                    fontFamily: 'var(--font-heading, "Plus Jakarta Sans", sans-serif)',
                    fontWeight: 800,
                    color: 'var(--text-primary, #1A1814)',
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
                  background: 'var(--accent-highlight, #FFF8E1)',
                  border: '1px solid #FFCC80',
                  borderRadius: '12px',
                  padding: '8px 16px',
                }}
              >
                <span style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary, #6E675F)', fontWeight: 700 }}>
                  Oddity Score
                </span>
                <span style={{ fontSize: 'var(--text-xl, 1.35rem)', fontWeight: 900, color: 'var(--accent-primary, #FF6F00)' }}>
                  {spot.meter?.score ?? 0}
                </span>
              </div>
            </div>

            {spot.body && (
              <p
                style={{
                  margin: '0 0 var(--space-5, 20px)',
                  fontSize: 'var(--text-base, 0.95rem)',
                  color: 'var(--text-secondary, #6E675F)',
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
                      fontWeight: 700,
                      padding: '3px 10px',
                      background: 'var(--bg-elevated, #FFF3E0)',
                      color: 'var(--accent-primary, #FF6F00)',
                      borderRadius: '9999px',
                      border: '1px solid #FFCC80',
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
                borderTop: '1px solid var(--border-color, #E6DFD5)',
              }}
            >
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className={`btn-vote ${myVote === 1 ? 'voted-up' : ''}`}
                  onClick={() => handleVote(1)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    background: myVote === 1 ? '#ECFDF5' : 'var(--bg-surface, #FFFFFF)',
                    color: myVote === 1 ? '#059669' : 'var(--text-primary, #1A1814)',
                    border: myVote === 1 ? '1px solid #A7F3D0' : '1px solid var(--border-color, #E6DFD5)',
                    fontSize: 'var(--text-xs, 0.8rem)',
                    fontWeight: 700,
                    transition: 'all 0.15s ease',
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
                    padding: '8px 16px',
                    borderRadius: '9999px',
                    background: myVote === -1 ? '#FEF2F2' : 'var(--bg-surface, #FFFFFF)',
                    color: myVote === -1 ? '#DC2626' : 'var(--text-primary, #1A1814)',
                    border: myVote === -1 ? '1px solid #FECACA' : '1px solid var(--border-color, #E6DFD5)',
                    fontSize: 'var(--text-xs, 0.8rem)',
                    fontWeight: 700,
                    transition: 'all 0.15s ease',
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
                    padding: '8px 20px',
                    borderRadius: '9999px',
                    background: 'var(--accent-primary, #FF6F00)',
                    color: '#FFFFFF',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: 'var(--text-sm, 0.875rem)',
                    boxShadow: '0 4px 12px rgba(255, 111, 0, 0.25)',
                    transition: 'all 0.15s ease',
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
