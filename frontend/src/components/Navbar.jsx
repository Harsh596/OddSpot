import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NotificationsDrawer } from './notifications/NotificationsDrawer';

/**
 * Navbar - Bespoke top navigation bar with distinct orange brand badge,
 * tactile quick links, notification bell with unread counter, and profile dropdown.
 */
export function Navbar({ currentRoute = '#/home', navigate }) {
  const { user, logout } = useAuth();
  const { theme, setTheme, themes, currentThemeMeta } = useTheme();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const profileRef = useRef(null);
  const themeRef = useRef(null);

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

  // Close menus on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setThemeDropdownOpen(false);
    setProfileDropdownOpen(false);
  }, [currentRoute]);

  // Close on outside click or Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setThemeDropdownOpen(false);
        setProfileDropdownOpen(false);
      }
    };

    const handleClickOutside = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileDropdownOpen(false);
      }
      if (themeRef.current && !themeRef.current.contains(e.target)) {
        setThemeDropdownOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleNav = (targetRoute) => {
    navigate(targetRoute);
    setMobileMenuOpen(false);
    setProfileDropdownOpen(false);
    setThemeDropdownOpen(false);
  };

  const isHomeActive = currentRoute === '#/home' || currentRoute === '#/' || !currentRoute;
  const isExploreActive = currentRoute.startsWith('#/explore') || currentRoute.startsWith('#/feed');
  const isCommunitiesActive = currentRoute.startsWith('#/communities') || currentRoute.startsWith('#/c/');
  const isRandomActive = currentRoute.startsWith('#/random');
  const isCreateActive = currentRoute === '#/create';
  const isGuideActive = currentRoute.startsWith('#/guide');
  const isSettingsActive = currentRoute.startsWith('#/settings');
  const isAdminActive = currentRoute.startsWith('#/admin');
  const isLoginActive = currentRoute === '#/login';
  const isSignupActive = currentRoute === '#/signup';

  const isStaff = user && (user.role === 'admin' || user.role === 'moderator');

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
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.75rem',
          background: 'var(--bg-glass, rgba(255, 253, 249, 0.94))',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid var(--border-color, #E6DFD5)',
          boxShadow: 'var(--shadow-sm, 0 2px 8px -1px rgba(255, 111, 0, 0.06))',
        }}
      >
        {/* Left Cluster: Brand Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div
            className="nav-brand"
            onClick={() => handleNav('#/home')}
            tabIndex={0}
            role="button"
            aria-label="Oddspot Home"
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNav('#/home')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              textDecoration: 'none',
              userSelect: 'none',
            }}
          >
            {/* Distinct Orange Brand Badge */}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                background: 'linear-gradient(135deg, #FF6F00 0%, #FF8F00 100%)',
                color: '#FFFFFF',
                padding: '0.35rem 0.85rem',
                borderRadius: 'var(--radius-full, 9999px)',
                boxShadow: '0 3px 12px rgba(255, 111, 0, 0.35)',
                fontWeight: 800,
                fontSize: '1.05rem',
                letterSpacing: '-0.3px',
              }}
            >
              <span style={{ fontSize: '1.15rem', lineHeight: 1 }}>👁️</span>
              <span>Oddspot</span>
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-secondary, #6E675F)',
                background: 'var(--bg-elevated, #FFF3E0)',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-color, #E6DFD5)',
              }}
              className="desktop-only"
            >
              Field Log
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <div
            className="nav-links desktop-only"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <button
              type="button"
              className={`nav-btn ${isHomeActive ? 'active' : ''}`}
              onClick={() => handleNav('#/home')}
              aria-current={isHomeActive ? 'page' : undefined}
            >
              🏠 Dispatch
            </button>

            <button
              type="button"
              className={`nav-btn ${isExploreActive ? 'active' : ''}`}
              onClick={() => handleNav('#/explore')}
              aria-current={isExploreActive ? 'page' : undefined}
            >
              🧭 Radar
            </button>

            <button
              type="button"
              className={`nav-btn ${isRandomActive ? 'active' : ''}`}
              onClick={() => handleNav('#/random')}
              aria-current={isRandomActive ? 'page' : undefined}
            >
              🎲 Random
            </button>

            <button
              type="button"
              className={`nav-btn ${isCommunitiesActive ? 'active' : ''}`}
              onClick={() => handleNav('#/communities')}
              aria-current={isCommunitiesActive ? 'page' : undefined}
            >
              🌐 Chapters
            </button>

            <button
              type="button"
              className={`nav-btn ${isGuideActive ? 'active' : ''}`}
              onClick={() => handleNav('#/guide')}
              aria-current={isGuideActive ? 'page' : undefined}
            >
              📖 Field Manual
            </button>
          </div>
        </div>

        {/* Right Cluster: Action Buttons & User Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          {/* Post a Find Action Button */}
          <button
            type="button"
            className="btn-primary desktop-only"
            onClick={() => handleNav('#/create')}
            aria-current={isCreateActive ? 'page' : undefined}
            style={{
              padding: '0.45rem 1rem',
              fontSize: '0.85rem',
              fontWeight: 700,
            }}
          >
            <span>+</span> Post a Find
          </button>

          {/* Theme Preset Selector */}
          <div ref={themeRef} style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setThemeDropdownOpen((prev) => !prev)}
              aria-label="Change theme palette"
              aria-expanded={themeDropdownOpen}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: 'var(--bg-elevated, #FFF3E0)',
                color: 'var(--text-primary, #1A1814)',
                border: '1px solid var(--border-color, #E6DFD5)',
                padding: '0.45rem 0.75rem',
                borderRadius: 'var(--radius-full, 9999px)',
                fontSize: '0.8rem',
                fontWeight: 600,
                transition: 'all var(--transition-fast)',
              }}
            >
              <span>{currentThemeMeta?.icon || '☀️'}</span>
              <span className="desktop-only">{currentThemeMeta?.name || 'Theme'}</span>
              <span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
            </button>

            {themeDropdownOpen && (
              <div
                role="menu"
                aria-label="Select Theme Palette"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  right: 0,
                  width: '230px',
                  background: 'var(--bg-surface, #FFFFFF)',
                  border: '1px solid var(--border-color, #E6DFD5)',
                  borderRadius: 'var(--radius-card, 16px)',
                  boxShadow: 'var(--shadow-md, 0 6px 20px -2px rgba(255, 111, 0, 0.12))',
                  padding: '0.5rem',
                  zIndex: 'var(--z-dropdown, 200)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    padding: '6px 8px',
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    color: 'var(--text-secondary, #6E675F)',
                    letterSpacing: '0.5px',
                  }}
                >
                  Indie Color Palettes
                </div>
                {themes.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setTheme(t.id);
                      setThemeDropdownOpen(false);
                    }}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      padding: '0.5rem 0.65rem',
                      borderRadius: '8px',
                      background: theme === t.id ? 'var(--accent-highlight, #FFF8E1)' : 'transparent',
                      color: theme === t.id ? 'var(--accent-primary, #FF6F00)' : 'var(--text-primary, #1A1814)',
                      border: theme === t.id ? '1px solid var(--accent-border, #FFCC80)' : '1px solid transparent',
                      textAlign: 'left',
                      fontSize: '0.8rem',
                      fontWeight: theme === t.id ? 700 : 500,
                      width: '100%',
                    }}
                  >
                    <span>{t.icon}</span>
                    <div style={{ flexGrow: 1 }}>
                      <div>{t.name}</div>
                    </div>
                    {theme === t.id && <span style={{ fontSize: '11px', color: 'var(--accent-primary)' }}>✓</span>}
                  </button>
                ))}

                <div style={{ height: '1px', background: 'var(--border-color, #E6DFD5)', margin: '4px 0' }} />

                <button
                  type="button"
                  onClick={() => handleNav('#/settings')}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--bg-elevated, #FFF3E0)',
                    color: 'var(--accent-primary, #FF6F00)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    width: '100%',
                    justifyContent: 'center',
                  }}
                >
                  <span>🎨</span>
                  <span>Palette Customizer</span>
                </button>
              </div>
            )}
          </div>

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
                  background: notificationsOpen ? 'var(--accent-highlight, #FFF8E1)' : 'var(--bg-elevated, #FFF3E0)',
                  color: 'var(--text-primary, #1A1814)',
                  border: '1px solid var(--border-color, #E6DFD5)',
                  borderRadius: 'var(--radius-full, 9999px)',
                  width: '36px',
                  height: '36px',
                  fontSize: '1rem',
                  transition: 'all var(--transition-fast)',
                }}
              >
                <span>🔔</span>
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      background: '#FF6F00',
                      color: '#FFFFFF',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      padding: '2px 5px',
                      borderRadius: '9999px',
                      border: '2px solid var(--bg-surface, #FFFFFF)',
                      lineHeight: 1,
                      minWidth: '18px',
                      textAlign: 'center',
                      boxShadow: '0 2px 6px rgba(255, 111, 0, 0.4)',
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Profile Dropdown Trigger */}
              <div ref={profileRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="nav-profile-btn"
                  onClick={() => setProfileDropdownOpen((prev) => !prev)}
                  aria-expanded={profileDropdownOpen}
                  aria-label="Open scout account menu"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    background: profileDropdownOpen ? 'var(--accent-highlight, #FFF8E1)' : 'var(--bg-elevated, #FFF3E0)',
                    color: 'var(--text-primary, #1A1814)',
                    border: profileDropdownOpen ? '1px solid var(--accent-border, #FFCC80)' : '1px solid var(--border-color, #E6DFD5)',
                    borderRadius: 'var(--radius-full, 9999px)',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  <span
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: '#FF6F00',
                      color: '#FFFFFF',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                    }}
                  >
                    🧭
                  </span>
                  <span>{user.username}</span>
                  <span style={{ fontSize: '9px', opacity: 0.6 }}>▾</span>
                </button>

                {/* Profile Dropdown Menu */}
                {profileDropdownOpen && (
                  <div
                    role="menu"
                    aria-label="Scout Profile Menu"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      width: '240px',
                      background: 'var(--bg-surface, #FFFFFF)',
                      border: '1px solid var(--border-color, #E6DFD5)',
                      borderRadius: 'var(--radius-card, 16px)',
                      boxShadow: 'var(--shadow-md, 0 6px 20px -2px rgba(255, 111, 0, 0.12))',
                      padding: '0.65rem',
                      zIndex: 'var(--z-dropdown, 200)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    {/* User Header */}
                    <div
                      style={{
                        padding: '0.5rem 0.65rem 0.75rem',
                        borderBottom: '1px solid var(--border-color, #E6DFD5)',
                        marginBottom: '4px',
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {user.username}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#FFF3E0',
                            color: '#E65100',
                            border: '1px solid #FFE0B2',
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

                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => handleNav('#/profile')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.55rem 0.65rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
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
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.55rem 0.65rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '0.85rem',
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
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.55rem 0.65rem',
                          borderRadius: '8px',
                          border: 'none',
                          background: 'var(--bg-highlight, #FFF8E1)',
                          color: '#E65100',
                          fontSize: '0.85rem',
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

                    <div style={{ height: '1px', background: 'var(--border-color, #E6DFD5)', margin: '4px 0' }} />

                    <button
                      type="button"
                      role="menuitem"
                      onClick={logout}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        padding: '0.55rem 0.65rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'transparent',
                        color: 'var(--color-danger, #DC2626)',
                        fontSize: '0.85rem',
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
                style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}
              >
                Log In
              </button>
              <button
                type="button"
                className={`btn-primary ${isSignupActive ? 'active' : ''}`}
                onClick={() => handleNav('#/signup')}
                style={{ padding: '0.45rem 1rem', fontSize: '0.85rem' }}
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Mobile Menu Hamburger */}
          <button
            type="button"
            className="mobile-only"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={mobileMenuOpen}
            style={{
              cursor: 'pointer',
              background: 'var(--bg-elevated, #FFF3E0)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color, #E6DFD5)',
              borderRadius: '8px',
              padding: '6px 10px',
              fontSize: '1.1rem',
              display: 'none',
            }}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div
          className="mobile-drawer"
          style={{
            background: 'var(--bg-surface, #FFFFFF)',
            borderBottom: '1px solid var(--border-color, #E6DFD5)',
            padding: '1rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.65rem',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleNav('#/create')}
            style={{ width: '100%', marginBottom: '0.5rem' }}
          >
            + Post a Find
          </button>

          <button
            type="button"
            className={`nav-btn ${isHomeActive ? 'active' : ''}`}
            onClick={() => handleNav('#/home')}
            style={{ width: '100%', textAlign: 'left' }}
          >
            🏠 Dispatch Feed
          </button>

          <button
            type="button"
            className={`nav-btn ${isExploreActive ? 'active' : ''}`}
            onClick={() => handleNav('#/explore')}
            style={{ width: '100%', textAlign: 'left' }}
          >
            🧭 Explore Radar
          </button>

          <button
            type="button"
            className={`nav-btn ${isRandomActive ? 'active' : ''}`}
            onClick={() => handleNav('#/random')}
            style={{ width: '100%', textAlign: 'left' }}
          >
            🎲 Random Oddity
          </button>

          <button
            type="button"
            className={`nav-btn ${isCommunitiesActive ? 'active' : ''}`}
            onClick={() => handleNav('#/communities')}
            style={{ width: '100%', textAlign: 'left' }}
          >
            🌐 Communities Hub
          </button>

          <button
            type="button"
            className={`nav-btn ${isGuideActive ? 'active' : ''}`}
            onClick={() => handleNav('#/guide')}
            style={{ width: '100%', textAlign: 'left' }}
          >
            📖 Field Manual
          </button>

          {user && (
            <>
              <div style={{ height: '1px', background: 'var(--border-color, #E6DFD5)', margin: '4px 0' }} />
              <button
                type="button"
                className="nav-btn"
                onClick={() => handleNav('#/profile')}
                style={{ width: '100%', textAlign: 'left' }}
              >
                🧭 Scout Profile ({user.username})
              </button>
              <button
                type="button"
                className="nav-btn"
                onClick={() => handleNav('#/settings')}
                style={{ width: '100%', textAlign: 'left' }}
              >
                ⚙️ Settings & Theme
              </button>
              {isStaff && (
                <button
                  type="button"
                  className="nav-btn"
                  onClick={() => handleNav('#/admin')}
                  style={{ width: '100%', textAlign: 'left', color: '#E65100' }}
                >
                  🛡️ Admin Panel
                </button>
              )}
              <button
                type="button"
                className="nav-btn"
                onClick={logout}
                style={{ width: '100%', textAlign: 'left', color: 'var(--color-danger)' }}
              >
                🚪 Log Out
              </button>
            </>
          )}
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
