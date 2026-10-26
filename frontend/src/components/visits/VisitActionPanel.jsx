// frontend/src/components/visits/VisitActionPanel.jsx
// Signature real-world visit loop UI: live distance & compass bearing,
// "Open in Maps" deep link, "Reveal on Arrival" flow within 300m (session-only),
// and "I Visited This!" GPS check-in modal.

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api';

/**
 * Calculates Haversine distance in meters between two [latitude, longitude] points.
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Calculates compass bearing from observer to destination.
 */
function getCompassBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(((lon2 - lon1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(((lon2 - lon1) * Math.PI) / 180);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  const degrees = Math.round((brng + 360) % 360);
  const compass = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(degrees / 45) % 8;
  return { degrees, direction: compass[index] };
}

export function VisitActionPanel({
  post = {},
  user = null,
  onVisitRecorded = () => {},
  onSpotRevealed = () => {},
  className = '',
}) {
  // Browser user location state
  const [userCoords, setUserCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  // Reveal-on-Arrival state (strictly session memory in component, NEVER cached in localStorage)
  const [revealedCoords, setRevealedCoords] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [revealMessage, setRevealMessage] = useState('');
  const [revealError, setRevealError] = useState('');

  // Check-In Modal state
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [spotStatus, setSpotStatus] = useState(post.spotStatus || 'still_there');
  const [photoUrl, setPhotoUrl] = useState('');
  const [note, setNote] = useState('');
  const [submittingVisit, setSubmittingVisit] = useState(false);
  const [visitError, setVisitError] = useState('');
  const [celebrationToast, setCelebrationToast] = useState('');

  // Spot coordinate resolution: [lng, lat]
  const baseCoords = post.location?.coordinates || [0, 0];
  const isHidden = Boolean(post.hideExact && !revealedCoords);
  const activeCoordinates = revealedCoords || baseCoords; // [lng, lat]
  const spotLng = activeCoordinates[0];
  const spotLat = activeCoordinates[1];

  // Request browser geolocation
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setGeoError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocating(false);
      },
      (err) => {
        setGeoError(err.message || 'Unable to retrieve your location.');
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );
  }, []);

  // Automatically request location once on mount
  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  // Compute live distance and bearing if coordinates are available
  let distanceDisplay = null;
  let bearingInfo = null;

  if (userCoords && spotLat && spotLng) {
    const rawDist = haversineDistanceMeters(
      userCoords.latitude,
      userCoords.longitude,
      spotLat,
      spotLng
    );

    if (isHidden) {
      // Quantize to 500m for hidden posts as per security spec
      const rounded500m = Math.round(rawDist / 500) * 500;
      distanceDisplay = `~${rounded500m}m away (approximate area)`;
    } else {
      distanceDisplay =
        rawDist < 1000 ? `${rawDist}m away` : `${(rawDist / 1000).toFixed(1)} km away`;
      bearingInfo = getCompassBearing(
        userCoords.latitude,
        userCoords.longitude,
        spotLat,
        spotLng
      );
    }
  }

  // Handle Reveal-on-Arrival (POST /api/v1/posts/:id/reveal)
  const handleRevealOnArrival = async () => {
    setRevealError('');
    setRevealMessage('');

    if (!user) {
      setRevealError('Please log in as a scout to reveal exact spot coordinates.');
      return;
    }

    if (!userCoords) {
      requestLocation();
      setRevealError('Waiting for high-accuracy GPS fix. Please ensure location is enabled.');
      return;
    }

    setRevealing(true);
    try {
      const res = await api.revealPost(post._id, userCoords.latitude, userCoords.longitude);
      if (res.location && res.location.coordinates) {
        setRevealedCoords(res.location.coordinates);
        setRevealMessage('✓ Exact spot unlocked! Visible for this active session.');
        onSpotRevealed(res.location.coordinates);
      } else {
        setRevealMessage(res.message || 'Location revealed.');
      }
    } catch (err) {
      setRevealError(
        err.message || 'Failed to reveal spot. Ensure you are within 300 meters of the anomaly.'
      );
    } finally {
      setRevealing(false);
    }
  };

  // Handle "I Visited This!" Check-In (POST /api/v1/posts/:id/visit)
  const handleSubmitVisit = async (e) => {
    e.preventDefault();
    setVisitError('');

    if (!userCoords) {
      setVisitError('High-accuracy GPS location is required to verify your visit.');
      requestLocation();
      return;
    }

    setSubmittingVisit(true);
    try {
      const payload = {
        latitude: userCoords.latitude,
        longitude: userCoords.longitude,
        spotStatus,
        photoUrl: photoUrl.trim() || undefined,
        note: note.trim() || undefined,
      };

      const res = await api.recordVisit(post._id, payload);
      setCelebrationToast('🎉 Verified Visit Logged! +4 Oddometer Points Awarded!');
      onVisitRecorded(res.visit, res.meterScore);
      setShowCheckInModal(false);
      setPhotoUrl('');
      setNote('');

      setTimeout(() => {
        setCelebrationToast('');
      }, 6000);
    } catch (err) {
      setVisitError(err.message || 'Failed to record visit.');
    } finally {
      setSubmittingVisit(false);
    }
  };

  // Open in Maps link (OpenStreetMap deep link with fallback)
  const openStreetMapUrl = `https://www.openstreetmap.org/?mlat=${spotLat}&mlon=${spotLng}#map=16/${spotLat}/${spotLng}`;
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${spotLat},${spotLng}`;

  return (
    <div className={`visit-action-panel ${className}`}>
      {celebrationToast && (
        <div className="celebration-toast" role="status">
          <span className="toast-icon">🏆</span>
          <span className="toast-text">{celebrationToast}</span>
        </div>
      )}

      <div className="visit-panel-card">
        {/* Distance Badge & Compass Bearing */}
        <div className="distance-bearing-row">
          <div className="distance-badge-group">
            <span className="distance-pin-icon">📍</span>
            <span className="distance-text">
              {distanceDisplay ? (
                <strong>{distanceDisplay}</strong>
              ) : locating ? (
                <span className="locating-pulse">Detecting your location...</span>
              ) : (
                <button
                  type="button"
                  className="btn-locate-inline"
                  onClick={requestLocation}
                >
                  📡 Calculate Distance
                </button>
              )}
            </span>

            {bearingInfo && (
              <span
                className="bearing-pill"
                title={`Route Bearing: ${bearingInfo.degrees}° ${bearingInfo.direction}`}
              >
                🧭 {bearingInfo.direction} {bearingInfo.degrees}°
              </span>
            )}

            {revealedCoords && (
              <span className="revealed-session-badge">
                ✓ Exact GPS Unlocked (Session)
              </span>
            )}
          </div>

          {/* Deep link to Open in Maps */}
          <div className="maps-deep-links">
            <a
              href={openStreetMapUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-maps btn-osm"
              title="Open location in OpenStreetMap in a new tab"
            >
              🗺️ Open in OpenStreetMap
            </a>
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-maps btn-gmaps"
              title="Open in Google Maps"
            >
              📍 Google Maps
            </a>
          </div>
        </div>

        {geoError && (
          <div className="visit-geo-warning">
            <span>⚠️ {geoError}</span>
            <button type="button" className="btn-retry-geo" onClick={requestLocation}>
              Retry GPS
            </button>
          </div>
        )}

        {/* Action Button Row */}
        <div className="visit-cta-row">
          {/* Reveal on Arrival flow for hidden spots */}
          {post.hideExact && !revealedCoords && (
            <div className="reveal-arrival-box">
              <button
                type="button"
                className="btn-reveal-arrival"
                onClick={handleRevealOnArrival}
                disabled={revealing}
              >
                {revealing ? 'Validating Proximity...' : "🎯 I'm Here — Reveal Exact Coordinates (within 300m)"}
              </button>
              <small className="reveal-subnote">
                Arrival reveal verifies GPS is within 300m and unlocks exact pin for your session.
              </small>
            </div>
          )}

          {revealMessage && <div className="alert-success-soft">{revealMessage}</div>}
          {revealError && <div className="alert-error-soft">{revealError}</div>}

          {/* "I Visited This!" GPS Check-In Button */}
          <button
            type="button"
            className="btn-visited-checkin"
            onClick={() => {
              setVisitError('');
              requestLocation();
              setShowCheckInModal(true);
            }}
          >
            🧭 I Visited This Spot! (GPS Check-In)
          </button>
        </div>
      </div>

      {/* "I Visited This!" Check-In Modal */}
      {showCheckInModal && (
        <div className="modal-backdrop" onClick={() => setShowCheckInModal(false)}>
          <div
            className="modal-content modal-visit"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="visit-modal-title"
          >
            <div className="modal-header">
              <h3 id="visit-modal-title">🧭 Log Verified GPS Visit</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowCheckInModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <p className="visit-modal-subtitle">
              Verify your presence at <strong>{post.title}</strong> within 50 meters to award +4 Oddometer points and earn badges.
            </p>

            {/* GPS Signal Status Bar */}
            <div className={`gps-status-pill ${userCoords ? 'gps-locked' : 'gps-searching'}`}>
              <span className="gps-dot" />
              <span>
                {userCoords
                  ? `GPS Locked: ±${Math.round(userCoords.accuracy || 10)}m accuracy`
                  : locating
                  ? 'Acquiring high-accuracy GPS fix...'
                  : 'GPS location needed.'}
              </span>
              {!userCoords && (
                <button type="button" className="btn-gps-refresh" onClick={requestLocation}>
                  Retry GPS
                </button>
              )}
            </div>

            {visitError && <div className="alert-error">{visitError}</div>}

            <form onSubmit={handleSubmitVisit} className="form-stack">
              {/* Spot Condition Selector */}
              <div className="form-group">
                <label htmlFor="spotStatus">
                  <strong>Spot Condition Today:</strong>
                </label>
                <div className="status-radio-group">
                  <label className={`status-radio-label ${spotStatus === 'still_there' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="spotStatus"
                      value="still_there"
                      checked={spotStatus === 'still_there'}
                      onChange={(e) => setSpotStatus(e.target.value)}
                    />
                    <span className="status-icon">🟢</span>
                    <span>Still there (Confirmed)</span>
                  </label>
                  <label className={`status-radio-label ${spotStatus === 'changed' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="spotStatus"
                      value="changed"
                      checked={spotStatus === 'changed'}
                      onChange={(e) => setSpotStatus(e.target.value)}
                    />
                    <span className="status-icon">🟡</span>
                    <span>Changed or decaying</span>
                  </label>
                  <label className={`status-radio-label ${spotStatus === 'gone' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="spotStatus"
                      value="gone"
                      checked={spotStatus === 'gone'}
                      onChange={(e) => setSpotStatus(e.target.value)}
                    />
                    <span className="status-icon">🔴</span>
                    <span>Gone / Demolished</span>
                  </label>
                </div>
              </div>

              {/* Then-and-Now Photo Proof URL */}
              <div className="form-group">
                <label htmlFor="visitPhotoUrl">
                  Then-and-Now Photo Proof URL <em>(Optional)</em>:
                </label>
                <input
                  id="visitPhotoUrl"
                  type="url"
                  placeholder="https://images.oddspot.test/photo.jpg"
                  value={photoUrl}
                  onChange={(e) => setPhotoUrl(e.target.value)}
                  maxLength={500}
                />
                <small className="form-hint">
                  Provide an image URL to show the anomaly as it looks today.
                </small>
              </div>

              {/* Field Note */}
              <div className="form-group">
                <label htmlFor="visitNote">
                  Field Note <em>(Optional)</em>:
                </label>
                <textarea
                  id="visitNote"
                  rows={3}
                  placeholder="Any access obstacles, demolished details, or new quirks noticed..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                />
                <div className="char-count">{note.length} / 500</div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCheckInModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingVisit || !userCoords}
                >
                  {submittingVisit ? 'Verifying GPS & Logging...' : 'Confirm & Log Visit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default VisitActionPanel;
