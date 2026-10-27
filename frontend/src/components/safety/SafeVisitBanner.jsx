// frontend/src/components/safety/SafeVisitBanner.jsx
// High-visibility safety callout banners for PostDetail.
// Computes real-time local solar time at the spot's longitude and renders actionable caution guidance.

import React, { useMemo } from 'react';
import { getLocalSolarTime } from '../../utils/safety';

export { getLocalSolarTime };

export function SafeVisitBanner({ post }) {
  if (!post) return null;

  const warnings = Array.isArray(post.warnings) ? post.warnings : [];
  const coordinates = post.location?.coordinates;
  const longitude = Array.isArray(coordinates) ? coordinates[0] : null;

  const solar = useMemo(() => getLocalSolarTime(longitude), [longitude]);

  const hasPrivate = warnings.includes('private_property');
  const hasNight = warnings.includes('unsafe_night');
  const hasWalking = warnings.includes('walking_required');
  const hasOther = warnings.includes('other');
  const isNightAtLocation = solar?.isNight;

  // If there are no warning tags and it's daylight, nothing critical to show
  if (!hasPrivate && !hasNight && !hasWalking && !hasOther && !isNightAtLocation) {
    return null;
  }

  return (
    <aside className="safe-visit-banner-wrapper" aria-label="Field Safety and Location Advisories">
      {/* 1. Real-time Solar Night Warning or Tagged Night Warning */}
      {(isNightAtLocation || hasNight) && (
        <div className={`safety-banner-alert alert-night ${isNightAtLocation && hasNight ? 'urgent' : ''}`}>
          <div className="banner-icon" aria-hidden="true">🌙</div>
          <div className="banner-body">
            <strong>
              {isNightAtLocation
                ? `Nighttime Advisory (~${solar?.timeString} local solar time)`
                : 'Daylight Visit Recommended'}
            </strong>
            <p>
              {hasNight
                ? 'The author flagged this spot as poorly lit or isolated after dark. Daylight visit strongly recommended.'
                : 'It is currently night at this location. Exercise extra vigilance, bring hands-free lighting, and respect neighborhood and park curfews.'}
            </p>
          </div>
        </div>
      )}

      {/* 2. Private Property Callout */}
      {hasPrivate && (
        <div className="safety-banner-alert alert-property">
          <div className="banner-icon" aria-hidden="true">🚫</div>
          <div className="banner-body">
            <strong>Private Property Boundary</strong>
            <p>
              Respect boundaries — view from public right-of-way only; never trespass on private grounds or open closed gates.
            </p>
          </div>
        </div>
      )}

      {/* 3. Walking Required Callout */}
      {hasWalking && (
        <div className="safety-banner-alert alert-walking">
          <div className="banner-icon" aria-hidden="true">🥾</div>
          <div className="banner-body">
            <strong>Foot Access Only</strong>
            <p>
              Foot access only — wear sturdy shoes, stay on marked trails, and bring water for the hike.
            </p>
          </div>
        </div>
      )}

      {/* 4. Other Caution Callout */}
      {hasOther && (
        <div className="safety-banner-alert alert-caution">
          <div className="banner-icon" aria-hidden="true">⚠️</div>
          <div className="banner-body">
            <strong>Scout Caution Advised</strong>
            <p>
              Caution advised — review scout field notes, weather conditions, and terrain before visiting.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}

export default SafeVisitBanner;
