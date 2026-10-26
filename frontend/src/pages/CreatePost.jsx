// frontend/src/pages/CreatePost.jsx
// Post creation form supporting 'find' vs 'identify' types, MarkdownEditor with live preview,
// Field Guide template shortcut, and privacy-preserving draft autosaving.

import React, { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { MarkdownEditor } from '../components/markdown/MarkdownEditor';

const DRAFT_STORAGE_KEY = 'oddspot_draft_post';

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
  };

  const handleAddImageField = () => {
    if (images.length < 6) {
      setImages([...images, '']);
    }
  };

  const handleRemoveImageField = (index) => {
    if (images.length > 1) {
      setImages(images.filter((_, i) => i !== index));
    } else {
      setImages(['']);
    }
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

  return (
    <div className="form-page-container">
      <div className="form-header-row">
        <div>
          <h2>Post a New Find</h2>
          <p className="subtitle">
            Document an oddity or ask the community to identify a mystery spot.
          </p>
        </div>
        {hasDraft && (
          <button
            type="button"
            className="btn-secondary btn-small"
            onClick={handleClearDraft}
            title="Discard current draft"
          >
            Clear Draft
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
          <button
            type="button"
            className="btn-secondary"
            onClick={handleUseCurrentLocation}
            disabled={geoLoading}
          >
            {geoLoading ? 'Detecting GPS...' : '📍 Use my current location'}
          </button>
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

        <div className="form-section">
          <h3>Photo URLs (HTTPS only, max 6)</h3>
          {images.map((imgUrl, idx) => (
            <div key={idx} className="image-input-row">
              <input
                type="url"
                value={imgUrl}
                onChange={(e) => handleImageChange(idx, e.target.value)}
                placeholder="https://images.unsplash.com/photo-..."
              />
              {images.length > 1 && (
                <button
                  type="button"
                  className="btn-danger-outline"
                  onClick={() => handleRemoveImageField(idx)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {images.length < 6 && (
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={handleAddImageField}
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

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting
            ? 'Publishing Find...'
            : type === 'identify'
            ? 'Post Question to Community'
            : 'Publish Find'}
        </button>
      </form>
    </div>
  );
}
