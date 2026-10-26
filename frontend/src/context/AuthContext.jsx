import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setUnauthorizedHandler, getAccessToken, setTokens, clearTokens } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getAccessToken());
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('oddspot_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      clearTokens();
    }
    setToken(null);
    setUser(null);
    window.location.hash = '#/login';
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearTokens();
      setToken(null);
      setUser(null);
      window.location.hash = '#/login';
    });
  }, []);

  useEffect(() => {
    async function loadUser() {
      if (token) {
        try {
          const res = await api.getMe();
          if (res?.user) {
            setUser(res.user);
            localStorage.setItem('oddspot_user', JSON.stringify(res.user));
          }
        } catch {
          // apiRequest handles 401 and refresh automatically
        }
      }
      setLoading(false);
    }
    loadUser();
  }, [token]);

  const login = (newToken, newUser, newRefreshToken) => {
    const refreshTokenToSet = newRefreshToken || getRefreshToken();
    setTokens({ token: newToken, refreshToken: refreshTokenToSet, user: newUser });
    setToken(newToken);
    setUser(newUser);
  };

  const updateUser = (patch) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updated = { ...prev, ...patch };
      try {
        localStorage.setItem('oddspot_user', JSON.stringify(updated));
      } catch {
        // ignore storage errors
      }
      return updated;
    });
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout, updateUser, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
