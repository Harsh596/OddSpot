// frontend/src/pages/Login.jsx
// Scout login view featuring password visibility toggle, 1-click Demo Credentials helper pills,
// inline Forgot Password request modal, and Reset Password token fulfillment view.

import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export function Login({ navigate }) {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Password Recovery modal/view state: 'none' | 'forgot' | 'reset'
  const [recoveryMode, setRecoveryMode] = useState('none');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [submittingRecovery, setSubmittingRecovery] = useState(false);

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
      login(res.token, res.user, res.refreshToken);
      navigate('#/home');
    } catch (err) {
      setError(err.message || 'Login failed.');
    } finally {
      setLoading(false);
    }
  };

  // 1-Click Demo Credentials Quick-Fill
  const handleFillDemo = (demoUsername, demoPass = 'DemoPassword123!') => {
    setIdentifier(demoUsername);
    setPassword(demoPass);
    setError('');
  };

  // Forgot Password request
  const handleForgotPasswordSubmit = async (e) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoveryMessage('');
    if (!recoveryEmail.trim()) {
      setRecoveryError('Please provide your account email.');
      return;
    }
    setSubmittingRecovery(true);
    try {
      const res = await api.forgotPassword(recoveryEmail.trim().toLowerCase());
      setRecoveryMessage(
        res.message || 'If an account exists, a password reset token has been dispatched.'
      );
    } catch (err) {
      setRecoveryError(err.message || 'Failed to request password reset.');
    } finally {
      setSubmittingRecovery(false);
    }
  };

  // Reset Password with token
  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoveryMessage('');
    if (!resetToken.trim() || !resetNewPassword) {
      setRecoveryError('Please enter both the reset token and your new password.');
      return;
    }
    if (resetNewPassword.length < 8) {
      setRecoveryError('New password must be at least 8 characters long.');
      return;
    }
    setSubmittingRecovery(true);
    try {
      const res = await api.resetPassword({
        token: resetToken.trim(),
        newPassword: resetNewPassword,
      });
      setRecoveryMessage(res.message || 'Password reset successfully! You can now log in.');
      setTimeout(() => {
        setRecoveryMode('none');
        setPassword(resetNewPassword);
      }, 2000);
    } catch (err) {
      setRecoveryError(err.message || 'Failed to reset password. Token may be invalid or expired.');
    } finally {
      setSubmittingRecovery(false);
    }
  };

  return (
    <div className="auth-card">
      <h2>Log In to Oddspot</h2>
      <p className="subtitle">Explore weird spots found near you.</p>

      {/* 1-Click Demo Credentials Helper Pills */}
      <div
        className="demo-credentials-banner"
        style={{
          background: '#FFF7ED',
          border: '1px solid #FED7AA',
          borderRadius: '8px',
          padding: '10px 12px',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: '#9A3412',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '6px',
          }}
        >
          ⚡ Fast Demo Scout Credentials (1-Click Fill)
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-demo-pill"
            onClick={() => handleFillDemo('demo_scout')}
            title="Fill Scout credentials"
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '9999px',
              border: '1px solid #FDBA74',
              background: '#FFFFFF',
              color: '#C2410C',
              cursor: 'pointer',
            }}
          >
            🧭 demo_scout
          </button>
          <button
            type="button"
            className="btn-demo-pill"
            onClick={() => handleFillDemo('demo_mod')}
            title="Fill Moderator credentials"
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '9999px',
              border: '1px solid #FDBA74',
              background: '#FFFFFF',
              color: '#C2410C',
              cursor: 'pointer',
            }}
          >
            🛡️ demo_mod
          </button>
          <button
            type="button"
            className="btn-demo-pill"
            onClick={() => handleFillDemo('demo_admin')}
            title="Fill Administrator credentials"
            style={{
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 600,
              borderRadius: '9999px',
              border: '1px solid #FDBA74',
              background: '#FFFFFF',
              color: '#C2410C',
              cursor: 'pointer',
            }}
          >
            👑 demo_admin
          </button>
        </div>
      </div>

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Password</span>
            <button
              type="button"
              className="link-btn"
              onClick={() => {
                setRecoveryMode('forgot');
                setRecoveryError('');
                setRecoveryMessage('');
              }}
              style={{ fontSize: '12px' }}
            >
              Forgot password?
            </button>
          </div>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
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
        </label>

        <button
          type="submit"
          className="btn-primary"
          disabled={loading}
          style={{ minHeight: '44px', fontWeight: 800 }}
        >
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>

      <p className="switch-auth">
        Don't have an account?{' '}
        <button className="link-btn" onClick={() => navigate('#/signup')}>
          Sign up here
        </button>
      </p>

      {/* Password Recovery Modal: Forgot Password or Enter Reset Token */}
      {recoveryMode !== 'none' && (
        <div className="modal-backdrop" onClick={() => setRecoveryMode('none')}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0 }}>
                {recoveryMode === 'forgot' ? '🔑 Reset Password' : '🎟️ Redeem Reset Token'}
              </h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setRecoveryMode('none')}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {recoveryMessage && <div className="alert-success-soft">{recoveryMessage}</div>}
            {recoveryError && <div className="alert-error-soft">{recoveryError}</div>}

            {recoveryMode === 'forgot' ? (
              <form onSubmit={handleForgotPasswordSubmit} className="form-stack">
                <p style={{ fontSize: '13px', color: 'var(--text-secondary, #524C46)', lineHeight: 1.5 }}>
                  Enter your scout email address and we'll dispatch a secure recovery token.
                </p>
                <label>
                  Account Email
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    placeholder="scout@example.com"
                    required
                  />
                </label>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingRecovery}
                  style={{ minHeight: '40px' }}
                >
                  {submittingRecovery ? 'Sending...' : 'Send Reset Token'}
                </button>
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setRecoveryMode('reset');
                      setRecoveryError('');
                      setRecoveryMessage('');
                    }}
                    style={{ fontSize: '12px' }}
                  >
                    Already have a reset token? Enter it here →
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="form-stack">
                <p style={{ fontSize: '13px', color: 'var(--text-secondary, #524C46)', lineHeight: 1.5 }}>
                  Enter the recovery token and choose your new password.
                </p>
                <label>
                  Reset Token
                  <input
                    type="text"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                    placeholder="e.g. 4f9b2d..."
                    required
                  />
                </label>
                <label>
                  New Password
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      placeholder="••••••••"
                      minLength={8}
                      maxLength={72}
                      required
                      style={{ width: '100%', paddingRight: '60px' }}
                    />
                    <button
                      type="button"
                      className="btn-password-toggle"
                      onClick={() => setShowResetPassword(!showResetPassword)}
                      aria-label={showResetPassword ? 'Hide password' : 'Show password'}
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
                      {showResetPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <small className="help-text">Minimum 8 characters.</small>
                </label>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingRecovery}
                  style={{ minHeight: '40px' }}
                >
                  {submittingRecovery ? 'Resetting Password...' : 'Confirm New Password'}
                </button>
                <div style={{ textAlign: 'center', marginTop: '8px' }}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => {
                      setRecoveryMode('forgot');
                      setRecoveryError('');
                      setRecoveryMessage('');
                    }}
                    style={{ fontSize: '12px' }}
                  >
                    ← Back to email request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Login;
