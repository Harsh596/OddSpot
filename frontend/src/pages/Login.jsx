import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export function Login({ navigate }) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!identifier.trim()) {
      setError('Please enter your username or email.');
      return;
    }
    if (!password) {
      setError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.login({ identifier: identifier.trim(), password });
      login(res.token, res.user);
      navigate('#/feed');
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h2>Log In to Oddspot</h2>
      <p className="subtitle">Explore weird spots found near you.</p>

      {error && <div className="alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="form-stack">
        <label>
          Username or Email
          <input
            type="text"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            placeholder="scout_name or scout@example.com"
            autoComplete="username"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>

      <p className="switch-auth">
        Don't have an account?{' '}
        <button className="link-btn" onClick={() => navigate('#/signup')}>
          Sign up here
        </button>
      </p>
    </div>
  );
}
