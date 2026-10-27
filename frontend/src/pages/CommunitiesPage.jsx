// frontend/src/pages/CommunitiesPage.jsx
// Communities Hub featuring Nearby GPS radar, Keyword search,
// community cards with member counts and scope, and + Create Community modal.

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { LoadingSkeleton, EmptyState, ErrorBanner } from '../components/ui/StatusViews';

export function CommunitiesPage({ navigate }) {
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('nearby'); // 'nearby' | 'search'
  const [communities, setCommunities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // GPS state
  const [gpsLoading, setGpsLoading] = useState(false);
  const [coords, setCoords] = useState(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Create Community Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState('city');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [rules, setRules] = useState(['Be respectful of real-world spots', 'No trespassing']);
  const [newRuleInput, setNewRuleInput] = useState('');
  const [flairs, setFlairs] = useState(['urban_explorer', 'historical', 'architecture']);
  const [newFlairInput, setNewFlairInput] = useState('');
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createError, setCreateError] = useState('');

  // Auto-generate slug from name
  const handleNameChange = (val) => {
    setName(val);
    if (!slug || slug === name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')) {
      setSlug(
        val
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9_-]+/g, '-')
          .slice(0, 30)
      );
    }
  };

  // Detect location for nearby tab
  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setGpsLoading(false);
      },
      (err) => {
        console.warn('Geolocation failed:', err);
        setGpsLoading(false);
      },
      { timeout: 8000 }
    );
  }, []);

  // Fetch communities
  const loadCommunities = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'nearby' && coords) {
        const res = await api.getNearbyCommunities({
          latitude: coords.latitude,
          longitude: coords.longitude,
          radius: 50000,
        });
        setCommunities(res.communities || []);
      } else {
        const res = await api.getNearbyCommunities({
          q: searchQuery.trim() || undefined,
        });
        setCommunities(res.communities || []);
      }
    } catch (err) {
      setError(err.message || 'Failed to load communities.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, coords, searchQuery]);

  useEffect(() => {
    if (activeTab === 'nearby' && !coords) {
      detectLocation();
    }
  }, [activeTab, coords, detectLocation]);

  useEffect(() => {
    loadCommunities();
  }, [loadCommunities]);

  const handleAddRule = (e) => {
    e.preventDefault();
    const clean = newRuleInput.trim();
    if (clean && !rules.includes(clean)) {
      setRules([...rules, clean]);
      setNewRuleInput('');
    }
  };

  const handleRemoveRule = (index) => {
    setRules(rules.filter((_, i) => i !== index));
  };

  const handleAddFlair = (e) => {
    e.preventDefault();
    const clean = newFlairInput.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (clean && !flairs.includes(clean)) {
      setFlairs([...flairs, clean]);
      setNewFlairInput('');
    }
  };

  const handleRemoveFlair = (index) => {
    setFlairs(flairs.filter((_, i) => i !== index));
  };

  const handleCreateCommunitySubmit = async (e) => {
    e.preventDefault();
    setCreateError('');

    if (!user) {
      navigate('#/login');
      return;
    }

    const cleanName = name.trim();
    const cleanSlug = slug.trim().toLowerCase();
    const cleanDesc = description.trim();

    if (!cleanName || cleanName.length < 3) {
      setCreateError('Community name must be at least 3 characters.');
      return;
    }

    if (!/^[a-z0-9_-]{3,30}$/.test(cleanSlug)) {
      setCreateError('Slug must be 3-30 lowercase characters (letters, numbers, hyphens, underscores).');
      return;
    }

    if (!cleanDesc) {
      setCreateError('Please provide a community description.');
      return;
    }

    setSubmittingCreate(true);
    try {
      const payload = {
        name: cleanName,
        slug: cleanSlug,
        description: cleanDesc,
        scope,
        place: city.trim() || country.trim() ? { city: city.trim(), country: country.trim() } : undefined,
        rules: rules.filter(Boolean),
        flairs: flairs.filter(Boolean),
      };

      const res = await api.createCommunity(payload);
      setShowCreateModal(false);
      navigate(`#/c/${res.community.slug}`);
    } catch (err) {
      setCreateError(err.message || 'Failed to create community.');
    } finally {
      setSubmittingCreate(false);
    }
  };

  return (
    <div className="page-container communities-page">
      {/* Header */}
      <div className="communities-header-row">
        <div>
          <h1 className="page-title">🌐 Scout Communities</h1>
          <p className="page-subtitle">
            Join regional chapters, specialized urban exploring circles, and local oddity syndicates.
          </p>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            if (!user) navigate('#/login');
            else setShowCreateModal(true);
          }}
        >
          + Create Community
        </button>
      </div>

      {/* Tabs & Search Controls */}
      <div className="communities-filter-bar">
        <div className="tab-pill-group">
          <button
            type="button"
            className={`tab-pill ${activeTab === 'nearby' ? 'active' : ''}`}
            onClick={() => setActiveTab('nearby')}
          >
            📍 Nearby Chapters
          </button>
          <button
            type="button"
            className={`tab-pill ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => setActiveTab('search')}
          >
            🔍 Browse &amp; Search
          </button>
        </div>

        {activeTab === 'search' && (
          <div className="community-search-box">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chapters by keyword, city, or interest..."
            />
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} onRetry={loadCommunities} />}

      {/* Communities Grid */}
      {loading ? (
        <LoadingSkeleton message="Retrieving scout chapters..." count={3} />
      ) : communities.length === 0 ? (
        <EmptyState
          icon="🏘️"
          title={activeTab === 'nearby' ? 'No nearby chapters found' : 'No communities match your search'}
          description="Be the founding scout and create the first community for your region or topic!"
          actionLabel="+ Create Chapter"
          onAction={() => setShowCreateModal(true)}
        />
      ) : (
        <div className="communities-grid">
          {communities.map((c) => (
            <div
              key={c._id}
              className="community-card-hub"
              onClick={() => navigate(`#/c/${c.slug}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  navigate(`#/c/${c.slug}`);
                }
              }}
            >
              <div className="community-hub-top">
                <span className="hub-scope-badge">{c.scope.toUpperCase()}</span>
                <span className="hub-member-badge">👥 {c.memberCount || 1} scouts</span>
              </div>

              <h3 className="hub-community-name">{c.name}</h3>
              <span className="hub-community-slug">c/{c.slug}</span>

              {c.place && (c.place.city || c.place.country) && (
                <p className="hub-place-tag">
                  📍 {c.place.city ? `${c.place.city}, ` : ''}{c.place.country}
                </p>
              )}

              <p className="hub-community-desc">{c.description}</p>

              {c.flairs && c.flairs.length > 0 && (
                <div className="hub-flairs-strip">
                  {c.flairs.slice(0, 3).map((f, i) => (
                    <span key={i} className="flair-pill">
                      #{f}
                    </span>
                  ))}
                  {c.flairs.length > 3 && <span className="flair-more">+{c.flairs.length - 3}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Community Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" onClick={() => setShowCreateModal(false)} role="presentation">
          <div
            className="modal-content modal-wide"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-comm-title"
          >
            <div className="modal-header-row">
              <div>
                <h3 id="create-comm-title">Found a New Community Chapter</h3>
                <p className="subtitle">Gather scouts under a shared geographic turf or weird interest.</p>
              </div>
              <button
                type="button"
                className="btn-modal-close"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {createError && <div className="alert-error">{createError}</div>}

            <form onSubmit={handleCreateCommunitySubmit} className="form-stack">
              <div className="form-row-duo">
                <label>
                  Community Name *
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Bangalore Rooftop Oddities"
                    maxLength={40}
                    required
                  />
                </label>

                <label>
                  Slug (URL path) *
                  <div className="slug-input-wrapper">
                    <span>c/</span>
                    <input
                      type="text"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                      placeholder="bangalore-rooftops"
                      maxLength={30}
                      required
                    />
                  </div>
                </label>
              </div>

              <div className="form-row-trio">
                <label>
                  Scope *
                  <select value={scope} onChange={(e) => setScope(e.target.value)}>
                    <option value="city">City / Local</option>
                    <option value="country">Country-Wide</option>
                    <option value="interest">Interest / Global</option>
                  </select>
                </label>

                <label>
                  City
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="e.g. Bengaluru"
                  />
                </label>

                <label>
                  Country
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="e.g. India"
                  />
                </label>
              </div>

              <label>
                Description *
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is this community's mission? What kind of spots do members share?"
                  rows={3}
                  maxLength={500}
                  required
                />
              </label>

              {/* Rules List Editor */}
              <div className="meta-chips-editor">
                <label>Community Rules ({rules.length})</label>
                <div className="chips-list">
                  {rules.map((r, idx) => (
                    <span key={idx} className="removable-chip">
                      {idx + 1}. {r}
                      <button type="button" onClick={() => handleRemoveRule(idx)}>✕</button>
                    </span>
                  ))}
                </div>
                <div className="chip-input-row">
                  <input
                    type="text"
                    value={newRuleInput}
                    onChange={(e) => setNewRuleInput(e.target.value)}
                    placeholder="Add a rule (e.g. 'Always link public bus route')..."
                  />
                  <button type="button" className="btn-secondary btn-small" onClick={handleAddRule}>
                    + Add Rule
                  </button>
                </div>
              </div>

              {/* Flairs List Editor */}
              <div className="meta-chips-editor">
                <label>Community Flairs ({flairs.length})</label>
                <div className="chips-list">
                  {flairs.map((f, idx) => (
                    <span key={idx} className="removable-chip flair-type">
                      #{f}
                      <button type="button" onClick={() => handleRemoveFlair(idx)}>✕</button>
                    </span>
                  ))}
                </div>
                <div className="chip-input-row">
                  <input
                    type="text"
                    value={newFlairInput}
                    onChange={(e) => setNewFlairInput(e.target.value)}
                    placeholder="Add flair tag (e.g. 'abandoned_industry')..."
                  />
                  <button type="button" className="btn-secondary btn-small" onClick={handleAddFlair}>
                    + Add Flair
                  </button>
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                  disabled={submittingCreate}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingCreate}>
                  {submittingCreate ? 'Founding Chapter...' : 'Found Community'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CommunitiesPage;
