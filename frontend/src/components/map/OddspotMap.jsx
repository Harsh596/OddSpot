import { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { clusterMarkers } from '../../utils/mapCluster';

/**
 * Creates custom HTML divIcon for cluster markers
 * Circular badge with #18181B dark charcoal center, #FFB300 3px border ring, and monospace count
 */
function createClusterIcon(count) {
  let size = 38;
  if (count >= 20) {
    size = 48;
  } else if (count >= 5) {
    size = 42;
  }

  return L.divIcon({
    html: `
      <div class="oddspot-cluster-badge" style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: #18181B;
        color: #FFFFFF;
        border: 3px solid #FFB300;
        box-shadow: 0 4px 14px rgba(24, 24, 27, 0.35);
        font-weight: 800;
        font-family: 'JetBrains Mono', var(--font-mono, monospace);
        text-align: center;
        font-size: ${size >= 48 ? '14px' : '12px'};
        user-select: none;
        display: flex;
        align-items: center;
        justify-content: center;
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
 * Creates custom SVG divIcon for public spot pins
 * Crisp custom SVG pin in #FF6F00 with #FFFFFF inner core and #FFB300 active ring when selected
 */
function createSpotPinIcon(post, isSelected = false) {
  const pinWidth = isSelected ? 38 : 32;
  const pinHeight = isSelected ? 46 : 40;
  const label = post?.title ? (post.title.length > 18 ? post.title.slice(0, 16) + '...' : post.title) : '';
  const refNum = post?._id ? `#${String(post._id).slice(-3)}` : '';

  const svg = `
    <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none;">
      <svg width="${pinWidth}" height="${pinHeight}" viewBox="0 0 32 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 0C7.16344 0 0 7.16344 0 16C0 26.5 16 40 16 40C16 40 32 26.5 32 16C32 7.16344 24.8366 0 16 0Z" fill="${isSelected ? '#B83818' : '#C2410C'}" filter="drop-shadow(0 3px 6px rgba(184, 56, 24, 0.45))"/>
        <circle cx="16" cy="16" r="8" fill="#FFFFFF"/>
        <path d="M12 16C12 13.7909 13.7909 12 16 12C18.2091 12 20 13.7909 20 16C20 18.2091 18.2091 20 16 20" stroke="#B83818" stroke-width="2" stroke-linecap="round"/>
        <circle cx="16" cy="16" r="2.5" fill="#B83818"/>
      </svg>
      ${isSelected ? `<div style="margin-top: -2px; background: rgba(24, 24, 27, 0.90); backdrop-filter: blur(4px); color: #FFFFFF; font-family: 'JetBrains Mono', monospace; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; white-space: nowrap; border: 1px solid rgba(255, 179, 0, 0.6); box-shadow: 0 2px 6px rgba(0,0,0,0.3);"><span style="color: #FFB300;">●</span> ${label} ${refNum}</div>` : ''}
    </div>
  `;

  return L.divIcon({
    html: svg,
    className: 'oddspot-spot-icon',
    iconSize: [pinWidth, pinHeight + (isSelected ? 20 : 0)],
    iconAnchor: [pinWidth / 2, pinHeight],
    popupAnchor: [0, -pinHeight],
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
      font-family: var(--font-sans, 'Plus Jakarta Sans', system-ui, sans-serif);
      color: var(--text-primary, #18181B);
      background: var(--bg-surface, #FFFFFF);
      border-radius: var(--radius-md, 10px);
      max-width: 250px;
      padding: 6px;
    ">
      ${
        hasImage
          ? `<img src="${post.images[0].url}" alt="${title}" style="
              width: 100%;
              height: 110px;
              object-fit: cover;
              border-radius: var(--radius-sm, 8px);
              margin-bottom: 8px;
            "/>`
          : ''
      }
      <div style="display: flex; gap: 4px; margin-bottom: 6px; flex-wrap: wrap;">
        <span style="
          font-size: 10px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: var(--radius-full, 9999px);
          background: var(--accent-subtle, #FFF7ED);
          color: var(--accent-cta, #C2410C);
          border: 1px solid var(--accent-border, #FDBA74);
          text-transform: uppercase;
        ">${tier} TIER</span>
        ${
          isHidden
            ? `<span style="
                font-size: 10px;
                font-weight: 700;
                padding: 2px 7px;
                border-radius: var(--radius-full, 9999px);
                background: #FEF3C7;
                color: #B45309;
                border: 1px dashed #FFB300;
                font-family: var(--font-mono, monospace);
              ">[ 🔒 ~400m Zone ]</span>`
            : ''
        }
      </div>
      <h4 style="margin: 0 0 4px; font-size: 14px; font-weight: 800; line-height: 1.3; color: var(--text-primary, #18181B);">
        ${title}
      </h4>
      <div style="font-size: 11px; color: var(--text-secondary, #524C46); margin-bottom: 8px;">
        📍 ${city ? `${city}, ` : ''}${country} · <strong>Score: ${score}</strong>
      </div>
      <a href="#/post/${post._id}" style="
        display: inline-block;
        font-size: 12px;
        font-weight: 700;
        color: var(--accent-text, #B45309);
        text-decoration: underline;
        transition: color 0.15s ease;
      ">Inspect Spot Details →</a>
    </div>
  `;
}

/**
 * OddspotMap - Interactive Leaflet Map with OpenStreetMap tiles,
 * deterministic marker clustering, SVG spot pins, and 400m uncertainty circles.
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

      // CartoDB Voyager tiles matching screenshot (authenticated with Carto API key when configured)
      const cartoKey = import.meta.env.VITE_CARTO_API_KEY;
      const tileUrl = cartoKey
        ? `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=${encodeURIComponent(cartoKey)}`
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

      L.tileLayer(tileUrl, {
        attribution:
          '&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
        subdomains: 'abcd',
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Render clusters, SVG pins, and 400m dashed uncertainty circles
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    // Group posts using Web Mercator clustering
    const clusters = clusterMarkers(posts, currentZoom, clusterRadiusPx);

    for (const item of clusters) {
      if (item.isCluster) {
        // Multi-post cluster marker with charcoal center and amber border
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
        const isHidden = post.hideExact === true || post.fuzzed === true || post.location?.fuzzed === true;
        const isSelected = selectedPostId && String(post._id) === String(selectedPostId);

        if (isHidden) {
          // Render ONLY the 400m dashed amber-orange uncertainty circle with floating label - never a sharp pin
          const privacyCircle = L.circle([item.lat, item.lng], {
            radius: 400,
            color: '#B45309',
            fillColor: '#FEF3C7',
            fillOpacity: 0.28,
            dashArray: '5, 5',
            weight: 2,
          });

          privacyCircle.bindPopup(buildPopupContent(post, true));
          privacyCircle.bindTooltip('🔊 400m FUZZED PERIMETER', {
            permanent: true,
            direction: 'center',
            className: 'privacy-zone-label',
          });

          privacyCircle.on('click', () => {
            onSelectPost(post);
          });

          layerGroup.addLayer(privacyCircle);
        } else {
          // Exact SVG pin for public spots
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

    // Render live scout beacon at center
    if (center && center.length === 2) {
      const beaconHtml = `
        <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; user-select: none;">
          <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: rgba(37, 99, 235, 0.2); border: 1.5px solid #3B82F6;"></div>
          <div style="width: 12px; height: 12px; border-radius: 50%; background: #2563EB; border: 2.5px solid #FFFFFF; box-shadow: 0 0 8px rgba(37, 99, 235, 0.8);"></div>
        </div>
      `;
      const beaconIcon = L.divIcon({
        html: beaconHtml,
        className: 'scout-beacon-marker',
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      const beaconMarker = L.marker(center, { icon: beaconIcon, zIndexOffset: 500 });
      beaconMarker.bindTooltip('SCOUT BEACON (±4m)', {
        permanent: true,
        direction: 'bottom',
        offset: [0, 8],
        className: 'scout-beacon-tooltip',
      });
      layerGroup.addLayer(beaconMarker);
    }
  }, [posts, currentZoom, clusterRadiusPx, selectedPostId, onSelectPost, center]);

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
        border: '1px solid var(--border-subtle, #ECE7DF)',
        boxShadow: 'var(--shadow-card, 0 1px 3px rgba(24, 24, 27, 0.05))',
        background: 'var(--bg-surface, #FFFFFF)',
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

      {/* Top-Right Map Controls matching Screenshot 1 */}
      <div
        className="map-top-right-controls"
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: '8px',
        }}
      >
        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--border-subtle, #ECE7DF)',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(24, 24, 27, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomIn()}
            aria-label="Zoom in"
            style={{ width: '36px', height: '36px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid #ECE7DF' }}
          >
            +
          </button>
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.zoomOut()}
            aria-label="Zoom out"
            style={{ width: '36px', height: '36px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid #ECE7DF' }}
          >
            −
          </button>
          <button
            type="button"
            onClick={handleRecenter}
            aria-label="Locate scout"
            style={{ width: '36px', height: '36px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '16px', color: '#B83818' }}
          >
            🧭
          </button>
        </div>

        <div
          style={{
            background: '#FFFFFF',
            border: '1px solid var(--border-subtle, #ECE7DF)',
            borderRadius: '6px',
            padding: '3px 8px',
            fontSize: '10.5px',
            fontFamily: 'var(--font-mono, monospace)',
            fontWeight: 700,
            color: 'var(--text-secondary, #524C46)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            boxShadow: '0 2px 6px rgba(24, 24, 27, 0.06)',
          }}
        >
          <span style={{ color: '#059669', fontSize: '12px' }}>⟐</span>
          <span>Carto-Voyager</span>
        </div>
      </div>

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
            background: 'var(--bg-surface, #FFFFFF)',
            color: 'var(--text-primary, #18181B)',
            border: '1px solid var(--border-strong, #D6CEC2)',
            borderRadius: 'var(--radius-md, 8px)',
            boxShadow: 'var(--shadow-md, 0 4px 14px rgba(24, 24, 27, 0.08))',
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
            background: 'var(--bg-glass, rgba(255, 253, 249, 0.86))',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle, #ECE7DF)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '8px 12px',
            fontSize: '11px',
            color: 'var(--text-secondary, #524C46)',
            display: 'flex',
            gap: '12px',
            boxShadow: 'var(--shadow-xs, 0 1px 2px rgba(24, 24, 27, 0.04))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#FF6F00', fontWeight: 900 }}>📍</span>
            <span>Public Spot Pin</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ color: '#EA580C', fontWeight: 900 }}>◌</span>
            <span>400m Uncertainty Area</span>
          </div>
        </div>
      </div>
    </div>
  );
}
