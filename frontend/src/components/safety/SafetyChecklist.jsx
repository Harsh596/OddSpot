// frontend/src/components/safety/SafetyChecklist.jsx
// Proactive privacy, trespass, and sensitive place warnings for spot creation.

import React from 'react';

export function SafetyChecklist({
  hideExact,
  onEnableHideExact,
  warnings = [],
  _latitude,
  _longitude,
}) {
  const isPrivateProperty = warnings.includes('private_property');
  const isUnsafeNight = warnings.includes('unsafe_night');
  const isWalkingRequired = warnings.includes('walking_required');

  return (
    <div className="safety-checklist-container" role="region" aria-label="Scout Safety and Privacy Checklist">
      <div className="safety-checklist-header">
        <span className="safety-icon" aria-hidden="true">🛡️</span>
        <div>
          <h4>Scout Safety &amp; Real-World Privacy Guide</h4>
          <p className="safety-subtitle">
            Oddspot thrives on ethical, respectful real-world exploration.
          </p>
        </div>
      </div>

      {/* Mandatory Core Privacy Rule */}
      <div className="safety-card safety-rule-card">
        <div className="safety-rule-badge">CRITICAL RULE</div>
        <p>
          <strong>Never post someone's private home interior, school grounds, or restricted facility.</strong>{' '}
          All finds must be observable from public right-of-ways without trespassing.
        </p>
      </div>

      {/* Dynamic Private Property Recommendation */}
      {isPrivateProperty && (
        <div className={`safety-recommendation-card ${hideExact ? 'resolved' : 'urgent'}`}>
          <div className="recommendation-header">
            <span className="rec-icon">{hideExact ? '🔒' : '⚠️'}</span>
            <div className="rec-text">
              <strong>Private Property Notice</strong>
              <p>
                {hideExact
                  ? 'Location fuzzing is active! Approximate coordinates (150–400m HMAC fuzz) will be shown publicly to protect property boundaries.'
                  : 'This spot touches private property — we strongly recommend enabling "Hide Exact Location" so only approximate coordinates (150–400m fuzz) are shown.'}
              </p>
            </div>
          </div>
          {!hideExact && (
            <button
              type="button"
              className="btn-enable-fuzz"
              onClick={() => onEnableHideExact(true)}
              aria-label="Enable Hide Exact Location"
            >
              🔒 Enable Hide Exact
            </button>
          )}
        </div>
      )}

      {/* Night Advisory Notice if selected */}
      {isUnsafeNight && (
        <div className="safety-advisory-pill night-pill">
          <span>🌙 <strong>Night Warning Tagged:</strong> Fellow scouts will be advised to visit strictly during daylight hours.</span>
        </div>
      )}

      {/* Walking Required Notice if selected */}
      {isWalkingRequired && (
        <div className="safety-advisory-pill walk-pill">
          <span>🥾 <strong>Foot Access Tagged:</strong> Visitors will be reminded to wear sturdy footwear and prepare for off-road walking.</span>
        </div>
      )}

      {/* 4-Item Quick Ethical Scout Checklist */}
      <div className="checklist-items-grid">
        <div className="checklist-item">
          <span className="check-bullet">👁️</span>
          <div>
            <strong>Public Sightlines</strong>
            <p>Ensure the oddity is clearly visible without stepping over fences, gates, or private thresholds.</p>
          </div>
        </div>

        <div className="checklist-item">
          <span className="check-bullet">🚫</span>
          <div>
            <strong>No Doxxing</strong>
            <p>Blur or exclude identifiable license plates, house numbers, and resident faces from photos.</p>
          </div>
        </div>

        <div className="checklist-item">
          <span className="check-bullet">⏱️</span>
          <div>
            <strong>Curfews &amp; Hours</strong>
            <p>Note park opening hours, dusk closures, or neighborhood quiet curfews in your description.</p>
          </div>
        </div>

        <div className="checklist-item">
          <span className="check-bullet">🌿</span>
          <div>
            <strong>Leave No Trace</strong>
            <p>Scouts observe only. Never damage, paint, alter, or remove artifacts from their natural setting.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SafetyChecklist;
