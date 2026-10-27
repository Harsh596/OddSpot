import React, { useState } from 'react';
import { useTheme, THEME_PRESETS, FONT_OPTIONS } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import FeedRuleBuilder from '../components/settings/FeedRuleBuilder';

export function SettingsPage() {
  const { user } = useAuth();
  const {
    preset,
    setTheme,
    effectiveColors,
    effectiveFont,
    effectiveGlow,
    contrastRatio,
    isLowContrast,
    setColorOverride,
    setFontFamily,
    setNeonGlow,
    resetToPreset,
    fixContrast,
    exportThemeCode,
    importThemeCode,
    syncPreferences,
  } = useTheme();

  const [activeTab, setActiveTab] = useState('theme'); // 'theme' | 'feed' | 'account'
  const [themeSyncStatus, setThemeSyncStatus] = useState(null);
  const [isExportingData, setIsExportingData] = useState(false);

  // Theme code import/export modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [importCodeText, setImportCodeText] = useState('');
  const [shareModalError, setShareModalError] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);

  // Color picker keys and friendly labels
  const COLOR_PICKERS = [
    { key: '--bg-primary', label: 'Background Canvas', hint: 'Main viewport page background' },
    { key: '--bg-surface', label: 'Surface Cards', hint: 'Panels, cards & modals' },
    { key: '--text-primary', label: 'Primary Text', hint: 'Headings and high-contrast copy' },
    { key: '--accent-primary', label: 'Primary Accent', hint: 'Glows, active links & CTA buttons' },
    { key: '--accent-secondary', label: 'Secondary Accent', hint: 'Eyebrow tags, ratings & alerts' },
  ];

  const handleSaveTheme = async () => {
    setThemeSyncStatus({ type: 'loading', text: 'Saving theme preferences...' });
    if (!user) {
      setThemeSyncStatus({
        type: 'info',
        text: '✓ Theme saved in this browser. Log in to sync to your account profile.',
      });
      setTimeout(() => setThemeSyncStatus(null), 4000);
      return;
    }
    const res = await syncPreferences();
    if (res.ok) {
      setThemeSyncStatus({ type: 'success', text: '✓ Theme successfully synced to your account!' });
    } else {
      setThemeSyncStatus({ type: 'error', text: `Failed to sync theme: ${res.error}` });
    }
    setTimeout(() => setThemeSyncStatus(null), 4000);
  };

  const handleOpenShareModal = () => {
    setImportCodeText(exportThemeCode());
    setShareModalError(null);
    setShareCopied(false);
    setShowShareModal(true);
  };

  const handleCopyThemeCode = async () => {
    try {
      await navigator.clipboard.writeText(exportThemeCode());
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleApplyImportedCode = () => {
    setShareModalError(null);
    const res = importThemeCode(importCodeText);
    if (res.ok) {
      setShowShareModal(false);
      setThemeSyncStatus({ type: 'success', text: '✓ Theme code successfully imported and applied!' });
      setTimeout(() => setThemeSyncStatus(null), 3000);
    } else {
      setShareModalError(res.error || 'Invalid theme code format');
    }
  };

  const handleExportAccountData = async () => {
    setIsExportingData(true);
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oddspot-data-${user?.username || 'scout'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExportingData(false);
    }
  };

  return (
    <div className="settings-page-container">
      <header className="settings-header">
        <div className="settings-badge">CONTROL PANEL</div>
        <h1 className="settings-title">Scout Preferences & Rules</h1>
        <p className="settings-subtitle">
          Customize your sensory aesthetic presets, color overrides, and tune the discovery algorithm.
        </p>

        {/* Settings Navigation Tabs */}
        <div className="settings-tabs-row" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'theme'}
            className={`settings-tab-btn ${activeTab === 'theme' ? 'active' : ''}`}
            onClick={() => setActiveTab('theme')}
          >
            🎨 Visual Theme Customizer
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'feed'}
            className={`settings-tab-btn ${activeTab === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveTab('feed')}
          >
            ⚙️ Feed Rule Builder
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'account'}
            className={`settings-tab-btn ${activeTab === 'account' ? 'active' : ''}`}
            onClick={() => setActiveTab('account')}
          >
            🛡️ Account & Privacy
          </button>
        </div>
      </header>

      {/* Tab 1: Theme Customizer */}
      {activeTab === 'theme' && (
        <section className="settings-section">
          {/* Preset Selector Cards */}
          <div className="theme-presets-section">
            <h2 className="section-heading">Concrete Theme Presets</h2>
            <p className="section-subtext">
              Select one of the 4 hand-tuned aesthetic archetypes:
            </p>

            <div className="presets-grid">
              {Object.values(THEME_PRESETS).map((p) => {
                const isSelected = preset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`preset-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setTheme(p.id)}
                  >
                    <div className="preset-card-top">
                      <span className="preset-icon">{p.icon}</span>
                      <span className="preset-name">{p.name}</span>
                      {isSelected && <span className="preset-active-check">✓ Active</span>}
                    </div>

                    <p className="preset-desc">{p.description}</p>

                    {/* Color Swatch Strip */}
                    <div className="preset-swatches">
                      <span style={{ background: p.colors['--bg-primary'] }} title="Canvas" />
                      <span style={{ background: p.colors['--bg-surface'] }} title="Surface" />
                      <span style={{ background: p.colors['--accent-primary'] }} title="Accent Primary" />
                      <span style={{ background: p.colors['--accent-secondary'] }} title="Accent Secondary" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Customizer Controls */}
          <div className="customizer-panel-card">
            <div className="panel-header-strip">
              <div>
                <h3 className="panel-title">Live Color Palette & Overrides</h3>
                <p className="panel-subtitle">Fine-tune individual CSS variables in real time.</p>
              </div>
              <div className="panel-header-actions">
                <button
                  type="button"
                  className="btn-theme-code"
                  onClick={handleOpenShareModal}
                >
                  🔗 Share Theme Code
                </button>
                <button
                  type="button"
                  className="btn-reset-theme"
                  onClick={resetToPreset}
                  title="Discard custom overrides and reset to current preset"
                >
                  ↺ Reset to Preset
                </button>
              </div>
            </div>

            {/* WCAG Contrast Ratio Checker Bar */}
            <div className={`contrast-meter-card ${isLowContrast ? 'warning' : 'passing'}`}>
              <div className="contrast-meter-left">
                <span className="contrast-score-tag">
                  {contrastRatio}:1 Contrast Ratio
                </span>
                <span className="contrast-eval-text">
                  {isLowContrast
                    ? '⚠️ Low contrast (<4.5:1) text may be hard to read on this background'
                    : '✓ WCAG 2.2 AA Compliant Text Contrast (≥4.5:1)'}
                </span>
              </div>
              {isLowContrast && (
                <button
                  type="button"
                  className="btn-fix-contrast"
                  onClick={fixContrast}
                >
                  ✨ Fix Contrast Automatically
                </button>
              )}
            </div>

            {/* Live Color Pickers */}
            <div className="color-pickers-grid">
              {COLOR_PICKERS.map((picker) => {
                const currentColor = effectiveColors[picker.key] || '#000000';
                return (
                  <div key={picker.key} className="color-picker-item">
                    <div className="picker-color-preview" style={{ background: currentColor }}>
                      <input
                        type="color"
                        value={currentColor}
                        onChange={(e) => setColorOverride(picker.key, e.target.value)}
                        className="native-color-input"
                        aria-label={`Select color for ${picker.label}`}
                      />
                    </div>
                    <div className="picker-text-col">
                      <label className="picker-label">{picker.label}</label>
                      <span className="picker-hint">{picker.hint}</span>
                      <input
                        type="text"
                        value={currentColor}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val.startsWith('#') && val.length <= 7) {
                            setColorOverride(picker.key, val);
                          }
                        }}
                        className="picker-hex-input"
                        placeholder="#000000"
                        maxLength="7"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Typography & Neon Glow Controls */}
            <div className="customizer-options-row">
              <div className="customizer-option-col">
                <label className="option-label">
                  <strong>Typography Stack</strong>
                </label>
                <div className="font-options-row">
                  {FONT_OPTIONS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`font-select-btn ${effectiveFont === f.id ? 'active' : ''}`}
                      onClick={() => setFontFamily(f.id)}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="customizer-option-col glow-col">
                <label className="option-label">
                  <strong>Neon Glow & Atmospheric Light</strong>
                </label>
                <label className="toggle-switch-label">
                  <input
                    type="checkbox"
                    checked={effectiveGlow}
                    onChange={(e) => setNeonGlow(e.target.checked)}
                  />
                  <span className="toggle-slider" />
                  <span className="toggle-text">
                    {effectiveGlow ? 'Glow Enabled (Luminous)' : 'Glow Disabled (Flat)'}
                  </span>
                </label>
              </div>
            </div>

            {/* Save Button */}
            <div className="customizer-footer">
              {themeSyncStatus && (
                <div className={`theme-status-msg ${themeSyncStatus.type}`}>
                  {themeSyncStatus.text}
                </div>
              )}
              <button
                type="button"
                className="btn-save-theme-cta"
                onClick={handleSaveTheme}
              >
                💾 Save Theme Preferences
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Tab 2: Visual Feed Rule Builder */}
      {activeTab === 'feed' && (
        <section className="settings-section">
          <FeedRuleBuilder />
        </section>
      )}

      {/* Tab 3: Account & GDPR Export */}
      {activeTab === 'account' && (
        <section className="settings-section">
          <div className="account-settings-card">
            <h2 className="section-heading">Account Dossier & Privacy</h2>
            <p className="section-subtext">
              Inspect your stored account data and download an untruncated GDPR export.
            </p>

            {user ? (
              <div className="account-details-list">
                <div className="account-detail-row">
                  <span className="detail-label">Scout Handle</span>
                  <span className="detail-val font-mono">@{user.username}</span>
                </div>
                <div className="account-detail-row">
                  <span className="detail-label">Registered Email</span>
                  <span className="detail-val">{user.email}</span>
                </div>
                <div className="account-detail-row">
                  <span className="detail-label">Role</span>
                  <span className="detail-val role-tag">{user.role}</span>
                </div>
                <div className="account-detail-row">
                  <span className="detail-label">Earned Badges</span>
                  <span className="detail-val badges-strip">
                    {user.badges && user.badges.length > 0
                      ? user.badges.map((b) => <span key={b} className="badge-tag">🎖️ {b}</span>)
                      : 'No badges earned yet'}
                  </span>
                </div>
                <div className="account-detail-row">
                  <span className="detail-label">Onboarding Status</span>
                  <span className="detail-val">
                    {user.onboardingDone ? '✓ Completed' : 'Pending Briefing'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="anonymous-notice">
                You are currently browsing anonymously. Sign up or log in to view account details and persist preferences across devices.
              </p>
            )}

            <div className="data-export-box">
              <h3>GDPR Data Portability (JSON Dump)</h3>
              <p>
                Download a clean, sanitized JSON export of all your posts, comments, votes, reports,
                and account preferences in compliance with GDPR and privacy standards.
              </p>
              <button
                type="button"
                className="btn-export-data"
                onClick={handleExportAccountData}
                disabled={!user || isExportingData}
              >
                {isExportingData ? 'Generating Export...' : '📥 Download My Oddspot Data (.json)'}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Share / Import Theme Modal */}
      {showShareModal && (
        <div
          className="share-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShareModal(false);
          }}
        >
          <div
            className="share-modal-container"
            role="dialog"
            aria-labelledby="share-theme-title"
          >
            <div className="share-modal-header">
              <h3 id="share-theme-title">Share or Import Theme Code</h3>
              <button
                type="button"
                className="share-modal-close"
                onClick={() => setShowShareModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="share-modal-body">
              <p className="share-modal-intro">
                Copy your custom theme code to share with other field scouts, or paste a theme code to apply it immediately.
              </p>

              <textarea
                value={importCodeText}
                onChange={(e) => setImportCodeText(e.target.value)}
                className="share-code-textarea"
                rows="8"
                placeholder="Paste theme JSON code here..."
              />

              {shareModalError && (
                <div className="share-error-msg">⚠️ {shareModalError}</div>
              )}
            </div>

            <div className="share-modal-footer">
              <button
                type="button"
                className="btn-modal-action secondary"
                onClick={handleCopyThemeCode}
              >
                {shareCopied ? '✓ Copied to Clipboard!' : '📋 Copy Theme Code'}
              </button>

              <button
                type="button"
                className="btn-modal-action primary"
                onClick={handleApplyImportedCode}
              >
                Apply Theme Code →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsPage;
