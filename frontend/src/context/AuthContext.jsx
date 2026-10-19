import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, setUnauthorizedHandler } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('oddspot_token'));
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('oddspot_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  const logout = () => {
    localStorage.removeItem('oddspot_token');
    localStorage.removeItem('oddspot_user');
    setToken(null);
    setUser(null);
    window.location.hash = '#/login';
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
  }, []);

  useEffect(() => {
    async function loadUser() {
      if (token) {
        try {
          const res = await api.getMe();
          setUser(res.user);
          localStorage.setItem('oddspot_user', JSON.stringify(res.user));
        } catch {
          // apiRequest handles 401 and calls logout
        }
      }
      setLoading(false);
    }
    loadUser();
  }, [token]);

  const login = (newToken, newUser) => {
    localStorage.setItem('oddspot_token', newToken);
    localStorage.setItem('oddspot_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
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
