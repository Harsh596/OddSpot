// frontend/src/components/meter/OddometerGauge.jsx
// Signature visual Oddometer animated radial SVG gauge, signal breakdown tooltip,
// and next-tier progress bar for OddSpot.

import React, { useState, useEffect, useId } from 'react';

/**
 * Returns stage metadata based on Oddometer score and country threshold.
 * Stages:
 * - 0..14: "Local Whisper"
 * - 15..34: "Neighborhood Eyebrow-Raiser"
 * - 35..threshold-1: "City Sensation"
 * - >= threshold: "Country-Wide Certified Oddity!"
 */
export function getMeterStage(score = 0, countryThreshold = 50) {
  const s = Number(score) || 0;
  const thresh = Number(countryThreshold) || 50;

  if (s >= thresh) {
    return {
      key: 'country',
      label: 'Country-Wide Certified Oddity!',
      shortLabel: 'Certified Oddity',
      badgeClass: 'stage-country',
      color: '#10b981', // emerald
      gradient: ['#06b6d4', '#f59e0b', '#f97316', '#10b981'],
      icon: '🌟',
      description: 'Nationally certified weirdness! Visible across the entire country.',
    };
  }
  if (s >= 35) {
    return {
      key: 'city',
      label: 'City Sensation',
      shortLabel: 'City Sensation',
      badgeClass: 'stage-city',
      color: '#f97316', // electric orange
      gradient: ['#06b6d4', '#f59e0b', '#f97316'],
      icon: '🔥',
      description: 'Trending and buzzing across the entire city!',
    };
  }
  if (s >= 15) {
    return {
      key: 'neighborhood',
      label: 'Neighborhood Eyebrow-Raiser',
      shortLabel: 'Eyebrow-Raiser',
      badgeClass: 'stage-neighborhood',
      color: '#f59e0b', // amber
      gradient: ['#06b6d4', '#f59e0b'],
      icon: '🤨',
      description: 'Turning heads and raising eyebrows in the neighborhood.',
    };
  }
  return {
    key: 'local',
    label: 'Local Whisper',
    shortLabel: 'Local Whisper',
    badgeClass: 'stage-local',
    color: '#06b6d4', // cyan
    gradient: ['#06b6d4'],
    icon: '🤫',
    description: 'A quiet, hidden gem known only to local scouts nearby.',
  };
}

/**
 * Compact feed card meter pill.
 */
export function OddometerPill({
  score = 0,
  countryThreshold = 50,
  label = 'Oddometer',
  tier = 'city',
  size = 'md',
  showStage = false,
  className = '',
}) {
  const stage = getMeterStage(score, countryThreshold);
  const s = Number(score) || 0;
  const thresh = Number(countryThreshold) || 50;
  const pct = Math.min(100, Math.max(0, Math.round((s / thresh) * 100)));

  return (
    <div
      className={`odometer-pill size-${size} ${stage.badgeClass} ${className}`}
      title={`${label}: ${s} pts (${stage.label}) · ${pct}% to Country-Wide`}
      role="meter"
      aria-label={label}
      aria-valuenow={s}
      aria-valuemin={0}
      aria-valuemax={thresh}
      aria-valuetext={`${s} points - ${stage.label}`}
    >
      <span className="odometer-pill-icon">{stage.icon}</span>
      <span className="odometer-pill-score">{s}</span>
      {showStage && <span className="odometer-pill-stage">{stage.shortLabel}</span>}
      <div className="odometer-pill-track">
        <div
          className="odometer-pill-bar"
          style={{ width: `${pct}%`, backgroundColor: stage.color }}
        />
      </div>
    </div>
  );
}

/**
 * OddometerGauge Component
 * Signature animated radial SVG gauge with needle arc, signal breakdown tooltip,
 * and next-tier progress bar.
 */
export default function OddometerGauge({
  post = {},
  isAuthor = false,
  className = '',
}) {
  const gradientId = useId ? `odometer-grad-${useId().replace(/:/g, '')}` : 'odometer-grad-main';
  const meterData = post.meter || {};

  const label = meterData.label || 'Oddometer';
  const score = Number(meterData.score) || 0;
  const countryThreshold = Number(meterData.countryThreshold) || 50;
  const tier = post.tier || 'city';
  const underReview = Boolean(post.underReview);

  const likes = Number(meterData.likes) || 0;
  const dislikes = Number(meterData.dislikes) || 0;
  const comments = Number(meterData.comments) || 0;
  const commenters = Number(meterData.commenters !== undefined ? meterData.commenters : comments);
  const visits = Number(meterData.visits) || 0;
  const reactions = Number(meterData.reactions) || 0;

  // Next-tier calculation
  const pointsToNextTier =
    meterData.pointsToNextTier !== undefined
      ? Number(meterData.pointsToNextTier)
      : tier === 'country'
      ? 0
      : Math.max(0, countryThreshold - score);

  // Percentage clamped 0..100
  const pct = Math.min(100, Math.max(0, Math.round((score / countryThreshold) * 100)));

  const stage = getMeterStage(score, countryThreshold);

  // Prefers-reduced-motion detection
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [animatedPct, setAnimatedPct] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mql.matches);

    const handler = (e) => setPrefersReducedMotion(e.matches);
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
    } else if (mql.addListener) {
      mql.addListener(handler);
    }
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handler);
      } else if (mql.removeListener) {
        mql.removeListener(handler);
      }
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setAnimatedPct(pct);
    } else {
      // Smooth animated entry
      const timer = setTimeout(() => {
        setAnimatedPct(pct);
      }, 60);
      return () => clearTimeout(timer);
    }
  }, [pct, prefersReducedMotion]);

  // SVG Arc Geometry:
  // Center: (100, 95), Radius: 75
  // Semicircle: from (25, 95) through (100, 20) to (175, 95)
  // Total circumference of half-circle: π * 75 ≈ 235.619
  const ARC_LENGTH = 235.619;
  const strokeOffset = ARC_LENGTH * (1 - animatedPct / 100);

  // Needle angle: -90deg at 0% (pointing left), +90deg at 100% (pointing right)
  const needleAngle = -90 + (animatedPct / 100) * 180;

  const city = post.place?.city || 'your city';
  const country = post.place?.country || 'the country';

  return (
    <div
      className={`odometer-card ${stage.badgeClass} ${className}`}
      role="meter"
      aria-label={label}
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={countryThreshold}
      aria-valuetext={`${score} of ${countryThreshold} points - ${stage.label}`}
    >
      {/* Gauge Header */}
      <div className="odometer-header">
        <div className="odometer-title-group">
          <span className="odometer-icon-pulse">{stage.icon}</span>
          <h3 className="odometer-title">{label}</h3>
          <span className="odometer-tier-tag">{tier.toUpperCase()} TIER</span>
        </div>

        {/* Signal Breakdown Toggle / Tooltip */}
        <div className="odometer-tooltip-container">
          <button
            type="button"
            className="odometer-info-btn"
            onClick={() => setShowTooltip((prev) => !prev)}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
            aria-label="View Oddometer score signal breakdown"
            aria-expanded={showTooltip}
          >
            ℹ️ Signals
          </button>

          {showTooltip && (
            <div className="odometer-tooltip-popover" role="tooltip">
              <div className="tooltip-header">
                <strong>{label} Signal Breakdown</strong>
                <span className="tooltip-score-badge">{score} pts</span>
              </div>
              <ul className="tooltip-signals-list">
                <li>
                  <span className="signal-label">👍 Likes (+1 pt each):</span>
                  <span className="signal-val">
                    {likes} ({(likes * 1).toFixed(0)} pts)
                  </span>
                </li>
                <li>
                  <span className="signal-label">👎 Dislikes (-0.5 pt each):</span>
                  <span className="signal-val">
                    {dislikes} ({(dislikes * -0.5).toFixed(1)} pts)
                  </span>
                </li>
                <li>
                  <span className="signal-label">💬 Comments (+3 pts each):</span>
                  <span className="signal-val">
                    {comments} ({(comments * 3).toFixed(0)} pts)
                  </span>
                </li>
                <li>
                  <span className="signal-label">👥 Unique Commenters:</span>
                  <span className="signal-val">{commenters} scouts</span>
                </li>
                <li>
                  <span className="signal-label">📍 Verified GPS Visits (+4 pts each):</span>
                  <span className="signal-val">
                    {visits} ({(visits * 4).toFixed(0)} pts)
                  </span>
                </li>
                {reactions > 0 && (
                  <li>
                    <span className="signal-label">⚡ Animated Reactions (+5 pts):</span>
                    <span className="signal-val">
                      {reactions} ({(reactions * 5).toFixed(0)} pts)
                    </span>
                  </li>
                )}
              </ul>
              <div className="tooltip-footer">
                Tiers only move up! Score ratchets automatically.
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Radial SVG Gauge Display */}
      <div className="odometer-visual-container">
        <svg
          viewBox="0 0 200 120"
          className="odometer-svg"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="35%" stopColor="#f59e0b" />
              <stop offset="70%" stopColor="#f97316" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
            <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Track Arc */}
          <path
            d="M 25 95 A 75 75 0 0 1 175 95"
            fill="none"
            stroke="#27272a"
            strokeWidth="14"
            strokeLinecap="round"
            className="odometer-track"
          />

          {/* Semicircle Stage Tick Indicators */}
          <line x1="25" y1="95" x2="16" y2="95" stroke="#52525b" strokeWidth="2" strokeLinecap="round" />
          <line x1="56" y1="51" x2="49" y2="45" stroke="#52525b" strokeWidth="2" strokeLinecap="round" />
          <line x1="144" y1="51" x2="151" y2="45" stroke="#52525b" strokeWidth="2" strokeLinecap="round" />
          <line x1="175" y1="95" x2="184" y2="95" stroke="#52525b" strokeWidth="2" strokeLinecap="round" />

          {/* Active Animated Progress Arc */}
          <path
            d="M 25 95 A 75 75 0 0 1 175 95"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={strokeOffset}
            filter="url(#gauge-glow)"
            className={`odometer-arc ${prefersReducedMotion ? 'no-transition' : ''}`}
          />

          {/* Eyebrow / Needle Indicator */}
          <g
            className={`odometer-needle-group ${prefersReducedMotion ? 'no-transition' : ''}`}
            transform={`rotate(${needleAngle} 100 95)`}
          >
            {/* Tapered needle pointer */}
            <path
              d="M 97.5 95 L 99.2 30 A 1 1 0 0 1 100.8 30 L 102.5 95 Z"
              fill={stage.color}
              className="odometer-needle"
            />
            {/* Needle Pivot Cap */}
            <circle cx="100" cy="95" r="7.5" fill="#18181b" stroke={stage.color} strokeWidth="2.5" />
            <circle cx="100" cy="95" r="3" fill={stage.color} />
          </g>
        </svg>

        {/* Center Score & Stage Reading */}
        <div className="odometer-reading">
          <div className="odometer-score-num" style={{ color: stage.color }}>
            {score}
          </div>
          <div className="odometer-stage-badge">
            <span className="stage-badge-icon">{stage.icon}</span>
            <span className="stage-badge-label">{stage.label}</span>
          </div>
        </div>
      </div>

      {/* Encouraging Stage Description */}
      <p className="odometer-stage-desc">{stage.description}</p>

      {/* Next-Tier Progress Bar */}
      <div className="odometer-progress-container">
        <div className="odometer-progress-labels">
          <span className="prog-label-left">0 (Local)</span>
          <span className="prog-label-center">
            {tier === 'country'
              ? '🌟 Max Tier Achieved!'
              : `${pointsToNextTier} more to Country-Wide`}
          </span>
          <span className="prog-label-right">{countryThreshold} (Country)</span>
        </div>
        <div className="odometer-progress-track">
          <div
            className="odometer-progress-fill"
            style={{
              width: `${pct}%`,
              background: `linear-gradient(90deg, #06b6d4, ${stage.color})`,
            }}
          />
        </div>
      </div>

      {/* Poster Callout Banner */}
      {tier === 'city' && !underReview ? (
        <div className="odometer-callout-banner banner-city">
          <span className="banner-icon">🚀</span>
          <span className="banner-text">
            <strong>{pointsToNextTier} more {label} points</strong> to spread from{' '}
            <strong>{city}</strong> across <strong>{country}</strong>!
          </span>
        </div>
      ) : tier === 'country' ? (
        <div className="odometer-callout-banner banner-country">
          <span className="banner-icon">🏆</span>
          <span className="banner-text">
            <strong>Certified Oddity!</strong> This discovery has broken out of{' '}
            <strong>{city}</strong> and is spreading across all of <strong>{country}</strong>!
          </span>
        </div>
      ) : underReview ? (
        <div className="odometer-callout-banner banner-review">
          <span className="banner-icon">⚠️</span>
          <span className="banner-text">
            This spot is currently under community scout review.
          </span>
        </div>
      ) : null}
    </div>
  );
}
