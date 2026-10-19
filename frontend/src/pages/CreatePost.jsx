import React, { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export function CreatePost({ navigate }) {
  const { user } = useAuth();

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
        setError(`Image #${i + 1} must be an HTTPS URL (e.g. https://...). Only URLs are stored.`);
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

      navigate(`#/post/${res._id}`);
    } catch (err) {
      setError(err.message || 'Failed to publish post.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="form-page-container">
      <h2>Post a New Find</h2>
      <p className="subtitle">Document an oddity or weird spot you discovered.</p>

      {error && <div className="alert-error">{error}</div>}

      <form onSubmit={handleSubmit} className="form-stack">
        <label>
          Title *
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Abandoned telephone booth engulfed in vines"
            maxLength={140}
            required
          />
          <small className="help-text">{title.length}/140 characters</small>
        </label>

        <label>
          Description / Story
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="How did you stumble upon it? What makes it bizarre?"
            rows={4}
            maxLength={10000}
          />
        </label>

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
              Use this for private homes, schools or sensitive spots.
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
          {submitting ? 'Publishing Find...' : 'Publish Find'}
        </button>
      </form>
    </div>
  );
}
