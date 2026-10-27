// frontend/src/pages/CreatePost.jsx
// Post creation form supporting 'find' vs 'identify' types, MarkdownEditor with live preview,
// Field Guide template shortcut, privacy-preserving draft autosaving, live 64x64px photo preview with validation,
// direct upload sign flow with allowlist fallback, and 200px map preview.

import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { MarkdownEditor } from '../components/markdown/MarkdownEditor';
import { SafetyChecklist } from '../components/safety/SafetyChecklist';
import { OddspotMap } from '../components/map/OddspotMap';

const DRAFT_STORAGE_KEY = 'oddspot_draft_post';

// 4 Curated Anomaly Photos for 1-click local testing in Allowlist Mode
const SAMPLE_PHOTOS = [
  {
    title: 'Neon Geometry',
    subtitle: 'Vibrant geometric installation',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80',
  },
  {
    title: 'Curious Room',
    subtitle: 'Atmospheric antique study corner',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
  },
  {
    title: 'Arcade Artifact',
    subtitle: 'Retro glowing coin-op machine',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=800&q=80',
  },
  {
    title: 'Street Art Oddity',
    subtitle: 'Surreal mural painted on brick facade',
    url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?auto=format&fit=crop&w=800&q=80',
  },
];

export function CreatePost({ navigate }) {
  const { user } = useAuth();

  const [type, setType] = useState('find'); // 'find' | 'identify'
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [country, setCountry] = useState('');
  const [images, setImages] = useState(['']);
  const [tags, setTags] = useState('');
  const [hideExact, setHideExact] = useState(false);
  const [warnings, setWarnings] = useState([]);

  // Image validation status and upload popover state
  const [imageStatus, setImageStatus] = useState({}); // { [index]: 'loading' | 'valid' | 'error' }
  const [activeUploadIndex, setActiveUploadIndex] = useState(null);
  const [showAllowlistModal, setShowAllowlistModal] = useState(false);
  const [targetImageIndex, setTargetImageIndex] = useState(0);

  const [geoLoading, setGeoLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hasDraft, setHasDraft] = useState(false);

  const initialLoadedRef = useRef(false);

  // 1. Load draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const draft = JSON.parse(saved);
        if (draft.type) setType(draft.type);
        if (draft.title) setTitle(draft.title);
        if (draft.body) setBody(draft.body);
        if (draft.city) setCity(draft.city);
        if (draft.state) setState(draft.state);
        if (draft.country) setCountry(draft.country);
        if (draft.tags) setTags(draft.tags);
        if (draft.hideExact !== undefined) setHideExact(draft.hideExact);
        if (!draft.hideExact) {
          if (draft.latitude) setLatitude(draft.latitude);
          if (draft.longitude) setLongitude(draft.longitude);
        }
        if (draft.warnings && Array.isArray(draft.warnings)) {
          setWarnings(draft.warnings);
        }
        if (draft.images && Array.isArray(draft.images) && draft.images.length > 0) {
          setImages(draft.images);
        }
        setHasDraft(true);
      }
    } catch {
      // Ignore corrupted localStorage data
    } finally {
      initialLoadedRef.current = true;
    }
  }, []);

  // 2. Autosave draft on form changes (excluding GPS when hideExact is true)
  useEffect(() => {
    if (!initialLoadedRef.current) return;

    const draft = {
      type,
      title,
      body,
      city,
      state,
      country,
      tags,
      hideExact,
      warnings,
      images,
      // Privacy rule: Exclude GPS when hideExact is checked
      latitude: hideExact ? '' : latitude,
      longitude: hideExact ? '' : longitude,
    };

    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
      setHasDraft(true);
    } catch {
      // Ignore quota exceeded errors
    }
  }, [
    type,
    title,
    body,
    latitude,
    longitude,
    city,
    state,
    country,
    tags,
    hideExact,
    warnings,
    images,
  ]);

  const handleClearDraft = () => {
    if (window.confirm('Clear your saved draft?')) {
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      setType('find');
      setTitle('');
      setBody('');
      setLatitude('');
      setLongitude('');
      setCity('');
      setState('');
      setCountry('');
      setImages(['']);
      setTags('');
      setHideExact(false);
      setWarnings([]);
      setHasDraft(false);
      setError('');
      setImageStatus({});
    }
  };

  if (!user) {
    return (
      <div className="auth-card">
        <h2>Sign In Required</h2>
        <p>You must be logged in as an Oddspot scout to post a find.</p>
        <button className="btn-primary" onClick={() => navigate('#/login')}>
          Log In
        </button>
      </div>
    );
  }

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }

    setGeoLoading(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setGeoLoading(false);
      },
      (err) => {
        setError(`Unable to retrieve location: ${err.message}`);
        setGeoLoading(false);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleImageChange = (index, value) => {
    const updated = [...images];
    updated[index] = value;
    setImages(updated);
    setImageStatus((prev) => ({
      ...prev,
      [index]: value.trim().startsWith('https://') ? 'loading' : 'idle',
    }));
  };

  const handleAddImageField = () => {
    if (images.length < 6) {
      setImages([...images, '']);
    }
  };

  const handleRemoveImageField = (index) => {
    if (images.length > 1) {
      setImages(images.filter((_, i) => i !== index));
      setImageStatus((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    } else {
      setImages(['']);
      setImageStatus({});
    }
  };

  // Upload Sign Flow with 501 Allowlist Popover fallback
  const handleUploadClick = async (idx) => {
    setTargetImageIndex(idx);
    setActiveUploadIndex(idx);
    try {
      await api.signUpload({
        filename: `scout-photo-${Date.now()}.jpg`,
        contentType: 'image/jpeg',
      });
      // In production cloud mode this returns pre-signed url
    } catch {
      // 501 UPLOAD_PROVIDER_DISABLED or test mode: show allowlist popover
      setShowAllowlistModal(true);
    } finally {
      setActiveUploadIndex(null);
    }
  };

  const handleSelectSample = (sampleUrl) => {
    handleImageChange(targetImageIndex, sampleUrl);
    setShowAllowlistModal(false);
  };

  const handleWarningToggle = (val) => {
    setWarnings((prev) =>
      prev.includes(val) ? prev.filter((w) => w !== val) : [...prev, val]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side validations
    const cleanTitle = title.trim();
    if (!cleanTitle) {
      setError('Please provide a title for your find.');
      return;
    }
    if (cleanTitle.length > 140) {
      setError('Title must not exceed 140 characters.');
      return;
    }

    const latNum = parseFloat(latitude);
    const lngNum = parseFloat(longitude);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setError('Latitude must be a valid number between -90 and 90.');
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setError('Longitude must be a valid number between -180 and 180.');
      return;
    }

    const cleanCity = city.trim();
    const cleanCountry = country.trim();
    if (!cleanCity) {
      setError('City is required.');
      return;
    }
    if (!cleanCountry) {
      setError('Country is required.');
      return;
    }

    // Filter and validate image URLs
    const filteredImages = images.map((img) => img.trim()).filter(Boolean);
    if (filteredImages.length > 6) {
      setError('A maximum of 6 images is allowed.');
      return;
    }

    for (let i = 0; i < filteredImages.length; i++) {
      if (!filteredImages[i].startsWith('https://')) {
        setError(
          `Image #${i + 1} must be an HTTPS URL (e.g. https://...). Only URLs are stored.`
        );
        return;
      }
    }

    const cleanTags = tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    setSubmitting(true);
    try {
      const res = await api.createPost({
        type,
        title: cleanTitle,
        body: body.trim(),
        latitude: latNum,
        longitude: lngNum,
        city: cleanCity,
        state: state.trim(),
        country: cleanCountry,
        images: filteredImages.map((url) => ({ url })),
        tags: cleanTags,
        warnings,
        hideExact,
      });

      // Clear draft upon successful publication
      localStorage.removeItem(DRAFT_STORAGE_KEY);

      navigate(`#/post/${res._id}`);
    } catch (err) {
      setError(err.message || 'Failed to publish post.');
    } finally {
      setSubmitting(false);
    }
  };

  // Live coordinates check for map preview
  const latNum = parseFloat(latitude);
  const lngNum = parseFloat(longitude);
  const hasValidCoords =
    !isNaN(latNum) &&
    latNum >= -90 &&
    latNum <= 90 &&
    !isNaN(lngNum) &&
    lngNum >= -180 &&
    lngNum <= 180;

  return (
    <div className="form-page-container">
      <div
        className="form-header-row"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h2>Post a New Find</h2>
          <p className="subtitle">
            Document an oddity or ask the community to identify a mystery spot.
          </p>
        </div>
        {hasDraft && (
          <button
            type="button"
            className="btn-secondary"
            onClick={handleClearDraft}
            title="Discard current draft"
            style={{
              minHeight: '44px',
              padding: '10px 18px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              whiteSpace: 'nowrap',
              fontWeight: 600,
            }}
          >
            Clear Saved Draft
          </button>
        )}
      </div>

      {error && <div className="alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="form-stack">
        {/* Post Type Selector */}
        <div className="post-type-selector">
          <button
            type="button"
            className={`type-select-btn ${type === 'find' ? 'active' : ''}`}
            onClick={() => setType('find')}
          >
            📍 Odd Spot Find
            <small>Share a weird place or curious object you located</small>
          </button>
          <button
            type="button"
            className={`type-select-btn ${type === 'identify' ? 'active' : ''}`}
            onClick={() => setType('identify')}
          >
            ❓ Help Me Identify This
            <small>Ask the community to solve what or where this is</small>
          </button>
        </div>

        <label>
          Title *
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              type === 'identify'
                ? 'e.g. Strange stone archway deep in the woods—what is this?'
                : 'e.g. Abandoned telephone booth engulfed in vines'
            }
            maxLength={140}
            required
          />
          <small className="help-text">{title.length}/140 characters</small>
        </label>

        {/* Markdown Editor with Field Guide Template & Live Preview */}
        <MarkdownEditor
          id="post-body-editor"
          label="Description & Field Notes"
          value={body}
          onChange={setBody}
          rows={6}
          maxLength={10000}
          showTemplateButton={true}
          placeholder="How did you stumble upon it? What makes it bizarre? Use >!spoiler!< for secrets or :::details Title for collapsible sections."
        />

        <div className="form-section">
          <SafetyChecklist
            hideExact={hideExact}
            onEnableHideExact={setHideExact}
            warnings={warnings}
            latitude={latitude}
            longitude={longitude}
          />
        </div>

        <div className="form-section">
          <h3>Location Coordinates *</h3>
          <div className="coords-row">
            <label>
              Latitude
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="12.9716"
                required
              />
            </label>
            <label>
              Longitude
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="77.5946"
                required
              />
            </label>
          </div>

          {/* Responsive Action Grid for Location Detection */}
          <div style={{ marginTop: '10px' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleUseCurrentLocation}
              disabled={geoLoading}
              style={{
                minHeight: '44px',
                padding: '10px 20px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
            >
              {geoLoading ? 'Detecting GPS...' : '📍 Use Current Location'}
            </button>
          </div>

          {/* Fuzzed Circle & Pin Preview Map */}
          {hasValidCoords && (
            <div
              className="coords-map-preview-card"
              style={{
                marginTop: '16px',
                borderRadius: 'var(--radius-md, 10px)',
                overflow: 'hidden',
                border: '1px solid var(--border-subtle, #E4E4E7)',
                background: 'var(--bg-surface, #FFFFFF)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--advisory-bg, #FFF7ED)',
                  borderBottom: '1px solid var(--advisory-border, #FED7AA)',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: 'var(--advisory-text, #9A3412)',
                }}
              >
                <span>🗺️ Live Geospatial Verification Preview</span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', var(--font-mono, monospace)",
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: hideExact ? 'var(--badge-gold-bg, #FEF3C7)' : 'var(--badge-green-bg, #DCFCE7)',
                    color: hideExact ? 'var(--badge-gold-text, #92400E)' : 'var(--badge-green-text, #166534)',
                    border: `1px solid ${hideExact ? 'var(--badge-gold-border, #F59E0B)' : 'var(--badge-green-border, #86EFAC)'}`,
                  }}
                >
                  {hideExact ? '🔒 400m Privacy Circle' : '📍 Exact Pin'}
                </span>
              </div>
              <div style={{ height: '200px', width: '100%' }}>
                <OddspotMap
                  posts={[
                    {
                      _id: 'draft-preview',
                      title: title || 'Draft Spot Location',
                      location: { coordinates: [lngNum, latNum] },
                      hideExact,
                      tier: 'city',
                      place: { city, state, country },
                    },
                  ]}
                  center={[latNum, lngNum]}
                  zoom={14}
                  style={{ height: '200px', width: '100%' }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="form-section">
          <h3>Place Metadata *</h3>
          <div className="place-row">
            <label>
              City *
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Bengaluru"
                required
              />
            </label>
            <label>
              State / Region
              <input
                type="text"
                value={state}
                onChange={(e) => setState(e.target.value)}
                placeholder="Karnataka"
              />
            </label>
            <label>
              Country *
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="India"
                required
              />
            </label>
          </div>
        </div>

        <div className="form-section">
          <div className="checkbox-wrap">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={hideExact}
                onChange={(e) => setHideExact(e.target.checked)}
              />
              <strong>Hide exact location</strong>
            </label>
            <p className="field-note">
              Use this for private homes, sensitive ruins, or safety spots. (Coordinates are excluded from draft storage when enabled).
            </p>
          </div>
        </div>

        {/* Photo URLs with Live 64x64 Thumbnail Preview, Validation & Upload Flow */}
        <div className="form-section">
          <h3>Photo URLs (HTTPS only, max 6)</h3>
          <p className="field-note">
            Paste direct HTTPS image links (e.g. Unsplash, Wikimedia, Imgur, Cloudinary). Live previews and validation badges update instantly.
          </p>

          <div className="image-inputs-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {images.map((imgUrl, idx) => {
              const cleanUrl = imgUrl ? imgUrl.trim() : '';
              const isValidHttps = cleanUrl.startsWith('https://');

              return (
                <div
                  key={idx}
                  className="image-input-item"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px',
                    borderRadius: 'var(--radius-md, 8px)',
                    background: 'var(--bg-surface, #FFFFFF)',
                    border: '1px solid var(--border-subtle, #E4E4E7)',
                  }}
                >
                  {/* 64x64px Live Thumbnail Preview Box */}
                  <div
                    style={{
                      width: '64px',
                      height: '64px',
                      minWidth: '64px',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      background: 'var(--bg-card-inner, #F4F4F5)',
                      border: '1px solid var(--border-subtle, #E4E4E7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}
                  >
                    {cleanUrl && isValidHttps ? (
                      <img
                        src={cleanUrl}
                        alt={`Photo #${idx + 1}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        onLoad={() => setImageStatus((prev) => ({ ...prev, [idx]: 'valid' }))}
                        onError={() => setImageStatus((prev) => ({ ...prev, [idx]: 'error' }))}
                      />
                    ) : (
                      <span style={{ fontSize: '20px', color: '#A1A1AA' }}>📷</span>
                    )}
                  </div>

                  {/* Input and Controls */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="url"
                        value={imgUrl}
                        onChange={(e) => handleImageChange(idx, e.target.value)}
                        placeholder="https://images.unsplash.com/photo-..."
                        aria-label={`Photo URL #${idx + 1}`}
                        style={{ flex: 1, minHeight: '40px' }}
                      />

                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => handleUploadClick(idx)}
                        disabled={activeUploadIndex === idx}
                        title="Upload file or choose from allowlisted test photos"
                        style={{
                          minHeight: '40px',
                          padding: '0 12px',
                          whiteSpace: 'nowrap',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '12px',
                          fontWeight: 600,
                        }}
                      >
                        {activeUploadIndex === idx ? 'Checking...' : '📷 Upload File'}
                      </button>

                      {images.length > 1 && (
                        <button
                          type="button"
                          className="btn-danger-outline"
                          onClick={() => handleRemoveImageField(idx)}
                          title={`Remove photo #${idx + 1}`}
                          aria-label={`Remove photo #${idx + 1}`}
                          style={{ minHeight: '40px', width: '40px', padding: 0 }}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* Live Validation Badges */}
                    <div>
                      {cleanUrl && isValidHttps && imageStatus[idx] === 'valid' && (
                        <span
                          style={{
                            color: 'var(--color-success, #059669)',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          ✓ Valid Image
                        </span>
                      )}
                      {cleanUrl && (!isValidHttps || imageStatus[idx] === 'error') && (
                        <span
                          style={{
                            color: 'var(--color-danger, #DC2626)',
                            fontSize: '11px',
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          ⚠️ Image failed to load — check HTTPS URL
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {images.length < 6 && (
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={handleAddImageField}
              style={{ marginTop: '10px' }}
            >
              + Add another photo URL
            </button>
          )}
        </div>

        <label>
          Tags
          <input
            type="text"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="statue, street_art, hidden_door (comma-separated)"
          />
        </label>

        <div className="form-section">
          <h3>Warnings (Optional)</h3>
          <div className="warnings-checkboxes">
            {[
              { id: 'private_property', label: 'Private Property' },
              { id: 'walking_required', label: 'Walking Required' },
              { id: 'unsafe_night', label: 'Unsafe at Night' },
              { id: 'other', label: 'Other Caution' },
            ].map((w) => (
              <label key={w.id} className="checkbox-pill">
                <input
                  type="checkbox"
                  checked={warnings.includes(w.id)}
                  onChange={() => handleWarningToggle(w.id)}
                />
                {w.label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="submit"
          className="btn-primary"
          disabled={submitting}
          style={{ minHeight: '48px', fontSize: '1rem', fontWeight: 800 }}
        >
          {submitting
            ? 'Publishing Find...'
            : type === 'identify'
            ? 'Post Question to Community'
            : 'Publish Find'}
        </button>
      </form>

      {/* Upload Provider Disabled / Allowlist Helper Popover */}
      {showAllowlistModal && (
        <div className="modal-backdrop" onClick={() => setShowAllowlistModal(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '520px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0 }}>📷 Image Allowlist Mode</h3>
              <button
                type="button"
                className="btn-close-modal"
                onClick={() => setShowAllowlistModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary, #524C46)', lineHeight: 1.5 }}>
              Direct binary uploads are disabled in local testing (HTTP 501 Allowlist Mode).
              Oddspot stores allowlisted HTTPS image URLs (e.g. Unsplash, Wikimedia, Imgur, Cloudinary).
            </p>

            <h4 style={{ fontSize: '14px', margin: '14px 0 8px', color: 'var(--text-primary, #18181B)' }}>
              Select a 1-Click Sample Photo:
            </h4>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginBottom: '16px',
              }}
            >
              {SAMPLE_PHOTOS.map((sample) => (
                <div
                  key={sample.title}
                  onClick={() => handleSelectSample(sample.url)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelectSample(sample.url)}
                  style={{
                    border: '1px solid var(--border-subtle, #E4E4E7)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    background: 'var(--bg-card-inner, var(--bg-surface-elevated, #F9FAFB))',
                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <img
                    src={sample.url}
                    alt={sample.title}
                    style={{ width: '100%', height: '80px', objectFit: 'cover' }}
                  />
                  <div style={{ padding: '6px 8px' }}>
                    <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>
                      {sample.title}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                      {sample.subtitle}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-secondary btn-small"
                onClick={() => setShowAllowlistModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
