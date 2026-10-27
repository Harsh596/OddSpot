import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { NotificationsDrawer } from './notifications/NotificationsDrawer';

/**
 * Navbar - Accessible responsive navigation shell with desktop links,
 * mobile drawer/accordion, skip-to-content accessibility anchor,
 * active route indicators, scout authentication controls, and theme preset selector.
 */
export function Navbar({ currentRoute = '#/feed', navigate }) {
  const { user, logout } = useAuth();
  const { theme, setTheme, themes, currentThemeMeta } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setThemeDropdownOpen(false);
  }, [currentRoute]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        setThemeDropdownOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNav = (targetRoute) => {
    navigate(targetRoute);
    setMobileMenuOpen(false);
  };

  const isHomeActive = currentRoute === '#/home' || currentRoute === '#/' || !currentRoute;
  const isExploreActive =
    currentRoute.startsWith('#/explore') || currentRoute.startsWith('#/feed');
  const isCommunitiesActive =
    currentRoute.startsWith('#/communities') || currentRoute.startsWith('#/c/');
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
      {/* Accessibility: Skip directly to main content for screen readers and keyboard users */}
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
          padding: 'var(--space-3, 12px) var(--space-6, 24px)',
          background: 'var(--bg-glass, rgba(18, 23, 34, 0.85))',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border-subtle, #202738)',
          boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.25))',
          position: 'relative',
        }}
      >
        {/* Brand identity */}
        <div
          className="nav-brand"
          onClick={() => handleNav('#/home')}
          tabIndex={0}
          role="button"
          aria-label="Oddspot Home"
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleNav('#/home')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2, 8px)',
            cursor: 'pointer',
            fontWeight: 800,
            fontSize: 'var(--text-xl, 1.25rem)',
            color: 'var(--text-primary, #f0f4fc)',
            fontFamily: 'var(--font-heading, sans-serif)',
            letterSpacing: '-0.5px',
            userSelect: 'none',
          }}
        >
          <span
            className="brand-logo"
            style={{
              fontSize: '1.5rem',
              lineHeight: 1,
              filter: 'drop-shadow(var(--accent-glow, 0 0 10px rgba(0,240,255,0.4)))',
            }}
          >
            👁️
          </span>
          <span className="brand-title">
            Oddspot<span style={{ color: 'var(--accent, #00f0ff)' }}>.</span>
          </span>
        </div>

        {/* Desktop Navigation Links */}
        <div
          className="nav-links desktop-only"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2, 8px)',
          }}
        >
          <button
            type="button"
            className={`nav-btn ${isHomeActive ? 'active' : ''}`}
            onClick={() => handleNav('#/home')}
            aria-current={isHomeActive ? 'page' : undefined}
            style={{
              cursor: 'pointer',
              background: isHomeActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
              color: isHomeActive ? 'var(--accent, #00f0ff)' : 'var(--text-secondary, #94a3b8)',
              border: isHomeActive
                ? '1px solid var(--accent-border, rgba(0,240,255,0.35))'
                : '1px solid transparent',
              padding: 'var(--space-2, 8px) var(--space-3, 12px)',
              fontSize: 'var(--text-sm, 0.875rem)',
              fontWeight: 600,
              borderRadius: 'var(--radius-md, 8px)',
              transition: 'all var(--transition-fast, 150ms ease)',
            }}
          >
            🏠 Home
          </button>

          <button
            type="button"
            className={`nav-btn ${isExploreActive ? 'active' : ''}`}
            onClick={() => handleNav('#/explore')}
            aria-current={isExploreActive ? 'page' : undefined}
            style={{
              cursor: 'pointer',
              background: isExploreActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
              color: isExploreActive ? 'var(--accent, #00f0ff)' : 'var(--text-secondary, #94a3b8)',
              border: isExploreActive
                ? '1px solid var(--accent-border, rgba(0,240,255,0.35))'
                : '1px solid transparent',
              padding: 'var(--space-2, 8px) var(--space-3, 12px)',
              fontSize: 'var(--text-sm, 0.875rem)',
              fontWeight: 600,
              borderRadius: 'var(--radius-md, 8px)',
              transition: 'all var(--transition-fast, 150ms ease)',
            }}
          >
            🧭 Explore Radar
          </button>

          <button
            type="button"
            className={`nav-btn ${isRandomActive ? 'active' : ''}`}
            onClick={() => handleNav('#/random')}
            aria-current={isRandomActive ? 'page' : undefined}
            style={{
              cursor: 'pointer',
              background: isRandomActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
              color: isRandomActive ? 'var(--accent, #00f0ff)' : 'var(--text-secondary, #94a3b8)',
              border: isRandomActive
                ? '1px solid var(--accent-border, rgba(0,240,255,0.35))'
                : '1px solid transparent',
              padding: 'var(--space-2, 8px) var(--space-3, 12px)',
              fontSize: 'var(--text-sm, 0.875rem)',
              fontWeight: 600,
              borderRadius: 'var(--radius-md, 8px)',
              transition: 'all var(--transition-fast, 150ms ease)',
            }}
          >
            🎲 Random
          </button>

          <button
            type="button"
            className={`nav-btn ${isCreateActive ? 'active' : ''}`}
            onClick={() => handleNav('#/create')}
            aria-current={isCreateActive ? 'page' : undefined}
            style={{
              cursor: 'pointer',
              background: isCreateActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
              color: isCreateActive ? 'var(--accent, #00f0ff)' : 'var(--text-secondary, #94a3b8)',
              border: isCreateActive
                ? '1px solid var(--accent-border, rgba(0,240,255,0.35))'
                : '1px solid transparent',
              padding: 'var(--space-2, 8px) var(--space-3, 12px)',
              fontSize: 'var(--text-sm, 0.875rem)',
              fontWeight: 600,
              borderRadius: 'var(--radius-md, 8px)',
              transition: 'all var(--transition-fast, 150ms ease)',
            }}
          >
            + Post a Find
          </button>

          <button
            type="button"
            className={`nav-btn ${isCommunitiesActive ? 'active' : ''}`}
            onClick={() => handleNav('#/communities')}
            aria-current={isCommunitiesActive ? 'page' : undefined}
            style={{
              cursor: 'pointer',
              background: isCommunitiesActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
              color: isCommunitiesActive ? 'var(--accent, #00f0ff)' : 'var(--text-secondary, #94a3b8)',
              border: isCommunitiesActive
                ? '1px solid var(--accent-border, rgba(0,240,255,0.35))'
                : '1px solid transparent',
              padding: 'var(--space-2, 8px) var(--space-3, 12px)',
              fontSize: 'var(--text-sm, 0.875rem)',
              fontWeight: 600,
              borderRadius: 'var(--radius-md, 8px)',
              transition: 'all var(--transition-fast, 150ms ease)',
            }}
          >
            🌐 Communities
          </button>

          <button
            type="button"
            className={`nav-btn ${isGuideActive ? 'active' : ''}`}
            onClick={() => handleNav('#/guide')}
            aria-current={isGuideActive ? 'page' : undefined}
            style={{
              cursor: 'pointer',
              background: isGuideActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
              color: isGuideActive ? 'var(--accent, #00f0ff)' : 'var(--text-secondary, #94a3b8)',
              border: isGuideActive
                ? '1px solid var(--accent-border, rgba(0,240,255,0.35))'
                : '1px solid transparent',
              padding: 'var(--space-2, 8px) var(--space-3, 12px)',
              fontSize: 'var(--text-sm, 0.875rem)',
              fontWeight: 600,
              borderRadius: 'var(--radius-md, 8px)',
              transition: 'all var(--transition-fast, 150ms ease)',
            }}
          >
            📖 Guide
          </button>
        </div>

        {/* Right Action Cluster: Theme Preset Selector + Auth / User controls */}
        <div
          className="nav-actions desktop-only"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3, 12px)',
          }}
        >
          {/* Theme Preset Selector Dropdown */}
          <div className="theme-selector-container" style={{ position: 'relative' }}>
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={() => setThemeDropdownOpen((prev) => !prev)}
              aria-label="Change theme preset"
              aria-expanded={themeDropdownOpen}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2, 8px)',
                background: 'var(--bg-elevated, #1a2030)',
                color: 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                padding: 'var(--space-2, 8px) var(--space-3, 12px)',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--text-xs, 0.75rem)',
                fontWeight: 600,
              }}
            >
              <span>{currentThemeMeta?.icon || '⚡'}</span>
              <span className="theme-label-text">{currentThemeMeta?.name || 'Theme'}</span>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>▾</span>
            </button>

            {themeDropdownOpen && (
              <div
                role="menu"
                aria-label="Select Theme Preset"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  width: '210px',
                  background: 'var(--bg-surface, #121722)',
                  border: '1px solid var(--border-strong, #2f3b54)',
                  borderRadius: 'var(--radius-lg, 12px)',
                  boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.65))',
                  padding: 'var(--space-2, 8px)',
                  zIndex: 'var(--z-dropdown, 200)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                }}
              >
                <div
                  style={{
                    padding: '4px 8px',
                    fontSize: 'var(--text-2xs, 11px)',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: 'var(--text-muted, #64748b)',
                    letterSpacing: '0.5px',
                  }}
                >
                  Theme Presets
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
                      gap: 'var(--space-2, 8px)',
                      padding: 'var(--space-2, 8px)',
                      borderRadius: 'var(--radius-sm, 6px)',
                      background: theme === t.id ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
                      color: theme === t.id ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                      border: 'none',
                      textAlign: 'left',
                      fontSize: 'var(--text-xs, 0.75rem)',
                      fontWeight: theme === t.id ? 700 : 500,
                    }}
                  >
                    <span>{t.icon}</span>
                    <div style={{ flexGrow: 1 }}>
                      <div>{t.name}</div>
                    </div>
                    {theme === t.id && <span style={{ fontSize: '12px' }}>✓</span>}
                  </button>
                ))}

                <div style={{ height: '1px', background: 'var(--border-subtle, #202738)', margin: '4px 0' }} />

                <button
                  type="button"
                  onClick={() => {
                    setThemeDropdownOpen(false);
                    handleNav('#/settings');
                  }}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px',
                    borderRadius: 'var(--radius-md, 8px)',
                    border: '1px solid var(--border-accent, rgba(0,240,255,0.2))',
                    background: 'rgba(0, 240, 255, 0.08)',
                    color: 'var(--accent, #00f0ff)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontWeight: 700,
                  }}
                >
                  <span>🎨</span>
                  <span>Customizer & Rules</span>
                </button>
              </div>
            )}
          </div>

          {/* Auth State Cluster */}
          <div className="nav-auth">
            {user ? (
              <div
                className="user-section"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3, 12px)',
                }}
              >
                {/* Notification Bell Button */}
                <button
                  type="button"
                  className="nav-bell-btn"
                  onClick={() => setNotificationsOpen(true)}
                  title="Field Transmissions (Notifications)"
                  style={{
                    position: 'relative',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: notificationsOpen ? 'var(--accent-subtle, rgba(0,240,255,0.15))' : 'var(--bg-elevated, #1a2030)',
                    color: 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-subtle, #202738)',
                    borderRadius: 'var(--radius-md, 8px)',
                    padding: '6px 10px',
                    fontSize: '0.95rem',
                  }}
                  aria-label={`Notifications, ${unreadCount} unread`}
                >
                  <span>🔔</span>
                  {unreadCount > 0 && (
                    <span className="nav-unread-badge">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  className="nav-profile-btn"
                  onClick={() => handleNav('#/profile')}
                  title="View your Scout Profile, Verified Visits Map & Badges"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: 'var(--bg-elevated, #1a2030)',
                    color: 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-subtle, #202738)',
                    borderRadius: 'var(--radius-md, 8px)',
                    padding: '6px 10px',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontWeight: 600,
                  }}
                >
                  <span>🧭</span>
                  <span>{user.username}</span>
                </button>

                <button
                  type="button"
                  className={`nav-settings-btn ${isSettingsActive ? 'active' : ''}`}
                  onClick={() => handleNav('#/settings')}
                  title="Theme Customizer & Feed Discovery Rules"
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    background: isSettingsActive ? 'var(--accent-subtle, rgba(0,240,255,0.15))' : 'var(--bg-elevated, #1a2030)',
                    color: isSettingsActive ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                    border: isSettingsActive ? '1px solid var(--accent, #00f0ff)' : '1px solid var(--border-subtle, #202738)',
                    borderRadius: 'var(--radius-md, 8px)',
                    padding: '6px 10px',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontWeight: 600,
                  }}
                >
                  <span>⚙️</span>
                  <span>Settings</span>
                </button>

                {isStaff && (
                  <button
                    type="button"
                    className={`nav-admin-btn ${isAdminActive ? 'active' : ''}`}
                    onClick={() => handleNav('#/admin')}
                    title={user.role === 'admin' ? 'Admin Command Center' : 'Moderator Queue'}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: isAdminActive ? 'var(--accent-subtle, rgba(0,240,255,0.18))' : 'rgba(239, 68, 68, 0.12)',
                      color: isAdminActive ? 'var(--accent, #00f0ff)' : '#f87171',
                      border: isAdminActive ? '1px solid var(--accent, #00f0ff)' : '1px solid rgba(239, 68, 68, 0.35)',
                      borderRadius: 'var(--radius-md, 8px)',
                      padding: '6px 10px',
                      fontSize: 'var(--text-xs, 0.75rem)',
                      fontWeight: 700,
                    }}
                  >
                    <span>🛡️</span>
                    <span>{user.role === 'admin' ? 'Admin' : 'Mod Queue'}</span>
                  </button>
                )}

                <button
                  type="button"
                  className="btn-secondary"
                  onClick={logout}
                  style={{
                    cursor: 'pointer',
                    padding: 'var(--space-2, 8px) var(--space-3, 12px)',
                    background: 'var(--bg-elevated, #1a2030)',
                    color: 'var(--text-secondary, #94a3b8)',
                    border: '1px solid var(--border-subtle, #202738)',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontWeight: 600,
                  }}
                >
                  Log Out
                </button>
              </div>
            ) : (
              <div
                className="auth-buttons"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2, 8px)',
                }}
              >
                <button
                  type="button"
                  className={`btn-secondary ${isLoginActive ? 'active' : ''}`}
                  onClick={() => handleNav('#/login')}
                  style={{
                    cursor: 'pointer',
                    padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                    background: 'var(--bg-elevated, #1a2030)',
                    color: 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-subtle, #202738)',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontWeight: 600,
                  }}
                >
                  Log In
                </button>
                <button
                  type="button"
                  className={`btn-primary ${isSignupActive ? 'active' : ''}`}
                  onClick={() => handleNav('#/signup')}
                  style={{
                    cursor: 'pointer',
                    padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                    background: 'var(--accent, #00f0ff)',
                    color: 'var(--text-inverse, #0b0e14)',
                    border: 'none',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontWeight: 700,
                    boxShadow: 'var(--shadow-sm, 0 2px 4px rgba(0,0,0,0.3))',
                  }}
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Hamburger Toggle Button */}
        <button
          type="button"
          className="mobile-toggle-btn mobile-only"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-navigation-drawer"
          style={{
            display: 'none', // Handled via CSS media query below
            cursor: 'pointer',
            background: 'var(--bg-elevated, #1a2030)',
            border: '1px solid var(--border-subtle, #202738)',
            borderRadius: 'var(--radius-md, 8px)',
            color: 'var(--text-primary, #f0f4fc)',
            padding: 'var(--space-2, 8px) var(--space-3, 12px)',
            fontSize: '1.25rem',
            lineHeight: 1,
          }}
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </nav>

      {/* Mobile Drawer Navigation Menu */}
      {mobileMenuOpen && (
        <div
          id="mobile-navigation-drawer"
          className="mobile-drawer"
          role="region"
          aria-label="Mobile Navigation Menu"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'var(--bg-surface, #121722)',
            borderBottom: '2px solid var(--border-strong, #2f3b54)',
            padding: 'var(--space-5, 20px) var(--space-6, 24px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4, 16px)',
            boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.65))',
            zIndex: 'var(--z-dropdown, 200)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2, 8px)' }}>
            <button
              type="button"
              className={`nav-btn ${isHomeActive ? 'active' : ''}`}
              onClick={() => handleNav('#/home')}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                padding: 'var(--space-3, 12px)',
                background: isHomeActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
                color: isHomeActive ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--text-sm, 0.875rem)',
                fontWeight: 600,
              }}
            >
              🏠 Home
            </button>
            <button
              type="button"
              className={`nav-btn ${isExploreActive ? 'active' : ''}`}
              onClick={() => handleNav('#/explore')}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                padding: 'var(--space-3, 12px)',
                background: isExploreActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
                color: isExploreActive ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--text-sm, 0.875rem)',
                fontWeight: 600,
              }}
            >
              🧭 Explore Radar
            </button>
            <button
              type="button"
              className={`nav-btn ${isRandomActive ? 'active' : ''}`}
              onClick={() => handleNav('#/random')}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                padding: 'var(--space-3, 12px)',
                background: isRandomActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
                color: isRandomActive ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--text-sm, 0.875rem)',
                fontWeight: 600,
              }}
            >
              🎲 Random
            </button>
            <button
              type="button"
              className={`nav-btn ${isCreateActive ? 'active' : ''}`}
              onClick={() => handleNav('#/create')}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                padding: 'var(--space-3, 12px)',
                background: isCreateActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
                color: isCreateActive ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--text-sm, 0.875rem)',
                fontWeight: 600,
              }}
            >
              + Post a Find
            </button>
            <button
              type="button"
              className={`nav-btn ${isCommunitiesActive ? 'active' : ''}`}
              onClick={() => handleNav('#/communities')}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                padding: 'var(--space-3, 12px)',
                background: isCommunitiesActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
                color: isCommunitiesActive ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--text-sm, 0.875rem)',
                fontWeight: 600,
              }}
            >
              🌐 Communities Hub
            </button>
            {user && (
              <button
                type="button"
                className="nav-btn"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setNotificationsOpen(true);
                }}
                style={{
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: 'var(--space-3, 12px)',
                  background: 'transparent',
                  color: 'var(--text-primary, #f0f4fc)',
                  border: '1px solid var(--border-subtle, #202738)',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: 'var(--text-sm, 0.875rem)',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>🔔 Transmissions / Notifications</span>
                {unreadCount > 0 && (
                  <span
                    style={{
                      background: 'var(--accent, #00f0ff)',
                      color: '#0a0d14',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              className={`nav-btn ${isGuideActive ? 'active' : ''}`}
              onClick={() => handleNav('#/guide')}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                padding: 'var(--space-3, 12px)',
                background: isGuideActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
                color: isGuideActive ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--text-sm, 0.875rem)',
                fontWeight: 600,
              }}
            >
              📖 Field Guide
            </button>
            <button
              type="button"
              className={`nav-btn ${isSettingsActive ? 'active' : ''}`}
              onClick={() => handleNav('#/settings')}
              style={{
                cursor: 'pointer',
                textAlign: 'left',
                padding: 'var(--space-3, 12px)',
                background: isSettingsActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'transparent',
                color: isSettingsActive ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                border: '1px solid var(--border-subtle, #202738)',
                borderRadius: 'var(--radius-md, 8px)',
                fontSize: 'var(--text-sm, 0.875rem)',
                fontWeight: 600,
              }}
            >
              ⚙️ Settings & Customizer
            </button>
            {isStaff && (
              <button
                type="button"
                className={`nav-btn ${isAdminActive ? 'active' : ''}`}
                onClick={() => handleNav('#/admin')}
                style={{
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: 'var(--space-3, 12px)',
                  background: isAdminActive ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'rgba(239, 68, 68, 0.1)',
                  color: isAdminActive ? 'var(--accent, #00f0ff)' : '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: 'var(--radius-md, 8px)',
                  fontSize: 'var(--text-sm, 0.875rem)',
                  fontWeight: 700,
                }}
              >
                🛡️ {user.role === 'admin' ? 'Admin Command Center' : 'Moderation Queue'}
              </button>
            )}
          </div>

          {/* Theme selector in mobile drawer */}
          <div
            style={{
              paddingTop: 'var(--space-3, 12px)',
              borderTop: '1px solid var(--border-subtle, #202738)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--text-xs, 0.75rem)',
                color: 'var(--text-muted, #64748b)',
                marginBottom: 'var(--space-2, 8px)',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              Theme Preset:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2, 8px)' }}>
              {themes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTheme(t.id)}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: 'var(--space-2, 8px)',
                    background: theme === t.id ? 'var(--accent-subtle, rgba(0,240,255,0.12))' : 'var(--bg-elevated, #1a2030)',
                    color: theme === t.id ? 'var(--accent, #00f0ff)' : 'var(--text-primary, #f0f4fc)',
                    border: theme === t.id ? '1px solid var(--accent, #00f0ff)' : '1px solid var(--border-subtle, #202738)',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--text-xs, 0.75rem)',
                    fontWeight: 600,
                  }}
                >
                  <span>{t.icon}</span>
                  <span>{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Auth actions */}
          <div
            style={{
              paddingTop: 'var(--space-3, 12px)',
              borderTop: '1px solid var(--border-subtle, #202738)',
            }}
          >
            {user ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--text-sm, 0.875rem)', color: 'var(--text-secondary, #94a3b8)' }}>
                  Scout: <strong style={{ color: 'var(--text-primary, #f0f4fc)' }}>{user.username}</strong>
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={logout}
                  style={{
                    cursor: 'pointer',
                    padding: 'var(--space-2, 8px) var(--space-4, 16px)',
                    background: 'var(--bg-elevated, #1a2030)',
                    color: 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-subtle, #202738)',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--text-sm, 0.875rem)',
                    fontWeight: 600,
                  }}
                >
                  Log Out
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 'var(--space-2, 8px)' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleNav('#/login')}
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    padding: 'var(--space-2, 8px)',
                    background: 'var(--bg-elevated, #1a2030)',
                    color: 'var(--text-primary, #f0f4fc)',
                    border: '1px solid var(--border-subtle, #202738)',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--text-sm, 0.875rem)',
                    fontWeight: 600,
                  }}
                >
                  Log In
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleNav('#/signup')}
                  style={{
                    flex: 1,
                    cursor: 'pointer',
                    padding: 'var(--space-2, 8px)',
                    background: 'var(--accent, #00f0ff)',
                    color: 'var(--text-inverse, #0b0e14)',
                    border: 'none',
                    borderRadius: 'var(--radius-md, 8px)',
                    fontSize: 'var(--text-sm, 0.875rem)',
                    fontWeight: 700,
                  }}
                >
                  Sign Up
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Responsive media query adjustments */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-only {
            display: none !important;
          }
          .mobile-only {
            display: inline-flex !important;
          }
        }
        @media (min-width: 769px) {
          .mobile-only {
            display: none !important;
          }
        }
      `}</style>

      {/* Notifications Drawer */}
      <NotificationsDrawer
        isOpen={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        navigate={handleNav}
        onUnreadCountUpdate={setUnreadCount}
      />
    </header>
  );
}
