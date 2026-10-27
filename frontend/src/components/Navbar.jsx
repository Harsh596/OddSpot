import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { NotificationsDrawer } from './notifications/NotificationsDrawer';

const POPULAR_CITIES = [
  { name: 'Bengaluru', country: 'India', flag: '🇮🇳' },
  { name: 'London', country: 'United Kingdom', flag: '🇬🇧' },
  { name: 'Tokyo', country: 'Japan', flag: '🇯🇵' },
  { name: 'Reykjavík', country: 'Iceland', flag: '🇮🇸' },
  { name: 'New York', country: 'USA', flag: '🇺🇸' },
];

/**
 * Navbar - Tailwind-docs-style top navigation bar with:
 * - 60px height, hairline grid border, glass backdrop
 * - Solar/radar emblem + Oddspot wordmark + v1.0 kicker pill
 * - Architectural nav tabs with active 2px bottom indicator
 * - Cmd+K Spotlight Command Modal with live search & keyboard navigation
 * - Accessibility focus traps and mobile scroll locking
 */
export function Navbar({ currentRoute = '#/home', navigate }) {
  const { user, logout } = useAuth();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Spotlight Command Bar State
  const [commandModalOpen, setCommandModalOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [liveCommunities, setLiveCommunities] = useState([]);
  const [livePosts, setLivePosts] = useState([]);
  const [_isSearching, setIsSearching] = useState(false);

  const profileRef = useRef(null);
  const profileTriggerRef = useRef(null);
  const profileMenuRef = useRef(null);
  const searchTriggerRef = useRef(null);
  const spotlightModalRef = useRef(null);
  const spotlightInputRef = useRef(null);

  // Poll notifications unread count when user is logged in
  useEffect(() => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    let isMounted = true;
    const pollUnread = async () => {
      try {
        const res = await api.getNotifications({ limit: 1 });
        if (isMounted && res.unreadCount !== undefined) {
          setUnreadCount(res.unreadCount);
        }
      } catch {
        // Silently handle
      }
    };
    pollUnread();
    const interval = setInterval(pollUnread, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [user]);

  // Prevent background scrolling when mobile menu or Command Modal is open
  useEffect(() => {
    if (mobileMenuOpen || commandModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileMenuOpen, commandModalOpen]);

  // Global Cmd+K / Ctrl+K and '/' shortcut to open Spotlight Modal
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandModalOpen((prev) => !prev);
        return;
      }

      if (e.key === '/' && !commandModalOpen) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isEditable = document.activeElement?.isContentEditable;
        if (activeTag !== 'input' && activeTag !== 'textarea' && activeTag !== 'select' && !isEditable) {
          e.preventDefault();
          setCommandModalOpen(true);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [commandModalOpen]);

  // Focus input when spotlight opens & reset query
  useEffect(() => {
    if (commandModalOpen) {
      setSelectedIndex(0);
      setTimeout(() => {
        spotlightInputRef.current?.focus();
      }, 30);
    } else {
      setCommandQuery('');
      setLiveCommunities([]);
      setLivePosts([]);
    }
  }, [commandModalOpen]);

  // Keyboard focus trap inside Command Modal
  useEffect(() => {
    if (!commandModalOpen) return;
    const modalEl = spotlightModalRef.current;
    if (!modalEl) return;

    const handleModalTrap = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setCommandModalOpen(false);
        searchTriggerRef.current?.focus();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = Array.from(modalEl.querySelectorAll('input, button:not([disabled]), [tabindex="0"]'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !modalEl.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !modalEl.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleModalTrap, true);
    return () => window.removeEventListener('keydown', handleModalTrap, true);
  }, [commandModalOpen]);


  // Keyboard focus trap inside Scout Profile menu
  useEffect(() => {
    if (!profileDropdownOpen) return;
    const menuEl = profileMenuRef.current;
    if (!menuEl) return;

    const focusable = menuEl.querySelectorAll('button:not([disabled]), [tabindex="0"], a[href]');
    if (focusable.length > 0) {
      focusable[0]?.focus();
    }

    const handleTrap = (e) => {
      if (e.key === 'Tab') {
        const items = Array.from(menuEl.querySelectorAll('button:not([disabled]), [tabindex="0"], a[href]'));
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || !menuEl.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last || !menuEl.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
          }
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setProfileDropdownOpen(false);
        profileTriggerRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleTrap, true);
    return () => window.removeEventListener('keydown', handleTrap, true);
  }, [profileDropdownOpen]);

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
    setCommandModalOpen(false);
  }, [currentRoute]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleNav = useCallback((targetRoute) => {
    navigate(targetRoute);
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
    setCommandModalOpen(false);
  }, [navigate]);

  const isStaff = user && (user.role === 'admin' || user.role === 'moderator');

  // Debounced search for Spotlight query
  useEffect(() => {
    const query = commandQuery.trim();
    if (!query) {
      setLiveCommunities([]);
      setLivePosts([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const [commRes, postRes] = await Promise.allSettled([
          api.getNearbyCommunities({ q: query }),
          api.getPosts({ q: query, limit: 4 }),
        ]);

        if (commRes.status === 'fulfilled' && commRes.value) {
          const list = commRes.value.communities || (Array.isArray(commRes.value) ? commRes.value : []);
          setLiveCommunities(list.slice(0, 4));
        } else {
          setLiveCommunities([]);
        }

        if (postRes.status === 'fulfilled' && postRes.value) {
          const list = postRes.value.posts || (Array.isArray(postRes.value) ? postRes.value : []);
          setLivePosts(list.slice(0, 4));
        } else {
          setLivePosts([]);
        }
      } catch {
        // Silently fail
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [commandQuery]);

  // Build flattened navigable items for keyboard navigation (ArrowUp/ArrowDown + Enter)
  const spotlightItems = useMemo(() => {
    const items = [];
    const q = commandQuery.trim().toLowerCase();

    // 1. Route Navigation Actions
    const actions = [
      { id: 'act-dispatch', label: 'Go to Dispatch Feed', category: 'Navigation', icon: '🏠', shortcut: 'G D', action: () => handleNav('#/home') },
      { id: 'act-radar', label: 'Go to Radar Map', category: 'Navigation', icon: '🧭', shortcut: 'G R', action: () => handleNav('#/explore') },
      { id: 'act-create', label: 'Post a New Find', category: 'Actions', icon: '✨', shortcut: 'N P', action: () => handleNav('#/create') },
      { id: 'act-surprise', label: 'Roll Random Spot', category: 'Actions', icon: '🎲', shortcut: 'R', action: () => handleNav('#/random') },
      { id: 'act-chapters', label: 'Browse Chapter Communities', category: 'Navigation', icon: '🌐', shortcut: 'G C', action: () => handleNav('#/communities') },
      { id: 'act-guide', label: 'Open Field Manual', category: 'Help', icon: '📖', shortcut: 'G M', action: () => handleNav('#/guide') },
    ];

    if (user) {
      actions.push({ id: 'act-profile', label: 'My Scout Dossier & Visits', category: 'Profile', icon: '🎖️', shortcut: 'G P', action: () => handleNav('#/profile') });
      actions.push({ id: 'act-settings', label: 'Discovery Settings & Theme', category: 'Profile', icon: '⚙️', shortcut: 'G S', action: () => handleNav('#/settings') });
    }

    if (isStaff) {
      actions.push({ id: 'act-admin', label: 'Open Admin Console', category: 'Admin', icon: '🛡️', shortcut: 'G A', action: () => handleNav('#/admin') });
    }

    const filteredActions = q
      ? actions.filter((a) => a.label.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
      : actions;

    filteredActions.forEach((a) => items.push({ ...a, group: 'Actions & Shortcuts' }));

    // 2. Popular Cities
    const matchingCities = q
      ? POPULAR_CITIES.filter((c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
      : POPULAR_CITIES;

    matchingCities.forEach((city) => {
      items.push({
        id: `city-${city.name}`,
        label: `${city.flag} ${city.name}, ${city.country}`,
        category: 'Explore City',
        icon: '📍',
        action: () => handleNav(`#/explore?q=${encodeURIComponent(city.name)}`),
        group: 'Cities & Regions',
      });
    });

    // 3. Live Communities
    if (liveCommunities.length > 0) {
      liveCommunities.forEach((comm) => {
        items.push({
          id: `comm-${comm.slug || comm.id}`,
          label: comm.name,
          subtitle: comm.city ? `${comm.city}, ${comm.country || ''}` : comm.description,
          category: 'Chapter',
          icon: '🌐',
          action: () => handleNav(`#/c/${comm.slug || comm.id}`),
          group: 'Chapters',
        });
      });
    }

    // 4. Live Spots
    if (livePosts.length > 0) {
      livePosts.forEach((post) => {
        items.push({
          id: `post-${post.id}`,
          label: post.title,
          subtitle: post.locationName || post.city,
          category: 'Spot',
          icon: '📍',
          action: () => handleNav(`#/post/${post.id}`),
          group: 'Oddities',
        });
      });
    }

    return items;
  }, [commandQuery, handleNav, user, isStaff, liveCommunities, livePosts]);

  // Handle keyboard navigation inside Spotlight Modal
  const handleSpotlightKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (spotlightItems.length ? (prev + 1) % spotlightItems.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (spotlightItems.length ? (prev - 1 + spotlightItems.length) % spotlightItems.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (spotlightItems[selectedIndex]) {
        spotlightItems[selectedIndex].action();
      }
    }
  };

  const isHomeActive = currentRoute === '#/home' || currentRoute === '#/' || !currentRoute;
  const isExploreActive = currentRoute.startsWith('#/explore') || currentRoute.startsWith('#/feed');
  const isCommunitiesActive = currentRoute.startsWith('#/communities') || currentRoute.startsWith('#/c/');
  const isRandomActive = currentRoute.startsWith('#/random');
  const isGuideActive = currentRoute.startsWith('#/guide');
  const isProfileActive = currentRoute.startsWith('#/profile') || currentRoute.startsWith('#/user/');
  const isSettingsActive = currentRoute.startsWith('#/settings');
  const isAdminActive = currentRoute.startsWith('#/admin');
  const isLoginActive = currentRoute === '#/login';
  const isSignupActive = currentRoute === '#/signup';

  return (
    <header className="navbar-header" style={{ position: 'sticky', top: 0, zIndex: 'var(--z-sticky, 100)' }}>
      {/* Accessibility: Skip directly to main content */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      <nav
        className="navbar"
        role="navigation"
        aria-label="Main Navigation"
      >
        {/* Left Cluster: Brand Emblem, Wordmark, and v1.0 Pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', height: '100%' }}>
          <div
            className="nav-brand"
            onClick={() => handleNav('#/home')}
            tabIndex={0}
            role="button"
            aria-label="Oddspot Home"
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNav('#/home')}
          >
            {/* Eye Logo & Brand */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                fontSize: '1.25rem',
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              👁
            </span>

            {/* Wordmark */}
            <span
              style={{
                fontFamily: 'var(--font-sans, "Plus Jakarta Sans", sans-serif)',
                fontWeight: 800,
                fontSize: '1.2rem',
                letterSpacing: '-0.025em',
                color: 'var(--text-primary, #18181B)',
              }}
            >
              OddSpot
            </span>

            {/* Scout Log Monospace Pill */}
            <span
              className="tw-kicker desktop-only"
              style={{
                fontSize: '10px',
                padding: '2px 7px',
                borderRadius: '4px',
                background: 'var(--badge-gold-bg, #FEF3C7)',
                color: 'var(--badge-gold-text, #92400E)',
                border: '1px solid var(--badge-gold-border, #FCD34D)',
                fontFamily: 'var(--font-mono, monospace)',
                fontWeight: 800,
                letterSpacing: '0.06em',
              }}
            >
              SCOUT LOG
            </span>
          </div>

          {/* Center-Left Architectural Nav Tabs */}
          <div className="nav-links desktop-only" role="menubar">
            <button
              type="button"
              role="menuitem"
              className={`nav-btn ${isHomeActive ? 'active' : ''}`}
              onClick={() => handleNav('#/home')}
              aria-current={isHomeActive ? 'page' : undefined}
            >
              Dispatch
            </button>

            <button
              type="button"
              role="menuitem"
              className={`nav-btn ${isExploreActive ? 'active' : ''}`}
              onClick={() => handleNav('#/explore')}
              aria-current={isExploreActive ? 'page' : undefined}
            >
              Radar Map
            </button>

            <button
              type="button"
              role="menuitem"
              className={`nav-btn ${isRandomActive ? 'active' : ''}`}
              onClick={() => handleNav('#/random')}
              aria-current={isRandomActive ? 'page' : undefined}
            >
              Random
            </button>

            <button
              type="button"
              role="menuitem"
              className={`nav-btn ${isCommunitiesActive ? 'active' : ''}`}
              onClick={() => handleNav('#/communities')}
              aria-current={isCommunitiesActive ? 'page' : undefined}
            >
              Chapters
            </button>

            <button
              type="button"
              role="menuitem"
              className={`nav-btn ${isGuideActive ? 'active' : ''}`}
              onClick={() => handleNav('#/guide')}
              aria-current={isGuideActive ? 'page' : undefined}
            >
              Field Manual
            </button>

            <button
              type="button"
              role="menuitem"
              className={`nav-btn ${isProfileActive ? 'active' : ''}`}
              onClick={() => handleNav(user ? '#/profile' : '#/login')}
              aria-current={isProfileActive ? 'page' : undefined}
            >
              Profile
            </button>
          </div>
        </div>

        {/* Center-Right Cluster: Quick Search Button & Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          {/* Tailwind-docs-style Quick Search Button */}
          <button
            ref={searchTriggerRef}
            type="button"
            className="nav-search-trigger"
            onClick={() => setCommandModalOpen(true)}
            aria-label="Search oddities, cities, chapters (Command K)"
            title="Search oddities, cities, chapters (⌘K)"
          >
            <span style={{ fontSize: '0.85rem' }} aria-hidden="true">🔍</span>
            <span className="desktop-only" style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Search oddities, cities...
            </span>
            <kbd className="tw-kbd" style={{ fontSize: '10px', padding: '1px 5px', marginLeft: '2px' }}>
              ⌘K
            </kbd>
          </button>
          {/* Auth State Cluster */}
          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {/* Notification Bell Button */}
              <button
                type="button"
                className="nav-bell-btn"
                onClick={() => setNotificationsOpen(true)}
                title="Field Transmissions (Notifications)"
                aria-label={`Notifications, ${unreadCount} unread`}
                style={{
                  position: 'relative',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: notificationsOpen ? 'var(--bg-elevated, #FFF7ED)' : 'transparent',
                  color: 'var(--text-primary, #18181B)',
                  border: '1px solid var(--border-subtle, #ECE7DF)',
                  borderRadius: '8px',
                  width: '34px',
                  height: '34px',
                  fontSize: '0.95rem',
                  transition: 'all var(--transition-fast, 150ms ease)',
                }}
              >
                <span>🔔</span>
                {unreadCount > 0 && (
                  <span
                    className="nav-unread-badge"
                    aria-label={`${unreadCount} unread field transmissions`}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Profile Dropdown Cluster */}
              <div ref={profileRef} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                {/* Clicking user logo or username directly opens profile */}
                <button
                  type="button"
                  className="nav-profile-btn"
                  onClick={() => handleNav('#/profile')}
                  aria-label={`Open ${user.username}'s scout profile`}
                  title={`Open ${user.username}'s scout profile`}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: isProfileActive ? 'var(--bg-elevated, #FFF7ED)' : 'transparent',
                    color: 'var(--text-primary, #18181B)',
                    border: '1px solid var(--border-subtle, #ECE7DF)',
                    borderRight: 'none',
                    borderRadius: '8px 0 0 8px',
                    padding: '0 0.5rem 0 0.65rem',
                    height: '36px',
                    fontSize: '0.8125rem',
                    transition: 'all var(--transition-fast, 150ms ease)',
                  }}
                >
                  <div style={{ textAlign: 'right', lineHeight: 1.15 }} className="desktop-only">
                    <div style={{ fontWeight: 800, fontSize: '0.8125rem', color: 'var(--text-primary)' }}>
                      {user.username}
                    </div>
                    <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                      {user.role === 'admin' ? 'ADMIN' : user.role === 'moderator' ? 'MOD' : 'SCOUT'}
                    </div>
                  </div>
                  {/* User Avatar Logo */}
                  <div
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'var(--accent-primary, #B83818)',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: '11px',
                      boxShadow: isProfileActive ? '0 0 0 2px var(--accent-primary)' : 'none',
                    }}
                  >
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        alt={user.username}
                        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                      />
                    ) : (
                      user.username ? user.username.charAt(0).toUpperCase() : 'S'
                    )}
                  </div>
                </button>

                {/* Dropdown Menu Caret Trigger */}
                <button
                  ref={profileTriggerRef}
                  type="button"
                  onClick={() => setProfileDropdownOpen((prev) => !prev)}
                  aria-expanded={profileDropdownOpen}
                  aria-haspopup="menu"
                  aria-label="Toggle scout account menu"
                  title="Account menu & options"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: profileDropdownOpen ? 'var(--bg-elevated, #FFF7ED)' : 'transparent',
                    color: 'var(--text-primary, #18181B)',
                    border: '1px solid var(--border-subtle, #ECE7DF)',
                    borderRadius: '0 8px 8px 0',
                    width: '22px',
                    height: '36px',
                    fontSize: '10px',
                    padding: 0,
                    transition: 'all var(--transition-fast, 150ms ease)',
                  }}
                >
                  <span
                    style={{
                      transform: profileDropdownOpen ? 'rotate(180deg)' : 'none',
                      transition: 'transform 150ms ease',
                      display: 'inline-block',
                      opacity: 0.7,
                    }}
                  >
                    ▾
                  </span>
                </button>

                {/* Profile Dropdown Menu */}
                {profileDropdownOpen && (
                  <div
                    ref={profileMenuRef}
                    role="menu"
                    aria-label="Scout Profile Menu"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      width: '240px',
                      background: 'var(--bg-surface, #FFFFFF)',
                      border: '1px solid var(--border-subtle, #ECE7DF)',
                      borderRadius: 'var(--radius-card, 14px)',
                      boxShadow: 'var(--shadow-md, 0 8px 24px -4px rgba(24, 24, 27, 0.12))',
                      padding: '0.65rem',
                      zIndex: 'var(--z-dropdown, 200)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {/* User Header - Clickable to open profile */}
                    <div
                      onClick={() => handleNav('#/profile')}
                      role="button"
                      tabIndex={0}
                      title="Open your Scout Dossier"
                      style={{
                        padding: '0.5rem 0.65rem 0.75rem',
                        borderBottom: '1px solid var(--border-subtle, #ECE7DF)',
                        marginBottom: '4px',
                        cursor: 'pointer',
                        borderRadius: '6px',
                        transition: 'background 120ms ease',
                      }}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNav('#/profile')}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div
                          style={{
                            width: '28px',
                            height: '28px',
                            borderRadius: '50%',
                            background: 'var(--accent-primary, #B83818)',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: '11px',
                          }}
                        >
                          {user.avatarUrl ? (
                            <img
                              src={user.avatarUrl}
                              alt={user.username}
                              style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                            />
                          ) : (
                            user.username ? user.username.charAt(0).toUpperCase() : 'S'
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
                            {user.username}
                          </div>
                          <div style={{ display: 'flex', gap: '6px', marginTop: '2px', alignItems: 'center' }}>
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '1px 6px',
                                borderRadius: '4px',
                                background: 'var(--badge-gold-bg, #FEF3C7)',
                                color: 'var(--badge-gold-text, #92400E)',
                                border: '1px solid var(--badge-gold-border, #FCD34D)',
                                textTransform: 'uppercase',
                              }}
                            >
                              {user.role || 'Scout'}
                            </span>
                            {user.score !== undefined && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                · {user.score} pts
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleNav('#/profile')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <span>🧭</span>
                      <span>My Scout Dossier & Visits</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleNav('#/settings')}
                      aria-current={isSettingsActive ? 'page' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <span>⚙️</span>
                      <span>Discovery Settings & Theme</span>
                    </button>

                    {isStaff && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => handleNav('#/admin')}
                        aria-current={isAdminActive ? 'page' : undefined}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.5rem 0.65rem',
                          borderRadius: '6px',
                          border: 'none',
                          background: 'var(--bg-elevated, #FFF7ED)',
                          color: 'var(--accent-primary, #FF6F00)',
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          textAlign: 'left',
                          width: '100%',
                        }}
                      >
                        <span>🛡️</span>
                        <span>{user.role === 'admin' ? 'Admin Dashboard' : 'Moderation Queue'}</span>
                      </button>
                    )}

                    <div style={{ height: '1px', background: 'var(--border-subtle, #ECE7DF)', margin: '4px 0' }} />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={logout}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '6px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--color-danger, #DC2626)',
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                      }}
                    >
                      <span>🚪</span>
                      <span>Log Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <button
                type="button"
                className={`btn-secondary ${isLoginActive ? 'active' : ''}`}
                onClick={() => handleNav('#/login')}
                style={{ padding: '0 0.85rem', height: '34px', fontSize: '0.8125rem' }}
              >
                Log In
              </button>
              <button
                type="button"
                className={`btn-primary ${isSignupActive ? 'active' : ''}`}
                onClick={() => handleNav('#/signup')}
                style={{ padding: '0 0.95rem', height: '34px', fontSize: '0.8125rem' }}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Mobile Menu Hamburger */}
          <button
            type="button"
            className="mobile-only nav-hamburger-btn"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            style={{
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle, #ECE7DF)',
              borderRadius: '8px',
              padding: '0',
              width: '34px',
              height: '34px',
              fontSize: '1rem',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          className="mobile-drawer"
          style={{
            background: 'var(--bg-surface, #FFFFFF)',
            borderBottom: '1px solid var(--border-subtle, #ECE7DF)',
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {/* Quick Search on mobile */}
          <button
            type="button"
            className="nav-search-trigger"
            onClick={() => {
              setMobileMenuOpen(false);
              setCommandModalOpen(true);
            }}
            style={{ width: '100%', justifyContent: 'space-between', marginBottom: '0.5rem' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🔍</span>
              <span>Search oddities, cities...</span>
            </span>
            <kbd className="tw-kbd">⌘K</kbd>
          </button>

          <button
            type="button"
            className={`nav-btn ${isHomeActive ? 'active' : ''}`}
            onClick={() => handleNav('#/home')}
            style={{ width: '100%', textAlign: 'left', height: '44px' }}
          >
            🏠 Dispatch Feed
          </button>

          <button
            type="button"
            className={`nav-btn ${isExploreActive ? 'active' : ''}`}
            onClick={() => handleNav('#/explore')}
            style={{ width: '100%', textAlign: 'left', height: '44px' }}
          >
            🧭 Radar Map
          </button>

          <button
            type="button"
            className={`nav-btn ${isRandomActive ? 'active' : ''}`}
            onClick={() => handleNav('#/random')}
            style={{ width: '100%', textAlign: 'left', height: '44px' }}
          >
            🎲 Surprise Oddity
          </button>

          <button
            type="button"
            className={`nav-btn ${isCommunitiesActive ? 'active' : ''}`}
            onClick={() => handleNav('#/communities')}
            style={{ width: '100%', textAlign: 'left', height: '44px' }}
          >
            🌐 Chapters
          </button>

          <button
            type="button"
            className={`nav-btn ${isGuideActive ? 'active' : ''}`}
            onClick={() => handleNav('#/guide')}
            style={{ width: '100%', textAlign: 'left', height: '44px' }}
          >
            📖 Field Manual
          </button>

          <button
            type="button"
            className={`nav-btn ${isProfileActive ? 'active' : ''}`}
            onClick={() => handleNav(user ? '#/profile' : '#/login')}
            style={{ width: '100%', textAlign: 'left', height: '44px' }}
          >
            🎖️ Scout Profile {user ? `(${user.username})` : ''}
          </button>

          {user && (
            <>
              <div style={{ height: '1px', background: 'var(--border-subtle, #ECE7DF)', margin: '4px 0' }} />
              <button
                type="button"
                className="nav-btn"
                onClick={() => handleNav('#/settings')}
                style={{ width: '100%', textAlign: 'left', height: '44px' }}
              >
                ⚙️ Settings & Theme
              </button>
              {isStaff && (
                <button
                  type="button"
                  className="nav-btn"
                  onClick={() => handleNav('#/admin')}
                  style={{ width: '100%', textAlign: 'left', height: '44px', color: 'var(--accent-primary)' }}
                >
                  🛡️ Admin Panel
                </button>
              )}
              <button
                type="button"
                className="nav-btn"
                onClick={logout}
                style={{ width: '100%', textAlign: 'left', height: '44px', color: 'var(--color-danger)' }}
              >
                🚪 Log Out
              </button>
            </>
          )}
        </div>
      )}

      {/* Spotlight Command Modal (Cmd+K / Ctrl+K / /) */}
      {commandModalOpen && (
        <div
          className="spotlight-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setCommandModalOpen(false);
              searchTriggerRef.current?.focus();
            }
          }}
          role="presentation"
        >
          <div
            ref={spotlightModalRef}
            className="spotlight-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Spotlight Quick Jump & Search"
          >
            {/* Spotlight Header Input */}
            <div className="spotlight-header">
              <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }} aria-hidden="true">
                🔍
              </span>
              <input
                ref={spotlightInputRef}
                type="text"
                className="spotlight-input"
                placeholder="Search oddities, cities (Bengaluru, London, Tokyo), chapters, or actions..."
                value={commandQuery}
                onChange={(e) => {
                  setCommandQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                onKeyDown={handleSpotlightKeyDown}
                aria-label="Command search input"
              />
              {commandQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setCommandQuery('');
                    spotlightInputRef.current?.focus();
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    padding: '2px 6px',
                  }}
                  aria-label="Clear query"
                >
                  ✕
                </button>
              )}
              <kbd className="tw-kbd" style={{ fontSize: '10px' }}>ESC</kbd>
            </div>

            {/* Spotlight Results Body */}
            <div className="spotlight-body" role="listbox">
              {spotlightItems.length === 0 ? (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No matching oddities, cities, or chapters found for &ldquo;{commandQuery}&rdquo;.
                </div>
              ) : (
                (() => {
                  let currentGroup = '';
                  return spotlightItems.map((item, index) => {
                    const isNewGroup = item.group !== currentGroup;
                    currentGroup = item.group;
                    const isSelected = index === selectedIndex;

                    return (
                      <div key={item.id}>
                        {isNewGroup && (
                          <div className="spotlight-group-title">
                            {item.group}
                          </div>
                        )}
                        <button
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`spotlight-item ${isSelected ? 'selected' : ''}`}
                          onClick={() => item.action()}
                          onMouseEnter={() => setSelectedIndex(index)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.icon}</span>
                            <div style={{ minWidth: 0, overflow: 'hidden' }}>
                              <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {item.label}
                              </div>
                              {item.subtitle && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {item.subtitle}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                            {item.category && (
                              <span
                                style={{
                                  fontSize: '0.6875rem',
                                  padding: '1px 6px',
                                  borderRadius: '4px',
                                  background: 'var(--badge-neutral-bg, #F4F1EA)',
                                  color: 'var(--badge-neutral-text, #18181B)',
                                  border: '1px solid var(--badge-neutral-border, #E4E4E7)',
                                }}
                              >
                                {item.category}
                              </span>
                            )}
                            {item.shortcut && (
                              <kbd className="tw-kbd" style={{ fontSize: '9px', padding: '1px 4px' }}>
                                {item.shortcut}
                              </kbd>
                            )}
                          </div>
                        </button>
                      </div>
                    );
                  });
                })()
              )}
            </div>

            {/* Spotlight Footer */}
            <div className="spotlight-footer">
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <span>
                  <kbd className="tw-kbd" style={{ fontSize: '9px' }}>↑</kbd>{' '}
                  <kbd className="tw-kbd" style={{ fontSize: '9px' }}>↓</kbd> Navigate
                </span>
                <span>
                  <kbd className="tw-kbd" style={{ fontSize: '9px' }}>↵</kbd> Select
                </span>
                <span>
                  <kbd className="tw-kbd" style={{ fontSize: '9px' }}>esc</kbd> Close
                </span>
              </div>
              <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>Oddspot Spotlight</span>
            </div>
          </div>
        </div>
      )}

      {/* Notifications Drawer */}
      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        navigate={navigate}
        onUnreadCountUpdate={(cnt) => setUnreadCount(cnt)}
      />
    </header>
  );
}
