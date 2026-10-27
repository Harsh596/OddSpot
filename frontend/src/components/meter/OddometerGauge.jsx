import { useState, useEffect, useId } from 'react';

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
      color: '#C2410C', // deep ember
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
      color: '#EA580C', // sunset orange
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
      color: '#D97706', // warm amber
      icon: '🤨',
      description: 'Turning heads and raising eyebrows in the neighborhood.',
    };
  }
  return {
    key: 'local',
    label: 'Local Whisper',
    shortLabel: 'Local Whisper',
    badgeClass: 'stage-local',
    color: '#FFB300', // marigold yellow
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
  _tier = 'city',
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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--badge-gold-bg, #FEF3C7)',
        border: '1px solid var(--badge-gold-border, #FDBA74)',
        borderRadius: '9999px',
        padding: '3px 10px',
        fontSize: '12px',
        fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
        fontWeight: 700,
        color: 'var(--badge-gold-text, #92400E)',
      }}
    >
      <span aria-hidden="true">{stage.icon}</span>
      <span style={{ color: 'var(--accent, #FF6F00)', fontWeight: 800 }}>{s} pts</span>
      {showStage && (
        <span style={{ fontSize: '10px', color: 'var(--badge-gold-text, #92400E)', fontWeight: 600, opacity: 0.85 }}>
          {stage.shortLabel}
        </span>
      )}
    </div>
  );
}

/**
 * Precision Instrument <OddometerGauge />
 * Styled like a high-precision Braun / Tailwind benchmark dial on a warm white/amber card.
 */
export default function OddometerGauge({
  post = {},
  _isAuthor = false,
  className = '',
}) {
  const reactId = useId();
  const gradientId = `odometer-grad-${reactId.replace(/:/g, '')}`;
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

  // Clamped percentage 0..100
  const pct = Math.min(100, Math.max(0, Math.round((score / countryThreshold) * 100)));
  const stage = getMeterStage(score, countryThreshold);

  // Prefers-reduced-motion detection
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [animatedPct, setAnimatedPct] = useState(0);
  const [showTable, setShowTable] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mql.matches);

    const handler = (e) => setPrefersReducedMotion(e.matches);
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
    }
    return () => {
      if (mql.removeEventListener) {
        mql.removeEventListener('change', handler);
      }
    };
  }, []);

  useEffect(() => {
    if (prefersReducedMotion) {
      setAnimatedPct(pct);
    } else {
      const timer = setTimeout(() => {
        setAnimatedPct(pct);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [pct, prefersReducedMotion]);

  // SVG Geometry: Center: (100, 100), Radius: 75. Semicircle arc length = π * 75 ≈ 235.619
  const ARC_LENGTH = 235.619;
  const strokeOffset = ARC_LENGTH * (1 - animatedPct / 100);
  const needleAngle = -90 + (animatedPct / 100) * 180;

  const city = post.place?.city || 'this sector';
  const country = post.place?.country || 'the country';

  return (
    <div
      className={`odometer-card ${className}`}
      role="meter"
      aria-label={label}
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={countryThreshold}
      aria-valuetext={`${score} of ${countryThreshold} points - ${stage.label}`}
      style={{
        background: 'var(--bg-surface, #FFFFFF)',
        border: '1px solid var(--border-subtle, #ECE7DF)',
        borderRadius: '16px',
        boxShadow: 'var(--shadow-card, 0 1px 3px rgba(0, 0, 0, 0.05))',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Precision Instrument Inner Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          background: 'var(--bg-card-inner, #FFF7ED)',
          borderBottom: '1px solid var(--border-subtle, #ECE7DF)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '1.25rem' }}>⚡</span>
          <span
            style={{
              fontFamily: 'var(--font-heading, "Plus Jakarta Sans", sans-serif)',
              fontWeight: 800,
              fontSize: '0.95rem',
              color: 'var(--text-primary, #18181B)',
              letterSpacing: '-0.01em',
            }}
          >
            {label} Precision Instrument
          </span>
          <span
            style={{
              fontSize: '10px',
              fontFamily: 'var(--font-mono, monospace)',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'var(--badge-gold-bg, rgba(245, 158, 11, 0.15))',
              color: 'var(--badge-gold-text, #92400E)',
              border: '1px solid var(--badge-gold-border, rgba(245, 158, 11, 0.35))',
            }}
          >
            {tier.toUpperCase()} TIER
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowTable((prev) => !prev)}
          style={{
            cursor: 'pointer',
            background: 'var(--btn-secondary-bg, #FFFFFF)',
            border: '1px solid var(--btn-secondary-border, #ECE7DF)',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '11px',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 700,
            color: 'var(--btn-secondary-text, #524C46)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 120ms ease',
          }}
          aria-expanded={showTable}
        >
          <span>{showTable ? 'Hide Formula' : 'Formula & Weights'}</span>
          <span>{showTable ? '▲' : '▼'}</span>
        </button>
      </div>

      {/* Main Radial Benchmark Dial Body */}
      <div
        style={{
          padding: '1.5rem 1.25rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
        }}
      >
        <svg
          viewBox="0 0 200 120"
          style={{ width: '100%', maxWidth: '280px', overflow: 'visible' }}
          aria-hidden="true"
        >
          <defs>
            {/* Smooth SVG LinearGradient: Marigold -> Sunset Orange -> Deep Ember */}
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#FFB300" />
              <stop offset="50%" stopColor="#FF6F00" />
              <stop offset="100%" stopColor="#C2410C" />
            </linearGradient>
            <filter id="dial-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Background Track Arc */}
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke="var(--meter-gauge-track, var(--border-subtle, #ECE7DF))"
            strokeWidth="12"
            strokeLinecap="round"
          />

          {/* Precision Benchmark Ticks at 0, 15, 35, 50 */}
          {/* Tick 0 (180 deg) */}
          <line x1="25" y1="100" x2="15" y2="100" stroke="var(--border-subtle, #D6CEC2)" strokeWidth="2" strokeLinecap="round" />
          <text x="10" y="103" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="var(--text-muted, #655E56)" textAnchor="end">0</text>

          {/* Tick 15 (30% -> 126 deg) */}
          <line x1="56" y1="56" x2="50" y2="49" stroke="var(--border-subtle, #D6CEC2)" strokeWidth="2" strokeLinecap="round" />
          <text x="44" y="47" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="var(--text-muted, #655E56)" textAnchor="end">15</text>

          {/* Tick 35 (70% -> 54 deg) */}
          <line x1="144" y1="56" x2="150" y2="49" stroke="var(--border-subtle, #D6CEC2)" strokeWidth="2" strokeLinecap="round" />
          <text x="156" y="47" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="var(--text-muted, #655E56)" textAnchor="start">35</text>

          {/* Tick 50 (0 deg) */}
          <line x1="175" y1="100" x2="185" y2="100" stroke="var(--border-subtle, #D6CEC2)" strokeWidth="2" strokeLinecap="round" />
          <text x="190" y="103" fontSize="8" fontFamily="JetBrains Mono, monospace" fill="var(--text-muted, #655E56)" textAnchor="start">{countryThreshold}</text>

          {/* Active Gradient Arc */}
          <path
            d="M 25 100 A 75 75 0 0 1 175 100"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={ARC_LENGTH}
            strokeDashoffset={strokeOffset}
            filter="url(#dial-glow)"
            style={{
              transition: prefersReducedMotion ? 'none' : 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />

          {/* Dial Needle */}
          <g
            transform={`rotate(${needleAngle} 100 100)`}
            style={{
              transition: prefersReducedMotion ? 'none' : 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <path
              d="M 97.5 100 L 99.2 38 A 1 1 0 0 1 100.8 38 L 102.5 100 Z"
              fill="var(--text-primary, #18181B)"
            />
            <circle cx="100" cy="100" r="7.5" fill="var(--bg-surface, #FFFFFF)" stroke="var(--text-primary, #18181B)" strokeWidth="2.5" />
            <circle cx="100" cy="100" r="3" fill="var(--accent, #FF6F00)" />
          </g>
        </svg>

        {/* Center Score Readout in JetBrains Mono tabular nums */}
        <div style={{ marginTop: '-15px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
              fontVariantNumeric: 'tabular-nums',
              fontSize: '2.25rem',
              fontWeight: 800,
              color: 'var(--text-primary, #18181B)',
              lineHeight: 1,
            }}
          >
            {score}
          </div>

          <div style={{ fontSize: '11px', color: 'var(--text-muted, #655E56)', fontFamily: 'var(--font-mono, monospace)', marginTop: '2px' }}>
            TOTAL SIGNAL POINTS
          </div>

          {/* Stage Badge with theme-adaptive contrast tokens */}
          <div
            style={{
              marginTop: '8px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--badge-gold-bg, #FEF3C7)',
              color: 'var(--badge-gold-text, #92400E)',
              border: '1px solid var(--badge-gold-border, #FDBA74)',
              borderRadius: '9999px',
              padding: '4px 12px',
              fontWeight: 700,
              fontSize: '0.8125rem',
            }}
          >
            <span>{stage.icon}</span>
            <span>{stage.label}</span>
          </div>

          <p style={{ margin: '8px 0 0', fontSize: '0.8125rem', color: 'var(--text-secondary, #524C46)', maxWidth: '420px', lineHeight: 1.45 }}>
            {stage.description}
          </p>
        </div>
      </div>

      {/* Interactive Signal Breakdown Table (Exact Formula Weights) */}
      {showTable && (
        <div
          style={{
            margin: '0 1.25rem 1rem',
            padding: '1rem',
            background: 'var(--bg-card-inner, #FFF7ED)',
            border: '1px solid var(--border-subtle, #ECE7DF)',
            borderRadius: '10px',
            fontSize: '0.8125rem',
          }}
        >
          <div style={{ fontWeight: 800, color: 'var(--text-primary, #18181B)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Verified Signal Breakdown</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', color: 'var(--accent, #FF6F00)' }}>
              Formula Total: {score} pts
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px 12px', alignItems: 'center', fontFamily: 'var(--font-mono, monospace)' }}>
            <span style={{ color: 'var(--text-secondary, #524C46)' }}>⚡ Animated Reactions:</span>
            <span style={{ color: 'var(--text-muted, #655E56)', textAlign: 'right' }}>{reactions} × (+5)</span>
            <span style={{ fontWeight: 700, color: 'var(--badge-green-text, #059669)', textAlign: 'right' }}>+{(reactions * 5).toFixed(0)}</span>

            <span style={{ color: 'var(--text-secondary, #524C46)' }}>📍 Verified Physical Visits (50m):</span>
            <span style={{ color: 'var(--text-muted, #655E56)', textAlign: 'right' }}>{visits} × (+4)</span>
            <span style={{ fontWeight: 700, color: 'var(--badge-green-text, #059669)', textAlign: 'right' }}>+{(visits * 4).toFixed(0)}</span>

            <span style={{ color: 'var(--text-secondary, #524C46)' }}>👥 Unique Commenters:</span>
            <span style={{ color: 'var(--text-muted, #655E56)', textAlign: 'right' }}>{commenters} × (+3)</span>
            <span style={{ fontWeight: 700, color: 'var(--badge-green-text, #059669)', textAlign: 'right' }}>+{(commenters * 3).toFixed(0)}</span>

            <span style={{ color: 'var(--text-secondary, #524C46)' }}>👍 Upvotes / Likes:</span>
            <span style={{ color: 'var(--text-muted, #655E56)', textAlign: 'right' }}>{likes} × (+1)</span>
            <span style={{ fontWeight: 700, color: 'var(--badge-green-text, #059669)', textAlign: 'right' }}>+{(likes * 1).toFixed(0)}</span>

            <span style={{ color: 'var(--text-secondary, #524C46)' }}>👎 Downvotes / Dislikes:</span>
            <span style={{ color: 'var(--text-muted, #655E56)', textAlign: 'right' }}>{dislikes} × (-0.5)</span>
            <span style={{ fontWeight: 700, color: 'var(--badge-red-text, #DC2626)', textAlign: 'right' }}>-{(dislikes * 0.5).toFixed(1)}</span>
          </div>

          <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle, #ECE7DF)', fontSize: '11px', color: 'var(--text-muted, #655E56)' }}>
            Oddometer scores ratchet forward with physical GPS visits and peer verification.
          </div>
        </div>
      )}

      {/* Next-Tier Progress Bar */}
      <div
        style={{
          padding: '12px 18px',
          borderTop: '1px solid var(--border-subtle, #ECE7DF)',
          background: 'var(--bg-card-inner, rgba(255, 255, 255, 0.7))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: 'var(--text-muted, #655E56)', marginBottom: '6px' }}>
          <span>0 (Local)</span>
          <span style={{ color: 'var(--accent, #FF6F00)', fontWeight: 700 }}>
            {tier === 'country' ? '🌟 Certified Country Oddity!' : `${pointsToNextTier} pts to Country-Wide`}
          </span>
          <span>{countryThreshold} (Country Tier)</span>
        </div>

        <div style={{ width: '100%', height: '8px', background: 'var(--border-subtle, #ECE7DF)', borderRadius: '9999px', overflow: 'hidden' }}>
          <div
            style={{
              width: `${pct}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #FFB300, #FF6F00, #C2410C)',
              borderRadius: '9999px',
              transition: prefersReducedMotion ? 'none' : 'width 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          />
        </div>

        {tier === 'city' && !underReview ? (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary, #524C46)' }}>
            🚀 <strong>{pointsToNextTier} more points</strong> needed to elevate this discovery from <strong>{city}</strong> to national notice across <strong>{country}</strong>!
          </div>
        ) : tier === 'country' ? (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--accent, #C2410C)', fontWeight: 600 }}>
            🏆 <strong>Certified Oddity!</strong> This find broke out of {city} and reached country-wide spotlight!
          </div>
        ) : null}
      </div>
    </div>
  );
}
