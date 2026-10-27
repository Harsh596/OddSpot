import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../../api';
import { useAuth } from '../../context/AuthContext';

const PRESET_TAG_SUGGESTIONS = [
  'statue',
  'graffiti',
  'mural',
  'architecture',
  'abandoned',
  'sign',
  'mystery',
  'neon',
  'tunnel',
  'shrine',
];

const WARNING_OPTIONS = [
  { id: 'private_property', label: 'Private Property Edge' },
  { id: 'walking_required', label: 'Walking Required / No Parking' },
  { id: 'unsafe_night', label: 'Caution After Dark' },
  { id: 'other', label: 'General Hazard' },
];

const SORT_OPTIONS = [
  { id: 'hot', label: '⚡ Hot & Trending' },
  { id: 'new', label: '✨ Newest First' },
  { id: 'top', label: '🏆 Highest Score' },
  { id: 'distance', label: '📍 Nearest (GPS Distance)' },
];

export default function FeedRuleBuilder() {
  const { user } = useAuth();

  const [mode, setMode] = useState('default');
  const [maxDistanceKm, setMaxDistanceKm] = useState(25);
  const [includeTags, setIncludeTags] = useState([]);
  const [excludeTags, setExcludeTags] = useState([]);
  const [excludeWarnings, setExcludeWarnings] = useState([]);
  const [onlyTypes, setOnlyTypes] = useState([]);
  const [onlyVerifiedVisited, setOnlyVerifiedVisited] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [sortBy, setSortBy] = useState('hot');
  const [boostTags, setBoostTags] = useState([]);

  // Inputs for adding tags
  const [newIncludeTag, setNewIncludeTag] = useState('');
  const [newExcludeTag, setNewExcludeTag] = useState('');
  const [newBoostTag, setNewBoostTag] = useState('');
  const [newBoostMultiplier, setNewBoostMultiplier] = useState(1.5);

  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [copied, setCopied] = useState(false);

  // Initialize from user preferences or localStorage
  useEffect(() => {
    let initialConfig = null;
    if (user?.feedConfig) {
      initialConfig = user.feedConfig;
    } else {
      try {
        const saved = localStorage.getItem('oddspot_feed_config');
        if (saved) initialConfig = JSON.parse(saved);
      } catch {
        // ignore
      }
    }

    if (initialConfig) {
      setMode(initialConfig.mode || 'default');
      const r = initialConfig.rules || {};
      if (r.maxDistanceKm) setMaxDistanceKm(r.maxDistanceKm);
      if (Array.isArray(r.includeTags)) setIncludeTags(r.includeTags);
      if (Array.isArray(r.excludeTags)) setExcludeTags(r.excludeTags);
      if (Array.isArray(r.excludeWarnings)) setExcludeWarnings(r.excludeWarnings);
      if (Array.isArray(r.onlyTypes)) setOnlyTypes(r.onlyTypes);
      if (typeof r.onlyVerifiedVisited === 'boolean') setOnlyVerifiedVisited(r.onlyVerifiedVisited);
      if (r.minScore !== undefined) setMinScore(r.minScore);
      if (r.sortBy) setSortBy(r.sortBy);
      if (Array.isArray(r.boostTags)) setBoostTags(r.boostTags);
    }
  }, [user]);

  // Construct generated rule JSON adhering to backend feedRuleSchema
  const generatedPayload = useMemo(() => {
    const rules = {
      version: 1,
      maxDistanceKm: Number(maxDistanceKm),
      ...(includeTags.length > 0 ? { includeTags } : {}),
      ...(excludeTags.length > 0 ? { excludeTags } : {}),
      ...(excludeWarnings.length > 0 ? { excludeWarnings } : {}),
      ...(onlyTypes.length > 0 ? { onlyTypes } : {}),
      ...(onlyVerifiedVisited ? { onlyVerifiedVisited: true } : {}),
      minScore: Number(minScore),
      sortBy,
      ...(boostTags.length > 0 ? { boostTags } : {}),
    };

    return {
      feedConfig: {
        mode,
        ...(mode === 'rules' ? { rules } : {}),
      },
    };
  }, [
    mode,
    maxDistanceKm,
    includeTags,
    excludeTags,
    excludeWarnings,
    onlyTypes,
    onlyVerifiedVisited,
    minScore,
    sortBy,
    boostTags,
  ]);

  const jsonString = useMemo(() => {
    return JSON.stringify(generatedPayload, null, 2);
  }, [generatedPayload]);

  // Tag management handlers
  const handleAddIncludeTag = (tagToAdd) => {
    const clean = (tagToAdd || newIncludeTag).trim().toLowerCase();
    if (clean && !includeTags.includes(clean) && includeTags.length < 10) {
      setIncludeTags([...includeTags, clean]);
      setNewIncludeTag('');
    }
  };

  const handleRemoveIncludeTag = (tag) => {
    setIncludeTags(includeTags.filter((t) => t !== tag));
  };

  const handleAddExcludeTag = (tagToAdd) => {
    const clean = (tagToAdd || newExcludeTag).trim().toLowerCase();
    if (clean && !excludeTags.includes(clean) && excludeTags.length < 20) {
      setExcludeTags([...excludeTags, clean]);
      setNewExcludeTag('');
    }
  };

  const handleRemoveExcludeTag = (tag) => {
    setExcludeTags(excludeTags.filter((t) => t !== tag));
  };

  const handleToggleWarning = (warningId) => {
    if (excludeWarnings.includes(warningId)) {
      setExcludeWarnings(excludeWarnings.filter((w) => w !== warningId));
    } else {
      setExcludeWarnings([...excludeWarnings, warningId]);
    }
  };

  const handleToggleType = (typeId) => {
    if (onlyTypes.includes(typeId)) {
      setOnlyTypes(onlyTypes.filter((t) => t !== typeId));
    } else {
      setOnlyTypes([...onlyTypes, typeId]);
    }
  };

  const handleAddBoostTag = () => {
    const clean = newBoostTag.trim().toLowerCase();
    const mult = Number(Number(newBoostMultiplier).toFixed(1));
    if (clean && mult >= 0.5 && mult <= 3.0 && boostTags.length < 5) {
      if (!boostTags.some((b) => b.tag === clean)) {
        setBoostTags([...boostTags, { tag: clean, multiplier: mult }]);
        setNewBoostTag('');
        setNewBoostMultiplier(1.5);
      }
    }
  };

  const handleRemoveBoostTag = (tag) => {
    setBoostTags(boostTags.filter((b) => b.tag !== tag));
  };

  // Copy JSON handler
  const handleCopyJson = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  // Save preferences
  const handleSavePreferences = async () => {
    setIsSaving(true);
    setStatusMessage(null);

    // Save locally
    try {
      localStorage.setItem('oddspot_feed_config', JSON.stringify(generatedPayload.feedConfig));
    } catch {
      // storage error
    }

    // Save to backend if authenticated
    try {
      if (user) {
        await api.updatePreferences(generatedPayload);
        setStatusMessage({ type: 'success', text: '✓ Feed rules saved and active on Home Feed!' });
      } else {
        setStatusMessage({
          type: 'info',
          text: '✓ Rules saved locally in your browser. Log in to sync to your account.',
        });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to save: ${err.message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = () => {
    setMode('default');
    setMaxDistanceKm(25);
    setIncludeTags([]);
    setExcludeTags([]);
    setExcludeWarnings([]);
    setOnlyTypes([]);
    setOnlyVerifiedVisited(false);
    setMinScore(0);
    setSortBy('hot');
    setBoostTags([]);
  };

  return (
    <div className="feed-builder-container">
      {/* Mode Switcher */}
      <div className="feed-mode-strip">
        <div className="feed-mode-header">
          <h3>Discovery Algorithm Mode</h3>
          <p className="feed-mode-subtext">
            Choose whether to use the default community Oddspot algorithm or your own sandboxed rule engine.
          </p>
        </div>

        <div className="feed-mode-toggles">
          <button
            type="button"
            className={`feed-mode-btn ${mode === 'default' ? 'active' : ''}`}
            onClick={() => setMode('default')}
          >
            <span className="mode-btn-icon">⚡</span>
            <div className="mode-btn-text">
              <strong>Default Algorithm</strong>
              <small>Community votes, trending digest & oddometer ratchets</small>
            </div>
          </button>

          <button
            type="button"
            className={`feed-mode-btn ${mode === 'rules' ? 'active' : ''}`}
            onClick={() => setMode('rules')}
          >
            <span className="mode-btn-icon">⚙️</span>
            <div className="mode-btn-text">
              <strong>Custom Rule Engine</strong>
              <small>Strict tag filters, distance caps, score thresholds & multipliers</small>
            </div>
          </button>
        </div>
      </div>

      {mode === 'rules' && (
        <div className="feed-rules-form">
          {/* 1. Distance Slider */}
          <div className="form-group-card">
            <div className="form-group-header">
              <label htmlFor="dist-slider">
                <strong>Maximum Discovery Distance</strong>
              </label>
              <span className="value-badge">{maxDistanceKm} km</span>
            </div>
            <p className="form-hint">
              Only include spots located within this radius from your current live GPS coordinates.
            </p>
            <input
              id="dist-slider"
              type="range"
              min="1"
              max="50"
              step="1"
              value={maxDistanceKm}
              onChange={(e) => setMaxDistanceKm(Number(e.target.value))}
              className="range-slider"
            />
            <div className="range-scale-labels">
              <span>1 km (Hyperlocal)</span>
              <span>25 km (Metro)</span>
              <span>50 km (Regional)</span>
            </div>
          </div>

          {/* 2. Include Tags */}
          <div className="form-group-card">
            <div className="form-group-header">
              <label>
                <strong>Must-Include Tags</strong>
              </label>
              <span className="tag-count-indicator">{includeTags.length} / 10 tags</span>
            </div>
            <p className="form-hint">
              Only display spots tagged with at least one of these keywords.
            </p>

            <div className="tag-chips-wrapper">
              {includeTags.map((tag) => (
                <span key={tag} className="tag-chip include">
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveIncludeTag(tag)}
                    aria-label={`Remove include tag ${tag}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <div className="tag-input-row">
              <input
                type="text"
                placeholder="Add tag (e.g. statue, mystery)..."
                value={newIncludeTag}
                onChange={(e) => setNewIncludeTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddIncludeTag();
                  }
                }}
                className="text-input"
              />
              <button
                type="button"
                className="btn-add-tag"
                onClick={() => handleAddIncludeTag()}
                disabled={!newIncludeTag.trim() || includeTags.length >= 10}
              >
                + Add
              </button>
            </div>

            {/* Quick Presets */}
            <div className="preset-suggestions-row">
              <span className="suggestions-label">Presets:</span>
              {PRESET_TAG_SUGGESTIONS.filter((t) => !includeTags.includes(t)).slice(0, 6).map((t) => (
                <button
                  key={t}
                  type="button"
                  className="preset-tag-btn"
                  onClick={() => handleAddIncludeTag(t)}
                >
                  +{t}
                </button>
              ))}
            </div>
          </div>

          {/* 3. Exclude Tags */}
          <div className="form-group-card">
            <div className="form-group-header">
              <label>
                <strong>Filter Out / Exclude Tags</strong>
              </label>
              <span className="tag-count-indicator">{excludeTags.length} / 20 tags</span>
            </div>
            <p className="form-hint">
              Silently hide any post matching any of these tags.
            </p>

            <div className="tag-chips-wrapper">
              {excludeTags.map((tag) => (
                <span key={tag} className="tag-chip exclude">
                  ✕ #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveExcludeTag(tag)}
                    aria-label={`Remove exclude tag ${tag}`}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>

            <div className="tag-input-row">
              <input
                type="text"
                placeholder="Exclude tag (e.g. sticker, commercial)..."
                value={newExcludeTag}
                onChange={(e) => setNewExcludeTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddExcludeTag();
                  }
                }}
                className="text-input"
              />
              <button
                type="button"
                className="btn-add-tag danger"
                onClick={() => handleAddExcludeTag()}
                disabled={!newExcludeTag.trim() || excludeTags.length >= 20}
              >
                Exclude
              </button>
            </div>
          </div>

          {/* 4. Exclude Warnings & Safety */}
          <div className="form-group-card">
            <label>
              <strong>Safety & Warning Exclusions</strong>
            </label>
            <p className="form-hint">Filter out finds with specific hazard flags.</p>
            <div className="checkboxes-grid">
              {WARNING_OPTIONS.map((w) => (
                <label key={w.id} className="checkbox-item">
                  <input
                    type="checkbox"
                    checked={excludeWarnings.includes(w.id)}
                    onChange={() => handleToggleWarning(w.id)}
                  />
                  <span>Exclude {w.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* 5. Post Types & Verification Filter */}
          <div className="form-group-card">
            <label>
              <strong>Spot Classification & Verification</strong>
            </label>
            <div className="checkboxes-row">
              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={onlyTypes.includes('find')}
                  onChange={() => handleToggleType('find')}
                />
                <span>Only Verified Finds</span>
              </label>

              <label className="checkbox-item">
                <input
                  type="checkbox"
                  checked={onlyTypes.includes('identify')}
                  onChange={() => handleToggleType('identify')}
                />
                <span>Only Unsolved Mysteries ('identify')</span>
              </label>

              <label className="checkbox-item highlight">
                <input
                  type="checkbox"
                  checked={onlyVerifiedVisited}
                  onChange={(e) => setOnlyVerifiedVisited(e.target.checked)}
                />
                <span>👟 Only In-Person Verified Physical Visits</span>
              </label>
            </div>
          </div>

          {/* 6. Score & Sorting */}
          <div className="form-row-duo">
            <div className="form-group-card flex-1">
              <div className="form-group-header">
                <label htmlFor="score-input">
                  <strong>Minimum Oddometer Score</strong>
                </label>
                <span className="value-badge">{minScore} pts</span>
              </div>
              <p className="form-hint">Hide spots below this threshold.</p>
              <input
                id="score-input"
                type="range"
                min="-10"
                max="100"
                step="1"
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
                className="range-slider"
              />
            </div>

            <div className="form-group-card flex-1">
              <label htmlFor="sort-select">
                <strong>Feed Sorting Strategy</strong>
              </label>
              <p className="form-hint">Order of incoming anomalies.</p>
              <select
                id="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="select-input"
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 7. Tag Boost Multipliers */}
          <div className="form-group-card">
            <div className="form-group-header">
              <label>
                <strong>Tag Boost Multipliers</strong>
              </label>
              <span className="tag-count-indicator">{boostTags.length} / 5 rules</span>
            </div>
            <p className="form-hint">
              Multiply score ranking for topics you care about most (0.5x to 3.0x).
            </p>

            <div className="boost-rules-list">
              {boostTags.map((b) => (
                <div key={b.tag} className="boost-rule-item">
                  <span className="boost-tag-name">#{b.tag}</span>
                  <span className="boost-mult-val">{b.multiplier}x boost</span>
                  <button
                    type="button"
                    className="btn-remove-boost"
                    onClick={() => handleRemoveBoostTag(b.tag)}
                    aria-label={`Remove boost for tag ${b.tag}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="boost-input-row">
              <input
                type="text"
                placeholder="Tag to boost (e.g. mural)..."
                value={newBoostTag}
                onChange={(e) => setNewBoostTag(e.target.value)}
                className="text-input"
              />
              <div className="multiplier-picker">
                <span>Weight:</span>
                <select
                  value={newBoostMultiplier}
                  onChange={(e) => setNewBoostMultiplier(Number(e.target.value))}
                  className="select-input small"
                >
                  <option value={0.5}>0.5x (Subdued)</option>
                  <option value={1.2}>1.2x (Slight)</option>
                  <option value={1.5}>1.5x (Noticeable)</option>
                  <option value={2.0}>2.0x (Double)</option>
                  <option value={3.0}>3.0x (Priority)</option>
                </select>
              </div>
              <button
                type="button"
                className="btn-add-tag"
                onClick={handleAddBoostTag}
                disabled={!newBoostTag.trim() || boostTags.length >= 5}
              >
                + Add Boost
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Live JSON Preview Inspector */}
      <div className="json-preview-card">
        <div className="json-preview-header">
          <div className="json-header-title">
            <span className="code-bracket">{'{ }'}</span>
            <strong>Generated Rule Payload Preview</strong>
          </div>
          <button
            type="button"
            className="btn-copy-code"
            onClick={handleCopyJson}
          >
            {copied ? '✓ Copied!' : '📋 Copy JSON'}
          </button>
        </div>
        <pre className="json-code-block">
          <code>{jsonString}</code>
        </pre>
      </div>

      {/* Save Action Strip */}
      <div className="feed-builder-footer">
        {statusMessage && (
          <div className={`status-toast-strip ${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}

        <div className="footer-actions-row">
          <button
            type="button"
            className="btn-reset-rules"
            onClick={handleResetToDefault}
          >
            ↺ Reset to Default
          </button>

          <button
            type="button"
            className="btn-save-rules"
            onClick={handleSavePreferences}
            disabled={isSaving}
          >
            {isSaving ? 'Saving Rules...' : '💾 Save & Activate Feed Rules'}
          </button>
        </div>
      </div>
    </div>
  );
}
