import React from 'react';
import { useAuth } from '../context/AuthContext';

export function Navbar({ currentRoute, navigate }) {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar">
      <div className="nav-brand" onClick={() => navigate('#/feed')}>
        <span className="brand-logo">👁️</span>
        <span className="brand-title">Oddspot</span>
      </div>

      <div className="nav-links">
        <button
          className={`nav-btn ${currentRoute.startsWith('#/feed') ? 'active' : ''}`}
          onClick={() => navigate('#/feed')}
        >
          Nearby Feed
        </button>
        <button
          className={`nav-btn ${currentRoute === '#/create' ? 'active' : ''}`}
          onClick={() => navigate('#/create')}
        >
          + Post a Find
        </button>
      </div>

      <div className="nav-auth">
        {user ? (
          <div className="user-section">
            <span className="user-greeting">
              Scout: <strong>{user.username}</strong>
            </span>
            <button className="btn-secondary" onClick={logout}>
              Log Out
            </button>
          </div>
        ) : (
          <div className="auth-buttons">
            <button
              className={`btn-secondary ${currentRoute === '#/login' ? 'active' : ''}`}
              onClick={() => navigate('#/login')}
            >
              Log In
            </button>
            <button
              className={`btn-primary ${currentRoute === '#/signup' ? 'active' : ''}`}
              onClick={() => navigate('#/signup')}
            >
              Sign Up
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
