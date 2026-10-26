import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function GuidePage({ onOpenTour }) {
  const { user } = useAuth();
  const [gpsLoading, setGpsLoading] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [gpsError, setGpsError] = useState(null);

  const hasScoutBadge = Boolean(
    user?.badges?.includes('scout') || user?.onboardingDone
  );

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    setGpsError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGpsLoading(false);
      },
      (err) => {
        setGpsError(err.message || 'Unable to retrieve your location.');
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleLaunchTour = () => {
    if (onOpenTour) onOpenTour();
  };

  return (
    <div className="guide-page-container">
      {/* Hero Header */}
      <header className="guide-hero">
        <div className="guide-hero-badge">OFFICIAL FIELD MANUAL</div>
        <h1 className="guide-hero-title">Scout Field Manual & Briefing</h1>
        <p className="guide-hero-subtitle">
          Oddspot is a living map of real-world weirdness — strange statues, accidental art,
          bizarre signs, and local mysteries you can actually walk up to and visit.
        </p>

        <div className="guide-hero-actions">
          <button
            type="button"
            className="btn-guide-briefing"
            onClick={handleLaunchTour}
          >
            🧭 Launch Interactive 5-Step Briefing
          </button>
          <a href="#/explore" className="btn-guide-secondary">
            🗺️ Open Radar Map
          </a>
        </div>
      </header>

      {/* Mission Tracker Card */}
      <section className="guide-section">
        <div className="first-mission-card guide-mission-card">
          <div className="first-mission-badge-strip">
            <span className="first-mission-tag">MISSION BRIEFING #1</span>
            <span className={`mission-status-pill ${hasScoutBadge ? 'status-claimed' : 'status-pending'}`}>
              {hasScoutBadge ? '🎖️ Scout Badge Awarded' : '⏳ Briefing Incomplete'}
            </span>
          </div>

          <h2 className="first-mission-name">Mission #1: The 1 km Sweep</h2>
          <p className="first-mission-desc">
            Spot something weird within 1 km of where you stand right now — a peculiar sticker, an
            unusual door, a secret sculpture, or strange architecture. Post it to start its Oddometer,
            or discover an anomaly nearby!
          </p>

          <div className="mission-radar-box">
            <div className="mission-radar-header">
              <span className="radar-status-dot" />
              <strong>Local Scout Radar:</strong>
              {userCoords ? (
                <span className="radar-coords-tag">
                  GPS: {userCoords.lat.toFixed(4)}°, {userCoords.lng.toFixed(4)}° (±{userCoords.accuracy}m)
                </span>
              ) : (
                <span className="radar-idle-tag">GPS Standby</span>
              )}
            </div>

            <div className="mission-radar-actions">
              <button
                type="button"
                className="btn-mission-radar"
                onClick={handleGetLocation}
                disabled={gpsLoading}
              >
                {gpsLoading ? '📡 Locking GPS Coordinates...' : '📍 Lock My Current GPS'}
              </button>

              <a href="#/explore" className="btn-mission-action">
                📡 Sweep 1 km on Explore
              </a>
              <a href="#/create" className="btn-mission-action primary">
                ➕ Post a Weird Find
              </a>
            </div>

            {gpsError && (
              <p className="radar-error-msg">⚠️ {gpsError}</p>
            )}
          </div>
        </div>
      </section>

      {/* Section 1: The Oddometer */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <span className="guide-title-icon">⚡</span>
          1. How the Oddometer Works
        </h2>
        <p className="guide-section-intro">
          Every find begins with a score of 0 in its home city. As local scouts engage,
          its Oddometer rises toward Country-Wide status.
        </p>

        <div className="guide-cards-grid">
          <div className="guide-feature-card">
            <div className="feature-icon">👍</div>
            <h3>Scout Upvotes</h3>
            <p className="feature-val">+1 Point</p>
            <p className="feature-desc">
              When a local scout finds an oddity interesting, they give it an eyebrow-raise upvote.
            </p>
          </div>

          <div className="guide-feature-card">
            <div className="feature-icon">💬</div>
            <h3>Field Discussions</h3>
            <p className="feature-val">+3 Points</p>
            <p className="feature-desc">
              Meaningful discussions add 3 points each. Up to 3 unique commenters can contribute
              to prevent single-user comment spam.
            </p>
          </div>

          <div className="guide-feature-card highlight">
            <div className="feature-icon">👟</div>
            <h3>Physical Verified Visits</h3>
            <p className="feature-val">+4 Points</p>
            <p className="feature-desc">
              The highest reward in Oddspot! Scouts who walk within 50m and log a verified check-in
              boost the meter by +4 points.
            </p>
          </div>

          <div className="guide-feature-card">
            <div className="feature-icon">🏆</div>
            <h3>The Country-Wide Ratchet</h3>
            <p className="feature-val">Threshold: 50 Pts</p>
            <p className="feature-desc">
              Once a spot earns 50 points, it is certified Country-Wide! Once promoted, downvotes
              cannot demote it back to a city tier.
            </p>
          </div>
        </div>
      </section>

      {/* Section 2: Real-World Field Visits */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <span className="guide-title-icon">📍</span>
          2. Field Verification & Check-Ins
        </h2>
        <p className="guide-section-intro">
          Oddspot is built for real boots on the ground. Here is how field scouts verify anomalies:
        </p>

        <div className="guide-steps-list">
          <div className="guide-step-card">
            <div className="step-num">A</div>
            <div className="step-content">
              <h3>50-Meter Proximity Verification</h3>
              <p>
                When you stand within 50 meters of an oddity's true coordinates, the "I Visited This"
                button activates. The system computes exact Haversine distance from your device's GPS.
              </p>
            </div>
          </div>

          <div className="guide-step-card">
            <div className="step-num">B</div>
            <div className="step-content">
              <h3>Anti-Spoofing Travel Guard</h3>
              <p>
                To maintain physical integrity, check-ins are audited against impossible travel velocities
                (&gt;500 km/h). Teleportation spoofers are automatically blocked.
              </p>
            </div>
          </div>

          <div className="guide-step-card">
            <div className="step-num">C</div>
            <div className="step-content">
              <h3>Then-and-Now Proof Comparisons</h3>
              <p>
                Check in with a fresh photo and condition report (<em>Still There</em>, <em>Changed</em>, or <em>Gone</em>).
                Your photo is featured in the post's side-by-side Then-and-Now gallery!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Sensitive Spots & Cryptographic Location Fuzzing */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <span className="guide-title-icon">🛡️</span>
          3. Protecting Sensitive & Fragile Places
        </h2>
        <p className="guide-section-intro">
          Some oddities are fragile, on private property edges, or in quiet courtyards.
          Oddspot protects them with state-of-the-art cryptographic location fuzzing.
        </p>

        <div className="guide-privacy-box">
          <div className="privacy-badge">HMAC-SHA256 DETERMINISTIC FUZZING</div>
          <p>
            When <strong>Hide Exact Location</strong> is turned on:
          </p>
          <ul>
            <li>
              <strong>Feeds & APIs:</strong> True coordinates are obfuscated by a 150m to 400m
              radius using a secret cryptographic salt. The exact location is stripped from all feeds,
              single-post responses, and ETags.
            </li>
            <li>
              <strong>Radar Map:</strong> Renders a gentle 400m dashed boundary circle showing the
              approximate area rather than a pinpoint marker.
            </li>
            <li>
              <strong>Arrival Reveal:</strong> When an in-person scout arrives within 300 meters, they can
              tap <em>"I'm Here — Reveal Exact Coordinates"</em>. The unlocked coordinates exist solely in
              memory for that session and are never cached in localStorage.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 4: Markdown & Spoiler Grammar */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <span className="guide-title-icon">📝</span>
          4. Markdown & Spoiler Secrets
        </h2>
        <p className="guide-section-intro">
          Rich text formatting helps you document intricate details without spoiling puzzles for others.
        </p>

        <div className="markdown-guide-table">
          <div className="markdown-guide-row header">
            <span>Syntax</span>
            <span>Rendered Result</span>
            <span>Use Case</span>
          </div>
          <div className="markdown-guide-row">
            <code>&gt;!hidden spoiler!&lt;</code>
            <span className="spoiler-preview">hidden spoiler</span>
            <span>Puzzle answers, exact door codes, or hidden secrets</span>
          </div>
          <div className="markdown-guide-row">
            <code>:::details Title\nContent\n:::</code>
            <span>Collapsible Drawer</span>
            <span>Long field journals, historical transcripts</span>
          </div>
          <div className="markdown-guide-row">
            <code>**Bold** / *Italic*</code>
            <span><strong>Bold</strong> / <em>Italic</em></span>
            <span>Emphasis on safety warnings or key landmarks</span>
          </div>
        </div>
      </section>

      {/* Section 5: Scout Badges */}
      <section className="guide-section">
        <h2 className="guide-section-title">
          <span className="guide-title-icon">🎖️</span>
          5. Scout Badges & Honors
        </h2>
        <div className="guide-badges-grid">
          <div className={`guide-badge-card ${hasScoutBadge ? 'earned' : ''}`}>
            <div className="badge-card-icon">🧭</div>
            <div className="badge-card-info">
              <h3>Field Scout (scout)</h3>
              <p>Completed the official 5-step scout onboarding briefing.</p>
              <span className="badge-status-tag">{hasScoutBadge ? '✓ Earned' : 'Locked'}</span>
            </div>
          </div>

          <div className={`guide-badge-card ${user?.badges?.includes('first_visit') ? 'earned' : ''}`}>
            <div className="badge-card-icon">👟</div>
            <div className="badge-card-info">
              <h3>First Visit (first_visit)</h3>
              <p>Physically verified your first real-world anomaly within 50m.</p>
              <span className="badge-status-tag">
                {user?.badges?.includes('first_visit') ? '✓ Earned' : 'Locked'}
              </span>
            </div>
          </div>

          <div className={`guide-badge-card ${user?.badges?.includes('10_visits') ? 'earned' : ''}`}>
            <div className="badge-card-icon">🏆</div>
            <div className="badge-card-info">
              <h3>Veteran Explorer (10_visits)</h3>
              <p>Logged 10 verified real-world anomaly visits.</p>
              <span className="badge-status-tag">
                {user?.badges?.includes('10_visits') ? '✓ Earned' : 'Locked'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
