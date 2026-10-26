import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clusterMarkers } from '../../utils/mapCluster';

/**
 * Creates custom HTML divIcon for cluster markers
 */
function createClusterIcon(count) {
  let sizeClass = 'cluster-sm';
  let size = 36;
  if (count >= 20) {
    sizeClass = 'cluster-lg';
    size = 48;
  } else if (count >= 5) {
    sizeClass = 'cluster-md';
    size = 42;
  }

  return L.divIcon({
    html: `
      <div class="oddspot-cluster-badge ${sizeClass}" style="
        width: ${size}px;
        height: ${size}px;
        line-height: ${size}px;
        border-radius: 50%;
        background: var(--bg-surface, #121722);
        color: var(--accent, #00f0ff);
        border: 2px solid var(--accent, #00f0ff);
        box-shadow: 0 0 12px rgba(0, 240, 255, 0.45);
        font-weight: 800;
        font-family: var(--font-mono, monospace);
        text-align: center;
        font-size: 13px;
        user-select: none;
      ">
        ${count}
      </div>
    `,
    className: 'oddspot-cluster-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Creates custom HTML divIcon for exact spot pins
 */
function createSpotPinIcon(post, isSelected = false) {
  const score = post.meter?.score ?? 0;
  const borderColor = isSelected ? 'var(--accent, #00f0ff)' : 'var(--border-strong, #2f3b54)';
  const glow = isSelected ? '0 0 14px var(--accent, #00f0ff)' : '0 2px 8px rgba(0,0,0,0.4)';

  return L.divIcon({
    html: `
      <div class="oddspot-pin ${isSelected ? 'selected' : ''}" style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        background: var(--bg-surface, #121722);
        border: 2px solid ${borderColor};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        box-shadow: ${glow};
        cursor: pointer;
      ">
        <span style="
          transform: rotate(45deg);
          font-size: 13px;
          line-height: 1;
        ">
          👁️
        </span>
      </div>
    `,
    className: 'oddspot-spot-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

/**
 * Creates privacy center icon for fuzzed/hidden spots
 */
function createPrivacyCenterIcon(isSelected = false) {
  return L.divIcon({
    html: `
      <div class="privacy-dot" style="
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--accent-secondary, #ff007f);
        border: 2px solid #ffffff;
        box-shadow: 0 0 8px rgba(255, 0, 127, 0.6);
        cursor: pointer;
      "></div>
    `,
    className: 'privacy-center-icon',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -10],
  });
}

/**
 * Builds HTML string for popup cards
 */
function buildPopupContent(post, isHidden = false) {
  const hasImage = post.images && post.images.length > 0;
  const title = post.title || 'Untitled Spot';
  const city = post.place?.city || '';
  const country = post.place?.country || '';
  const score = post.meter?.score ?? 0;
  const tier = (post.tier || 'city').toUpperCase();

  return `
    <div class="map-popup-card" style="
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0b0e14;
      max-width: 240px;
      padding: 4px;
    ">
      ${
        hasImage
          ? `<img src="${post.images[0].url}" alt="${title}" style="
              width: 100%;
              height: 110px;
              object-fit: cover;
              border-radius: 6px;
              margin-bottom: 6px;
            " />`
          : ''
      }
      <div style="display: flex; gap: 4px; margin-bottom: 4px; align-items: center; flex-wrap: wrap;">
        <span style="
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          background: #e0f2fe;
          color: #0369a1;
        ">${tier} TIER</span>
        ${
          isHidden
            ? `<span style="
                font-size: 10px;
                font-weight: 700;
                padding: 2px 6px;
                border-radius: 4px;
                background: #fdf2f8;
                color: #be185d;
                border: 1px dashed #f472b6;
              ">Approximate Area</span>`
            : ''
        }
      </div>
      <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 700; line-height: 1.3;">
        ${title}
      </h4>
      <div style="font-size: 11px; color: #475569; margin-bottom: 6px;">
        📍 ${city ? `${city}, ` : ''}${country} · <strong>Score: ${score}</strong>
      </div>
      <a href="#/post/${post._id}" style="
        display: inline-block;
        font-size: 12px;
        font-weight: 600;
        color: #0284c7;
        text-decoration: underline;
      ">Inspect Spot Details →</a>
    </div>
  `;
}

/**
 * OddspotMap - Interactive Leaflet Map with OpenStreetMap tiles,
 * deterministic marker clustering, privacy circles, and responsive viewport sizing.
 */
export function OddspotMap({
  posts = [],
  center = [12.9716, 77.5946],
  zoom = 13,
  selectedPostId = null,
  onSelectPost = () => {},
  clusterRadiusPx = 50,
  style = {},
  className = '',
}) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const layerGroupRef = useRef(null);
  const userMarkerRef = useRef(null);
  const [currentZoom, setCurrentZoom] = useState(zoom);

  // Initialize Leaflet map instance on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center,
        zoom,
        zoomControl: true,
        attributionControl: true,
      });

      // Standard OpenStreetMap tiles (no API keys required)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      // Dedicated layer group for clustering
      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;

      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update center when prop changes significantly
  useEffect(() => {
    if (mapInstanceRef.current && center && center.length === 2) {
      const currentCenter = mapInstanceRef.current.getCenter();
      const dist = Math.sqrt(
        Math.pow(currentCenter.lat - center[0], 2) + Math.pow(currentCenter.lng - center[1], 2)
      );
      if (dist > 0.001) {
        mapInstanceRef.current.setView(center, mapInstanceRef.current.getZoom(), {
          animate: true,
        });
      }
    }
  }, [center]);

  // Render clusters, markers, and 400m dashed privacy circles
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // Group posts using Web Mercator clustering
    const clusters = clusterMarkers(posts, currentZoom, clusterRadiusPx);

    for (const item of clusters) {
      if (item.isCluster) {
        // Multi-post cluster marker
        const marker = L.marker([item.lat, item.lng], {
          icon: createClusterIcon(item.count),
        });

        marker.on('click', () => {
          if (item.bounds) {
            map.fitBounds(
              [
                [item.bounds.minLat, item.bounds.minLng],
                [item.bounds.maxLat, item.bounds.maxLng],
              ],
              { padding: [50, 50], maxZoom: 18 }
            );
          } else {
            map.setView([item.lat, item.lng], currentZoom + 2);
          }
        });

        marker.bindTooltip(`${item.count} Oddities in this sector`, { direction: 'top' });
        layerGroup.addLayer(marker);
      } else {
        // Single post
        const post = item.post;
        const isHidden = post.hideExact === true || post.fuzzed === true;
        const isSelected = selectedPostId && String(post._id) === String(selectedPostId);

        if (isHidden) {
          // Task F2-T2 Requirement: If post.hideExact === true or post.fuzzed === true,
          // render a 400m dashed circle labeled "Approximate Area" instead of an exact pin.
          const circleColor = isSelected ? '#00f0ff' : '#d946ef';
          const privacyCircle = L.circle([item.lat, item.lng], {
            radius: 400, // 400m radius as specified
            color: circleColor,
            dashArray: '6, 8',
            weight: 2,
            fillColor: circleColor,
            fillOpacity: 0.16,
          });

          privacyCircle.bindPopup(buildPopupContent(post, true));
          privacyCircle.bindTooltip('Approximate Area (within 400m)', {
            permanent: false,
            direction: 'center',
            className: 'privacy-tooltip',
          });

          privacyCircle.on('click', () => {
            onSelectPost(post);
          });

          layerGroup.addLayer(privacyCircle);

          // Add a subtle central indicator dot for easy clickability
          const centerDot = L.marker([item.lat, item.lng], {
            icon: createPrivacyCenterIcon(isSelected),
          });
          centerDot.bindPopup(buildPopupContent(post, true));
          centerDot.on('click', () => onSelectPost(post));
          layerGroup.addLayer(centerDot);
        } else {
          // Exact pin for public spots
          const pinMarker = L.marker([item.lat, item.lng], {
            icon: createSpotPinIcon(post, isSelected),
          });

          pinMarker.bindPopup(buildPopupContent(post, false));
          pinMarker.on('click', () => {
            onSelectPost(post);
          });

          layerGroup.addLayer(pinMarker);
        }
      }
    }
  }, [posts, currentZoom, clusterRadiusPx, selectedPostId, onSelectPost]);

  // Recenter handler
  const handleRecenter = useCallback(() => {
    if (mapInstanceRef.current && center) {
      mapInstanceRef.current.setView(center, 13, { animate: true });
    }
  }, [center]);

  return (
    <div
      className={`oddspot-map-wrapper ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '480px',
        borderRadius: 'var(--radius-lg, 14px)',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle, #202738)',
        boxShadow: 'var(--shadow-card, 0 4px 16px rgba(0,0,0,0.4))',
        background: 'var(--bg-surface, #121722)',
        ...style,
      }}
    >
      <div
        ref={mapContainerRef}
        className="map-leaflet-container"
        style={{
          width: '100%',
          height: '100%',
          zIndex: 1,
        }}
      />

      {/* Recenter & Map Legend Controls */}
      <div
        className="map-overlay-controls"
        style={{
          position: 'absolute',
          bottom: '16px',
          right: '16px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          alignItems: 'flex-end',
        }}
      >
        <button
          type="button"
          onClick={handleRecenter}
          title="Recenter Map to Your Sector"
          aria-label="Recenter map"
          style={{
            cursor: 'pointer',
            padding: '8px 14px',
            background: 'var(--bg-surface, #121722)',
            color: 'var(--text-primary, #f0f4fc)',
            border: '1px solid var(--border-strong, #2f3b54)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: 'var(--shadow-md, 0 4px 12px rgba(0,0,0,0.5))',
            fontSize: '12px',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>🎯</span>
          <span>Recenter</span>
        </button>

        <div
          className="map-legend"
          style={{
            background: 'var(--bg-glass, rgba(18, 23, 34, 0.9))',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle, #202738)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '8px 12px',
            fontSize: '11px',
            color: 'var(--text-secondary, #94a3b8)',
            display: 'flex',
            gap: '12px',
            boxShadow: 'var(--shadow-sm, 0 2px 8px rgba(0,0,0,0.3))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>👁️</span>
            <span>Exact Pin</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#d946ef', fontWeight: 900 }}>◌</span>
            <span>400m Privacy Area</span>
          </div>
        </div>
      </div>
    </div>
  );
}
