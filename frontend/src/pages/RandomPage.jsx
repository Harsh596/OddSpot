import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingSkeleton, EmptyState, ErrorBanner } from '../components/ui/StatusViews';
import { OddometerPill } from '../components/meter/OddometerPill';

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

function matchesCountry(post, countryCode) {
  if (!countryCode) return true;
  const pCode = post.place?.countryCode || '';
  return pCode.toUpperCase() === countryCode.toUpperCase();
}

/**
 * RandomPage - Teleportation Matrix across Your & Other Communities:
 * - Community Scope Filter: 'all' (Your & Other), 'your' (Joined), 'other' (Discover New)
 * - Specific Community Selector: Roll randomly within a target faction/community
 * - Region Teleport Selector: Filter by Country code or global
 * - Community Origin Dossier Header: Displays community badge, scope pill, and 1-click "+ Join Community"
 * - Tactile "Roll Oddity" button with dice rotation animation & Shift+R shortcut
 * - "Explore Community Transmissions" stream displaying cards from Your and Other communities
 */
export function RandomPage({ navigate }) {
  const { user } = useAuth();
  const heroCardRef = useRef(null);

  // Filter & Teleport state
  const [communityScope, setCommunityScope] = useState('all'); // 'all' | 'your' | 'other'
  const [selectedCommunitySlug, setSelectedCommunitySlug] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');

  // Active showcased spot & UI status
  const [spot, setSpot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRolling, setIsRolling] = useState(false);
  const [error, setError] = useState('');
  const [myVote, setMyVote] = useState(0);
  const [joiningSlug, setJoiningSlug] = useState('');

  // Communities & Posts ecosystem
  const [joinedCommunities, setJoinedCommunities] = useState([]);
  const [otherCommunities, setOtherCommunities] = useState([]);
  const [yourPosts, setYourPosts] = useState([]);
  const [otherPosts, setOtherPosts] = useState([]);

  // Stream Tab state
  const [browseTab, setBrowseTab] = useState('all'); // 'all' | 'your' | 'other'

  // LocalStorage bookmarks
  const [savedSpots, setSavedSpots] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('oddspot_saved_spots') || '[]');
    } catch {
      return [];
    }
  });

  const handleToggleSave = (postId, e) => {
    if (e) e.stopPropagation();
    setSavedSpots((prev) => {
      const next = prev.includes(postId) ? prev.filter((id) => id !== postId) : [...prev, postId];
      try {
        localStorage.setItem('oddspot_saved_spots', JSON.stringify(next));
      } catch (err) {
        console.warn('Failed to save spot:', err);
      }
      return next;
    });
  };

  // Helper to roll a spot from a designated pool
  const pickFromPool = useCallback((your, other, scope, commSlug, country) => {
    let pool = scope === 'your' ? [...your] : scope === 'other' ? [...other] : [...your, ...other];

    if (commSlug) {
      pool = pool.filter((p) => p.community?.slug === commSlug);
    }

    if (country) {
      pool = pool.filter((p) => matchesCountry(p, country));
    }

    if (pool.length > 0) {
      const chosen = pool[Math.floor(Math.random() * pool.length)];
      setSpot(chosen);
      setMyVote(0);
    } else {
      setSpot(null);
    }
  }, []);

  // Fetch communities & aggregate posts
  const loadCommunityEcosystem = useCallback(async (isInitial = true) => {
    if (isInitial) setLoading(true);
    setError('');

    try {
      // 1. Fetch user's joined communities (if logged in)
      let userJoined = [];
      if (user?.username) {
        try {
          const res = await api.getUserCommunities(user.username);
          userJoined = res.communities || [];
        } catch (err) {
          console.warn('Failed to load user communities:', err);
        }
      }
      setJoinedCommunities(userJoined);

      // 2. Fetch all discoverable communities
      let discoverable = [];
      try {
        const commRes = await api.getNearbyCommunities({ limit: 50 });
        discoverable = commRes.communities || [];
      } catch (err) {
        console.warn('Failed to load discoverable communities:', err);
      }

      // Calculate other communities (not joined by this user)
      const joinedIds = new Set(userJoined.map((c) => String(c._id || c.id || c.slug)));
      const others = discoverable.filter(
        (c) => !joinedIds.has(String(c._id || c.id || c.slug)) && !joinedIds.has(c.slug)
      );
      setOtherCommunities(others);

      // Community dictionary for matching
      const commMap = new Map();
      [...userJoined, ...discoverable].forEach((c) => {
        if (c._id) commMap.set(String(c._id), c);
        if (c.slug) commMap.set(c.slug, c);
      });

      // 3. Fetch community posts in parallel
      const yourPostsAccum = [];
      const otherPostsAccum = [];

      const joinedToFetch = userJoined.slice(0, 5);
      await Promise.all(
        joinedToFetch.map(async (c) => {
          try {
            const pRes = await api.getCommunityPosts(c.slug, { limit: 15 });
            const posts = (pRes.posts || []).map((p) => ({
              ...p,
              community: c,
              isYourCommunity: true,
            }));
            yourPostsAccum.push(...posts);
          } catch (e) {
            console.warn(`Failed to fetch posts for joined community ${c.slug}:`, e);
          }
        })
      );

      const othersToFetch = others.slice(0, 5);
      await Promise.all(
        othersToFetch.map(async (c) => {
          try {
            const pRes = await api.getCommunityPosts(c.slug, { limit: 15 });
            const posts = (pRes.posts || []).map((p) => ({
              ...p,
              community: c,
              isYourCommunity: false,
            }));
            otherPostsAccum.push(...posts);
          } catch (e) {
            console.warn(`Failed to fetch posts for other community ${c.slug}:`, e);
          }
        })
      );

      // 4. Augment with general home/random feed
      let generalPosts = [];
      try {
        const homeRes = await api.getHomeFeed({ limit: 30 });
        generalPosts = homeRes.posts || [];
      } catch {
        try {
          const randRes = await api.getRandomFeed();
          generalPosts = randRes.posts || [];
        } catch {
          // ignore
        }
      }

      const taggedGeneralPosts = generalPosts.map((p) => {
        const cId = p.communityId ? String(p.communityId) : null;
        const matchingComm = cId ? commMap.get(cId) : null;
        const isJoined = matchingComm
          ? joinedIds.has(String(matchingComm._id || matchingComm.slug))
          : false;

        return {
          ...p,
          community: matchingComm || {
            name: `${p.place?.city || 'Regional'} Oddities`,
            slug: (p.place?.city || 'sector').toLowerCase().replace(/\s+/g, '-'),
            scope: 'city',
            place: p.place,
          },
          isYourCommunity: isJoined,
        };
      });

      // Deduplicate posts by _id
      const seenIds = new Set();
      const dedupYour = [];
      const dedupOther = [];

      for (const p of yourPostsAccum) {
        if (!seenIds.has(p._id)) {
          seenIds.add(p._id);
          dedupYour.push(p);
        }
      }

      for (const p of otherPostsAccum) {
        if (!seenIds.has(p._id)) {
          seenIds.add(p._id);
          dedupOther.push(p);
        }
      }

      for (const p of taggedGeneralPosts) {
        if (!seenIds.has(p._id)) {
          seenIds.add(p._id);
          if (p.isYourCommunity) {
            dedupYour.push(p);
          } else {
            dedupOther.push(p);
          }
        }
      }

      setYourPosts(dedupYour);
      setOtherPosts(dedupOther);

      // Pick the initial spot
      pickFromPool(dedupYour, dedupOther, communityScope, selectedCommunitySlug, selectedCountry);
    } catch (err) {
      setError(err.message || 'Failed to initialize community teleportation console.');
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [user, communityScope, selectedCommunitySlug, selectedCountry, pickFromPool]);

  useEffect(() => {
    let isMounted = true;
    loadCommunityEcosystem(true).catch((err) => {
      if (isMounted) console.warn('Init random page error:', err);
    });
    return () => {
      isMounted = false;
    };
  }, [loadCommunityEcosystem]);

  // Roll button click handler
  const handleRollClick = () => {
    setIsRolling(true);
    setTimeout(() => {
      pickFromPool(yourPosts, otherPosts, communityScope, selectedCommunitySlug, selectedCountry);
      setIsRolling(false);
    }, 280);
  };

  // Keyboard shortcut: Shift + R
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }

      if (e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        handleRollClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // 1-Click Join Community on the fly
  const handleJoinCommunity = async (comm) => {
    if (!user) {
      navigate('#/login');
      return;
    }

    const slug = comm.slug;
    setJoiningSlug(slug);

    try {
      await api.joinCommunity(slug);

      setJoinedCommunities((prev) => [...prev, comm]);
      setOtherCommunities((prev) => prev.filter((c) => c.slug !== slug));

      setYourPosts((prev) => [
        ...prev,
        ...otherPosts
          .filter((p) => p.community?.slug === slug)
          .map((p) => ({ ...p, isYourCommunity: true })),
      ]);
      setOtherPosts((prev) => prev.filter((p) => p.community?.slug !== slug));

      if (spot && spot.community?.slug === slug) {
        setSpot((prev) => ({
          ...prev,
          isYourCommunity: true,
        }));
      }
    } catch (err) {
      setError(err.message || 'Failed to join community.');
    } finally {
      setJoiningSlug('');
    }
  };

  // Vote handler
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

  // Select a post directly from the browse stream
  const handleSelectFromStream = (post) => {
    setSpot(post);
    setMyVote(0);
    if (heroCardRef.current) {
      heroCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Calculate stream posts based on browseTab
  const displayedStreamPosts = (() => {
    let pool =
      browseTab === 'your'
        ? yourPosts
        : browseTab === 'other'
        ? otherPosts
        : [...yourPosts, ...otherPosts];
    if (selectedCountry) {
      pool = pool.filter((p) => matchesCountry(p, selectedCountry));
    }
    return pool;
  })();

  const allKnownCommunities = [...joinedCommunities, ...otherCommunities];

  return (
    <div
      className="random-page-container"
      style={{
        width: '100%',
        maxWidth: '920px',
        margin: '0 auto',
        padding: '0 1rem 4rem',
        color: 'var(--text-primary)',
      }}
    >
      {/* 1. Sector Teleportation Console Header with Exposed Grid & Scope Bar */}
      <section
        className="tw-grid-section tw-card"
        style={{
          margin: '1.5rem 0 2rem',
          padding: '2rem 1.5rem',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle, #ECE7DF)',
          background: 'var(--bg-surface, #FFFFFF)',
          boxShadow: 'var(--shadow-card, 0 1px 3px rgba(24, 24, 27, 0.05))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1.25rem',
          position: 'relative',
        }}
      >
        <span
          className="tw-kicker"
          style={{
            fontSize: '11px',
            padding: '4px 12px',
            borderRadius: '6px',
            background: 'var(--bg-elevated, #FFF7ED)',
            color: 'var(--accent-primary, #FF6F00)',
            border: '1px solid var(--border-subtle, #ECE7DF)',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 700,
            letterSpacing: '0.06em',
          }}
        >
          [ TELEPORTATION MATRIX · YOUR &amp; OTHER COMMUNITIES ]
        </span>

        <h1
          style={{
            margin: 0,
            fontSize: 'clamp(1.75rem, 3.2vw, 2.5rem)',
            fontFamily: 'var(--font-heading, "Plus Jakarta Sans", sans-serif)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1.2,
          }}
        >
          Roll a Random Community Oddity
        </h1>

        <p
          style={{
            margin: 0,
            maxWidth: '620px',
            color: 'var(--text-secondary)',
            fontSize: '0.925rem',
            lineHeight: 1.6,
          }}
        >
          Teleport instantly across folklore, architecture, and curiosities from your joined
          circles, or discover dispatches from other communities around the globe.{' '}
          <span className="desktop-shortcut-hint">
            Hit <kbd className="tw-kbd">Shift + R</kbd> anytime to re-roll.
          </span>
        </p>

        {/* 2. Community Scope Filter Tabs: All Communities vs Your Communities vs Other Communities */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'var(--bg-card-inner, #F5F1EA)',
            padding: '4px',
            borderRadius: '10px',
            border: '1px solid var(--border-subtle)',
            gap: '4px',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
          role="tablist"
          aria-label="Community Teleport Scope"
        >
          <button
            type="button"
            role="tab"
            aria-selected={communityScope === 'all'}
            onClick={() => {
              setCommunityScope('all');
              pickFromPool(yourPosts, otherPosts, 'all', selectedCommunitySlug, selectedCountry);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              background: communityScope === 'all' ? 'var(--bg-surface)' : 'transparent',
              color: communityScope === 'all' ? 'var(--accent-primary, #FF6F00)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: communityScope === 'all' ? 'var(--shadow-xs)' : 'none',
              transition: 'all 120ms ease',
            }}
          >
            <span>🌐 All Communities</span>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '999px',
                background: 'var(--bg-elevated)',
                color: 'var(--text-muted)',
              }}
            >
              {yourPosts.length + otherPosts.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={communityScope === 'your'}
            onClick={() => {
              setCommunityScope('your');
              pickFromPool(yourPosts, otherPosts, 'your', selectedCommunitySlug, selectedCountry);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              background: communityScope === 'your' ? 'var(--bg-surface)' : 'transparent',
              color: communityScope === 'your' ? 'var(--badge-green-text, #166534)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: communityScope === 'your' ? 'var(--shadow-xs)' : 'none',
              transition: 'all 120ms ease',
            }}
          >
            <span>⭐ Your Communities</span>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '999px',
                background: 'var(--badge-green-bg)',
                color: 'var(--badge-green-text)',
              }}
            >
              {yourPosts.length}
            </span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={communityScope === 'other'}
            onClick={() => {
              setCommunityScope('other');
              pickFromPool(yourPosts, otherPosts, 'other', selectedCommunitySlug, selectedCountry);
            }}
            style={{
              padding: '6px 14px',
              borderRadius: '7px',
              border: 'none',
              background: communityScope === 'other' ? 'var(--bg-surface)' : 'transparent',
              color: communityScope === 'other' ? 'var(--badge-blue-text, #1E40AF)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.8125rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: communityScope === 'other' ? 'var(--shadow-xs)' : 'none',
              transition: 'all 120ms ease',
            }}
          >
            <span>🔭 Other Communities</span>
            <span
              style={{
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '999px',
                background: 'var(--badge-blue-bg)',
                color: 'var(--badge-blue-text)',
              }}
            >
              {otherPosts.length}
            </span>
          </button>
        </div>

        {/* 3. Teleport Controls Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            width: '100%',
          }}
        >
          {/* Main Roll Button */}
          <button
            type="button"
            onClick={handleRollClick}
            disabled={loading}
            aria-label="Roll Oddity"
            style={{
              cursor: 'pointer',
              minHeight: '44px',
              padding: '0 28px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #FF6F00 0%, #FFB300 100%)',
              color: '#FFFFFF',
              border: 'none',
              fontWeight: 700,
              fontSize: '0.925rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: isRolling
                ? '0 0 20px rgba(255, 111, 0, 0.6)'
                : '0 4px 14px rgba(255, 111, 0, 0.3)',
              transform: isRolling ? 'scale(0.97)' : 'scale(1)',
              transition: 'all 160ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <span
              style={{
                fontSize: '1.25rem',
                transform: isRolling ? 'rotate(180deg)' : 'none',
                transition: 'transform 280ms ease',
                display: 'inline-block',
              }}
            >
              🎲
            </span>
            <span>{isRolling ? 'Teleporting...' : 'Roll Oddity'}</span>
          </button>

          {/* Specific Community Selector (Optional Filter) */}
          {allKnownCommunities.length > 0 && (
            <select
              id="teleport-community"
              value={selectedCommunitySlug}
              onChange={(e) => {
                const slug = e.target.value;
                setSelectedCommunitySlug(slug);
                pickFromPool(yourPosts, otherPosts, communityScope, slug, selectedCountry);
              }}
              aria-label="Filter teleport community"
              style={{
                minHeight: '44px',
                padding: '0 14px',
                borderRadius: '8px',
                background: 'var(--input-bg, var(--bg-surface))',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.84rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: 'var(--shadow-xs)',
                maxWidth: '240px',
              }}
            >
              <option value="">🏛️ Any Community</option>
              {allKnownCommunities.map((c) => {
                const isJoined = joinedCommunities.some((j) => j.slug === c.slug);
                return (
                  <option key={c.slug} value={c.slug}>
                    {isJoined ? '⭐' : '🔭'} {c.name || `c/${c.slug}`}
                  </option>
                );
              })}
            </select>
          )}

          {/* 44px min-height Country Selector for Mobile Ergonomics */}
          <select
            id="teleport-country"
            value={selectedCountry}
            onChange={(e) => {
              const code = e.target.value;
              setSelectedCountry(code);
              pickFromPool(yourPosts, otherPosts, communityScope, selectedCommunitySlug, code);
            }}
            aria-label="Filter teleport sector country"
            style={{
              minHeight: '44px',
              padding: '0 14px',
              borderRadius: '8px',
              background: 'var(--input-bg, var(--bg-surface))',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: 'var(--shadow-xs)',
            }}
          >
            {TELEPORT_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {error && <ErrorBanner message={error} retry={() => loadCommunityEcosystem(false)} />}

      {/* 4. Active Rolled Dossier Card Showcase */}
      <div ref={heroCardRef}>
        {loading ? (
          <div
            style={{
              padding: '2rem 1.5rem',
              background: 'var(--bg-surface)',
              borderRadius: '16px',
              border: '1px solid var(--border-subtle)',
              marginBottom: '2rem',
            }}
          >
            <LoadingSkeleton count={1} type="card" />
          </div>
        ) : !spot ? (
          <EmptyState
            title={
              communityScope === 'your' && yourPosts.length === 0
                ? "No Dispatches from Your Communities"
                : communityScope === 'other' && otherPosts.length === 0
                ? "No Dispatches from Other Communities"
                : "The Community Matrix is Searching for Signals"
            }
            message={
              communityScope === 'your' && yourPosts.length === 0
                ? (user
                    ? "You haven't joined any communities with published finds yet. Try rolling from 'Other Communities' to discover new circles!"
                    : "Log in to view posts from communities you've joined, or explore other communities freely!")
                : "No matching community curiosities found for the active filter. Relax your region or roll across All Communities!"
            }
            icon="🛸"
            actionText={communityScope === 'your' ? "Roll from Other Communities" : "Roll from All Communities"}
            onAction={() => {
              setCommunityScope('all');
              setSelectedCommunitySlug('');
              setSelectedCountry('');
              pickFromPool(yourPosts, otherPosts, 'all', '', '');
            }}
            secondaryActionText="Explore Communities Hub"
            onSecondaryAction={() => navigate('#/communities')}
          />
        ) : (
          <article
            className="tw-card"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: 'var(--shadow-card, 0 1px 3px rgba(24, 24, 27, 0.05))',
              display: 'flex',
              flexDirection: 'column',
              marginBottom: '2.5rem',
            }}
          >
            {/* Community Origin Header Bar */}
            {spot.community && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 18px',
                  background: 'var(--bg-card-inner, #FAF7F2)',
                  borderBottom: '1px solid var(--border-subtle)',
                  flexWrap: 'wrap',
                  gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <span style={{ fontSize: '1.2rem' }} aria-hidden="true">
                    🏛️
                  </span>
                  <div>
                    <button
                      type="button"
                      onClick={() => navigate(`#/community/${spot.community.slug}`)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        color: 'var(--text-primary)',
                        fontWeight: 800,
                        fontSize: '0.925rem',
                        cursor: 'pointer',
                        textAlign: 'left',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                      title={`Visit ${spot.community.name || spot.community.slug}`}
                    >
                      <span>{spot.community.name || `c/${spot.community.slug}`}</span>
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          fontFamily: 'var(--font-mono, monospace)',
                          fontWeight: 500,
                        }}
                      >
                        c/{spot.community.slug}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Community Membership Status & Action */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {spot.isYourCommunity ? (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: 'var(--badge-green-bg)',
                        color: 'var(--badge-green-text)',
                        border: '1px solid var(--badge-green-border)',
                        fontSize: '11px',
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono, monospace)',
                      }}
                    >
                      ⭐ Your Community · ✓ Joined
                    </span>
                  ) : (
                    <>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 8px',
                          borderRadius: '999px',
                          background: 'var(--badge-blue-bg)',
                          color: 'var(--badge-blue-text)',
                          border: '1px solid var(--badge-blue-border)',
                          fontSize: '11px',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        🔭 Other Community
                      </span>
                      <button
                        type="button"
                        onClick={() => handleJoinCommunity(spot.community)}
                        disabled={joiningSlug === spot.community.slug}
                        style={{
                          cursor: 'pointer',
                          padding: '4px 12px',
                          borderRadius: '6px',
                          background: 'var(--btn-secondary-bg, #F3F4F6)',
                          color: 'var(--btn-secondary-text, #1F2937)',
                          border: '1px solid var(--btn-secondary-border, #E5E7EB)',
                          fontSize: '11px',
                          fontWeight: 700,
                          transition: 'all 120ms ease',
                        }}
                      >
                        {joiningSlug === spot.community.slug ? 'Joining...' : '+ Join Community'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Showcase Hero Image Container */}
            <div
              style={{
                width: '100%',
                aspectRatio: '16/10',
                maxHeight: '440px',
                position: 'relative',
                background: 'var(--bg-elevated)',
                overflow: 'hidden',
              }}
            >
              {spot.images && spot.images.length > 0 ? (
                <img
                  src={spot.images[0].url}
                  alt={spot.title}
                  loading="lazy"
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '3.5rem',
                    background: 'var(--bg-card-inner)',
                  }}
                >
                  👁️
                </div>
              )}

              {/* Badges Overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: '14px',
                  left: '14px',
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap',
                  zIndex: 2,
                }}
              >
                <span
                  style={{
                    background:
                      spot.tier === 'country'
                        ? 'var(--accent-cta, #C2410C)'
                        : 'var(--badge-gold-bg, #FEF3C7)',
                    color:
                      spot.tier === 'country'
                        ? 'var(--text-on-accent, #FFFFFF)'
                        : 'var(--badge-gold-text, #92400E)',
                    border:
                      spot.tier === 'country'
                        ? 'none'
                        : '1px solid var(--badge-gold-border, #FDE68A)',
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontFamily: 'var(--font-mono, monospace)',
                    letterSpacing: '0.04em',
                  }}
                >
                  {(spot.tier || 'city').toUpperCase()} TIER
                </span>
                {spot.hideExact && (
                  <span
                    style={{
                      background: 'var(--badge-neutral-bg, rgba(255, 255, 255, 0.94))',
                      color: 'var(--badge-gold-text, #B45309)',
                      border: '1px dashed var(--badge-gold-border, #F59E0B)',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '4px',
                      fontFamily: 'var(--font-mono, monospace)',
                    }}
                  >
                    [ 🔒 ~400m Approximate Area ]
                  </span>
                )}
              </div>

              {/* Bookmark Button */}
              <button
                type="button"
                onClick={(e) => handleToggleSave(spot._id, e)}
                aria-label={savedSpots.includes(spot._id) ? 'Remove saved spot' : 'Save spot'}
                title={savedSpots.includes(spot._id) ? 'Saved spot' : 'Save spot'}
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '16px',
                  boxShadow: 'var(--shadow-sm)',
                  zIndex: 2,
                }}
              >
                {savedSpots.includes(spot._id) ? '🔖' : '🏷️'}
              </button>
            </div>

            {/* Details Content */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  flexWrap: 'wrap',
                  gap: '1rem',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono, monospace)',
                      fontSize: '11px',
                      color: 'var(--text-muted)',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      marginBottom: '4px',
                    }}
                  >
                    📍 {spot.place?.city ? `${spot.place.city}, ` : ''}
                    {spot.place?.country || 'GLOBAL SECTOR'}
                  </div>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: '1.6rem',
                      fontFamily: 'var(--font-heading, "Plus Jakarta Sans", sans-serif)',
                      fontWeight: 800,
                      color: 'var(--text-primary)',
                      lineHeight: 1.25,
                    }}
                  >
                    {spot.title}
                  </h2>
                </div>

                {/* Oddometer Pill */}
                <OddometerPill
                  score={spot.meter?.score}
                  countryThreshold={spot.meter?.countryThreshold}
                  label={spot.meter?.label}
                  tier={spot.tier}
                  size="md"
                />
              </div>

              {spot.body && (
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.95rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.6,
                  }}
                >
                  {spot.body}
                </p>
              )}

              {/* Tags row */}
              {spot.tags && spot.tags.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {spot.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        padding: '2px 8px',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-muted)',
                        borderRadius: '4px',
                        border: '1px solid var(--border-subtle)',
                        fontFamily: 'var(--font-mono, monospace)',
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Scout Attribution & Profile link */}
              {(() => {
                const scoutAuthor = spot.authorId?.username || spot.author || (typeof spot.authorId === 'string' ? spot.authorId : 'scout_anomaly');
                const scoutInitial = scoutAuthor.charAt(0).toUpperCase();
                return (
                  <div
                    onClick={() => navigate(`#/user/${scoutAuthor}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`#/user/${scoutAuthor}`)}
                    title={`Open Scout @${scoutAuthor}'s Field Dossier`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      background: 'var(--bg-card-inner, var(--bg-surface-soft))',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--accent-primary, #B83818)',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: '13px',
                          flexShrink: 0,
                        }}
                      >
                        {scoutInitial}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>
                          Logged By Field Scout
                        </div>
                        <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                          @{scoutAuthor}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: 'var(--badge-gold-bg)',
                          color: 'var(--badge-gold-text)',
                          border: '1px solid var(--badge-gold-border)',
                        }}
                      >
                        Scout Dossier ↗
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Actions Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  paddingTop: '1rem',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => handleVote(1)}
                    style={{
                      cursor: 'pointer',
                      minHeight: '40px',
                      padding: '0 14px',
                      borderRadius: '8px',
                      background:
                        myVote === 1 ? 'var(--badge-green-bg)' : 'var(--bg-card-inner)',
                      color:
                        myVote === 1 ? 'var(--badge-green-text)' : 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      transition: 'all 120ms ease',
                    }}
                  >
                    👍 Like ({spot.meter?.likes ?? 0})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleVote(-1)}
                    style={{
                      cursor: 'pointer',
                      minHeight: '40px',
                      padding: '0 14px',
                      borderRadius: '8px',
                      background:
                        myVote === -1 ? 'var(--badge-red-bg)' : 'var(--bg-card-inner)',
                      color:
                        myVote === -1 ? 'var(--badge-red-text)' : 'var(--text-primary)',
                      border: '1px solid var(--border-subtle)',
                      fontSize: '0.8125rem',
                      fontWeight: 700,
                      transition: 'all 120ms ease',
                    }}
                  >
                    👎 Dislike ({spot.meter?.dislikes ?? 0})
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => navigate(`#/post/${spot._id}`)}
                    style={{
                      cursor: 'pointer',
                      minHeight: '40px',
                      padding: '0 20px',
                      borderRadius: '8px',
                      fontWeight: 700,
                      fontSize: '0.84rem',
                    }}
                  >
                    Inspect Full Dossier →
                  </button>
                </div>
              </div>
            </div>
          </article>
        )}
      </div>

      {/* 5. "Explore Community Transmissions" Section: Posts from Your & Other Communities */}
      <section
        style={{
          marginTop: '3rem',
          paddingTop: '2rem',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: '1.35rem',
                fontWeight: 800,
                color: 'var(--text-primary)',
              }}
            >
              📡 Explore Community Transmissions
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
              Click any oddity to teleport directly to its dossier
            </p>
          </div>

          {/* Sub-tabs for the stream */}
          <div
            style={{
              display: 'inline-flex',
              background: 'var(--bg-card-inner)',
              padding: '3px',
              borderRadius: '8px',
              border: '1px solid var(--border-subtle)',
              gap: '4px',
            }}
          >
            <button
              type="button"
              onClick={() => setBrowseTab('all')}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: 'none',
                background: browseTab === 'all' ? 'var(--bg-surface)' : 'transparent',
                color: browseTab === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              All ({yourPosts.length + otherPosts.length})
            </button>
            <button
              type="button"
              onClick={() => setBrowseTab('your')}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: 'none',
                background: browseTab === 'your' ? 'var(--bg-surface)' : 'transparent',
                color: browseTab === 'your' ? 'var(--badge-green-text)' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              ⭐ Your Communities ({yourPosts.length})
            </button>
            <button
              type="button"
              onClick={() => setBrowseTab('other')}
              style={{
                padding: '5px 12px',
                borderRadius: '6px',
                border: 'none',
                background: browseTab === 'other' ? 'var(--bg-surface)' : 'transparent',
                color: browseTab === 'other' ? 'var(--badge-blue-text)' : 'var(--text-muted)',
                fontWeight: 700,
                fontSize: '0.78rem',
                cursor: 'pointer',
              }}
            >
              🔭 Other Communities ({otherPosts.length})
            </button>
          </div>
        </div>

        {/* Posts Grid */}
        {displayedStreamPosts.length === 0 ? (
          <div
            style={{
              padding: '3rem 1.5rem',
              textAlign: 'center',
              background: 'var(--bg-surface)',
              borderRadius: '14px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '8px' }}>📡</div>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.1rem', color: 'var(--text-primary)' }}>
              {browseTab === 'your'
                ? "No Transmissions from Your Communities"
                : "No Transmissions in this Stream"}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {browseTab === 'your'
                ? "Join circles in the Communities Hub to populate your personal frequency feed."
                : "Try switching to 'All' or rolling again."}
            </p>
            {browseTab === 'your' && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => navigate('#/communities')}
                style={{ padding: '8px 16px', borderRadius: '8px', fontSize: '0.84rem' }}
              >
                Browse Communities Hub →
              </button>
            )}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '1rem',
            }}
          >
            {displayedStreamPosts.map((p) => {
              const hasImg = p.images && p.images.length > 0;
              const isSelected = spot && spot._id === p._id;

              return (
                <div
                  key={p._id}
                  onClick={() => handleSelectFromStream(p)}
                  className="tw-card"
                  style={{
                    cursor: 'pointer',
                    background: 'var(--bg-surface)',
                    border: isSelected
                      ? '2px solid var(--accent-primary, #FF6F00)'
                      : '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    transition: 'all 140ms ease',
                    boxShadow: 'var(--shadow-xs)',
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '16/10',
                      background: 'var(--bg-elevated)',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {hasImg ? (
                      <img
                        src={p.images[0].url}
                        alt={p.title}
                        loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.75rem',
                        }}
                      >
                        👁️
                      </div>
                    )}

                    <div style={{ position: 'absolute', top: '6px', left: '6px', zIndex: 2 }}>
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'var(--badge-gold-bg)',
                          color: 'var(--badge-gold-text)',
                          border: '1px solid var(--badge-gold-border)',
                          fontWeight: 800,
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {(p.tier || 'city').toUpperCase()}
                      </span>
                    </div>

                    <div style={{ position: 'absolute', top: '6px', right: '6px', zIndex: 2 }}>
                      <span
                        style={{
                          fontSize: '9px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: p.isYourCommunity
                            ? 'var(--badge-green-bg)'
                            : 'var(--badge-blue-bg)',
                          color: p.isYourCommunity
                            ? 'var(--badge-green-text)'
                            : 'var(--badge-blue-text)',
                          fontWeight: 700,
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        {p.isYourCommunity ? '⭐ YOURS' : '🔭 OTHER'}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div
                    style={{
                      padding: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      flexGrow: 1,
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      {/* Community line */}
                      {p.community && (
                        <div
                          style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            fontFamily: 'var(--font-mono, monospace)',
                            color: 'var(--text-muted)',
                            marginBottom: '2px',
                          }}
                        >
                          c/{p.community.slug}
                        </div>
                      )}
                      <h4
                        style={{
                          margin: 0,
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          lineHeight: 1.3,
                        }}
                      >
                        {p.title}
                      </h4>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        paddingTop: '6px',
                        borderTop: '1px solid var(--border-subtle)',
                      }}
                    >
                      <span>📍 {p.place?.city || 'Sector'}</span>
                      <span
                        style={{
                          fontWeight: 700,
                          color: 'var(--accent-primary, #FF6F00)',
                          fontFamily: 'var(--font-mono, monospace)',
                        }}
                      >
                        ⚡ {p.meter?.score ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
