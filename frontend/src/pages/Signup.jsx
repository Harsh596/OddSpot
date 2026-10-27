// frontend/src/pages/Signup.jsx
// Scout registration form featuring password visibility toggle, confirm password check,
// live 8-72 byte password strength indicator, and COPPA age confirmation guard.

import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

function calculatePasswordStrength(pass) {
  if (!pass) return { score: 0, label: '', color: 'transparent' };
  let score = 0;
  if (pass.length >= 8) score += 1;
  if (/[a-z]/.test(pass)) score += 1;
  if (/[A-Z]/.test(pass)) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^a-zA-Z0-9]/.test(pass)) score += 1;

  if (pass.length < 8) {
    return { score: 1, label: 'Too short (min 8 chars)', color: '#EF4444' };
  }
  if (score <= 2) return { score: 2, label: 'Weak', color: '#EF4444' };
  if (score === 3) return { score: 3, label: 'Medium', color: '#F59E0B' };
  if (score === 4) return { score: 4, label: 'Strong', color: '#10B981' };
  return { score: 5, label: 'Excellent', color: '#059669' };
}

export function Signup({ navigate }) {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const strength = calculatePasswordStrength(password);
  const passwordsMatch = password && confirmPassword && password === confirmPassword;
  const passwordMismatch = confirmPassword && password !== confirmPassword;

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

    if (password.length < 8) {
      setError('Password must be at least 8 characters long (8–72 bytes).');
      return;
    }
    if (password.length > 72) {
      setError('Password must not exceed 72 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!ageConfirmed) {
      setError('You must confirm you are at least 13 years old to register.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.signup({
        username: cleanUsername,
        email: cleanEmail,
        password,
        ageConfirmed: true,
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
            maxLength={24}
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

        {/* Password field with Visibility Toggle & Strength Bar */}
        <label>
          Password
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              minLength={8}
              maxLength={72}
              required
              style={{ width: '100%', paddingRight: '60px' }}
            />
            <button
              type="button"
              className="btn-password-toggle"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute',
                right: '6px',
                minHeight: '36px',
                padding: '0 8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary, #524C46)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {/* Live Password Strength Indicator */}
          {password && (
            <div style={{ marginTop: '6px' }}>
              <div
                style={{
                  height: '4px',
                  width: '100%',
                  background: '#E4E4E7',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${(strength.score / 5) * 100}%`,
                    background: strength.color,
                    transition: 'width 0.2s ease, background 0.2s ease',
                  }}
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  marginTop: '4px',
                  color: strength.color,
                  fontWeight: 600,
                }}
              >
                <span>Strength: {strength.label}</span>
                <span style={{ color: 'var(--text-muted, #71717A)' }}>{password.length}/72 chars</span>
              </div>
            </div>
          )}
          <small className="help-text">8–72 characters. Combine letters, numbers, and symbols.</small>
        </label>

        {/* Confirm Password field with Visibility Toggle & Match indicator */}
        <label>
          Confirm Password
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              required
              style={{
                width: '100%',
                paddingRight: '60px',
                borderColor: passwordMismatch ? '#EF4444' : passwordsMatch ? '#10B981' : undefined,
              }}
            />
            <button
              type="button"
              className="btn-password-toggle"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
              style={{
                position: 'absolute',
                right: '6px',
                minHeight: '36px',
                padding: '0 8px',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary, #524C46)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {showConfirmPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          {passwordMismatch && (
            <span style={{ color: '#EF4444', fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
              ⚠️ Passwords do not match
            </span>
          )}
          {passwordsMatch && (
            <span style={{ color: '#10B981', fontSize: '11px', fontWeight: 600, marginTop: '2px' }}>
              ✓ Passwords match
            </span>
          )}
        </label>

        {/* Age Confirmation Guard */}
        <div style={{ margin: '8px 0 12px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              fontSize: '13px',
              cursor: 'pointer',
              color: 'var(--text-primary, #18181B)',
            }}
          >
            <input
              type="checkbox"
              checked={ageConfirmed}
              onChange={(e) => setAgeConfirmed(e.target.checked)}
              required
              style={{ marginTop: '2px' }}
            />
            <span>
              <strong>I confirm I am at least 13 years old</strong> and agree to the Oddspot Field Scout Code of Conduct.
            </span>
          </label>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={loading || !ageConfirmed || (confirmPassword && !passwordsMatch)}
          style={{ minHeight: '44px', fontWeight: 800 }}
        >
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

export default Signup;
