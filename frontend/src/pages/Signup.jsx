import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export function Signup({ navigate }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanUsername = username.trim();
    if (cleanUsername.length < 3 || cleanUsername.length > 24) {
      setError('Username must be between 3 and 24 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      setError('Username can only contain letters, numbers, and underscores.');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Please provide a valid email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.signup({
        username: cleanUsername,
        email: cleanEmail,
        password,
      });
      login(res.token, res.user, res.refreshToken);
      navigate('#/home');
    } catch (err) {
      setError(err.message || 'Signup failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <h2>Join Oddspot</h2>
      <p className="subtitle">Discover real-world oddities in your neighborhood.</p>

      {error && <div className="alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="form-stack">
        <label>
          Username
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="odd_explorer"
            autoComplete="username"
            required
          />
          <small className="help-text">3-24 characters, letters, numbers, and underscores only.</small>
        </label>

        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="explorer@example.com"
            autoComplete="email"
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
            autoComplete="new-password"
            required
          />
          <small className="help-text">Minimum 6 characters.</small>
        </label>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? 'Creating account...' : 'Create Account'}
        </button>
      </form>

      <p className="switch-auth">
        Already have an account?{' '}
        <button className="link-btn" onClick={() => navigate('#/login')}>
          Log in here
        </button>
      </p>
    </div>
  );
}
