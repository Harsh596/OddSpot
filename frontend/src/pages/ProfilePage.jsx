// frontend/src/pages/ProfilePage.jsx
// User Profile view featuring scout header, earned badges, stats,
// and 3 tabs: Finds Posted, Visited Spots Map, and Joined Communities.

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { OddspotMap } from '../components/map/OddspotMap';
import { OddometerPill } from '../components/meter/OddometerPill';
import { LoadingSkeleton, EmptyState, ErrorBanner } from '../components/ui/StatusViews';

const BADGE_DEFINITIONS = {
  scout: {
    title: 'Founding Scout',
    icon: '🧭',
    desc: 'Registered explorer in the OddSpot field network.',
    color: '#00f0ff',
  },
  first_visit: {
    title: 'First Encounter',
    icon: '🎯',
    desc: 'Recorded first verified GPS visit on location.',
    color: '#10b981',
  },
  '10_visits': {
    title: 'Master Explorer',
    icon: '🏆',
    desc: '10+ verified field visits to strange real-world spots.',
    color: '#f59e0b',
  },
};

export function ProfilePage({ username: propUsername, navigate }) {
  const { user: authUser } = useAuth();
  const targetUsername = propUsername || authUser?.username;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tabs: 'finds' | 'visits' | 'communities'
  const [activeTab, setActiveTab] = useState('visits');

  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(false);

  const [visits, setVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(false);

  const [communities, setCommunities] = useState([]);
  const [loadingCommunities, setLoadingCommunities] = useState(false);

  // Fetch user profile info
  const loadProfile = useCallback(async () => {
    if (!targetUsername) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await api.getUserProfile(targetUsername);
      setProfile(data);
    } catch (err) {
      setError(err.message || 'Scout profile not found.');
    } finally {
      setLoading(false);
    }
  }, [targetUsername]);

  // Fetch finds posted
  const loadPosts = useCallback(async () => {
    if (!targetUsername) return;
    setLoadingPosts(true);
    try {
      const res = await api.getUserPosts(targetUsername);
      setPosts(res.posts || []);
    } catch (err) {
      console.warn('Failed to load user posts:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, [targetUsername]);

  // Fetch verified visits
  const loadVisits = useCallback(async () => {
    if (!targetUsername) return;
    setLoadingVisits(true);
    try {
      const res = await api.getUserVisits(targetUsername);
      setVisits(res.visits || []);
    } catch (err) {
      console.warn('Failed to load user visits:', err);
    } finally {
      setLoadingVisits(false);
    }
  }, [targetUsername]);

  // Fetch joined communities
  const loadCommunities = useCallback(async () => {
    if (!targetUsername) return;
    setLoadingCommunities(true);
    try {
      const res = await api.getUserCommunities(targetUsername);
      setCommunities(res.communities || []);
    } catch (err) {
      console.warn('Failed to load user communities:', err);
    } finally {
      setLoadingCommunities(false);
    }
  }, [targetUsername]);

  useEffect(() => {
    loadProfile();
    loadPosts();
    loadVisits();
    loadCommunities();
  }, [loadProfile, loadPosts, loadVisits, loadCommunities]);

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSkeleton message="Retrieving scout dossier..." count={3} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="page-container">
        <ErrorBanner
          message={error || 'Profile not found'}
          onRetry={loadProfile}
        />
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button type="button" className="btn-secondary" onClick={() => navigate('#/home')}>
            Return to Dispatch
          </button>
        </div>
      </div>
    );
  }

  const isSelf = authUser && authUser.username === profile.username;
  const badges = profile.badges || ['scout'];

  // Customizable widget ordering: 'badges' | 'stats' | 'tabs'
  const defaultOrder = ['badges', 'stats', 'tabs'];
  const [widgetOrder, setWidgetOrder] = useState(() => {
    try {
      const saved = localStorage.getItem('oddspot_profile_layout');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.widgetOrder) && parsed.widgetOrder.length > 0) {
          return parsed.widgetOrder;
        }
      }
    } catch {}
    return profile?.profileLayout?.widgetOrder || defaultOrder;
  });

  const [customizingLayout, setCustomizingLayout] = useState(false);
  const [savingLayout, setSavingLayout] = useState(false);

  // Sync widget order if profile updates
  useEffect(() => {
    if (profile?.profileLayout?.widgetOrder && Array.isArray(profile.profileLayout.widgetOrder)) {
      setWidgetOrder(profile.profileLayout.widgetOrder);
    }
  }, [profile]);

  const moveWidget = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= widgetOrder.length) return;
    const updated = [...widgetOrder];
    const [moved] = updated.splice(index, 1);
    updated.splice(newIndex, 0, moved);
    setWidgetOrder(updated);
  };

  const handleSaveLayout = async (newOrder = widgetOrder) => {
    setSavingLayout(true);
    try {
      const payload = { profileLayout: { widgetOrder: newOrder } };
      await api.updatePreferences(payload);
      localStorage.setItem('oddspot_profile_layout', JSON.stringify({ widgetOrder: newOrder }));
      setCustomizingLayout(false);
    } catch (err) {
      console.warn('Failed to save layout preference to backend:', err);
      // Fallback local persistence
      localStorage.setItem('oddspot_profile_layout', JSON.stringify({ widgetOrder: newOrder }));
      setCustomizingLayout(false);
    } finally {
      setSavingLayout(false);
    }
  };

  const applyLayoutPreset = (preset) => {
    let newOrder;
    if (preset === 'statsFirst') newOrder = ['stats', 'badges', 'tabs'];
    else if (preset === 'tabsFirst') newOrder = ['tabs', 'stats', 'badges'];
    else newOrder = ['badges', 'stats', 'tabs'];
    setWidgetOrder(newOrder);
    handleSaveLayout(newOrder);
  };

  // Map markers for verified visits
  const visitedPostsForMap = visits
    .filter((v) => v.post && v.location?.coordinates)
    .map((v) => ({
      ...v.post,
      _id: v.postId,
      title: v.post.title,
      spotStatus: v.spotStatus,
      location: v.location,
    }));

  // Render individual widget blocks
  const renderWidget = (widgetId) => {
    switch (widgetId) {
      case 'badges':
        return (
          <div key="badges" className="profile-badges-section widget-block">
            <h4 className="badges-title">Field Accreditations &amp; Badges</h4>
            <div className="badges-list">
              {badges.map((bKey) => {
                const b = BADGE_DEFINITIONS[bKey] || {
                  title: bKey.replace('_', ' '),
                  icon: '🏅',
                  desc: 'Special contribution accreditation.',
                  color: '#00f0ff',
                };
                return (
                  <div
                    key={bKey}
                    className="badge-card"
                    style={{ borderColor: `${b.color}40` }}
                    title={`${b.title}: ${b.desc}`}
                  >
                    <span className="badge-icon">{b.icon}</span>
                    <div className="badge-info">
                      <span className="badge-label" style={{ color: b.color }}>
                        {b.title}
                      </span>
                      <span className="badge-sub">{b.desc}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

      case 'stats':
        return (
          <div key="stats" className="profile-stats-grid widget-block">
            <div className="stat-box" onClick={() => setActiveTab('visits')}>
              <span className="stat-num">{visits.length}</span>
              <span className="stat-label">Verified Visits</span>
            </div>
            <div className="stat-box" onClick={() => setActiveTab('finds')}>
              <span className="stat-num">{posts.length}</span>
              <span className="stat-label">Finds Posted</span>
            </div>
            <div className="stat-box" onClick={() => setActiveTab('communities')}>
              <span className="stat-num">{communities.length}</span>
              <span className="stat-label">Communities</span>
            </div>
          </div>
        );

      case 'tabs':
        return (
          <div key="tabs" className="profile-tabs-wrapper widget-block">
            {/* Profile Navigation Tabs */}
            <div className="profile-tabs-nav" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'visits'}
                className={`profile-tab-btn ${activeTab === 'visits' ? 'active' : ''}`}
                onClick={() => setActiveTab('visits')}
              >
                🗺️ Visited Spots Map ({visits.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'finds'}
                className={`profile-tab-btn ${activeTab === 'finds' ? 'active' : ''}`}
                onClick={() => setActiveTab('finds')}
              >
                🔍 Finds Posted ({posts.length})
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'communities'}
                className={`profile-tab-btn ${activeTab === 'communities' ? 'active' : ''}`}
                onClick={() => setActiveTab('communities')}
              >
                👥 Joined Communities ({communities.length})
              </button>
            </div>

            {/* Tab 1: Visited Spots Map */}
            {activeTab === 'visits' && (
              <div className="profile-tab-content">
                {loadingVisits ? (
                  <LoadingSkeleton message="Rendering personal visit map..." count={2} />
                ) : visits.length === 0 ? (
                  <EmptyState
                    icon="🧭"
                    title="No Verified Visits Recorded"
                    message={
                      isSelf
                        ? 'You have not checked in to any real-world spots yet. Go explore a nearby anomaly and log your first visit!'
                        : `${profile.username} has not recorded any verified visits yet.`
                    }
                    actionLabel="Find Spots to Visit"
                    onAction={() => navigate('#/explore')}
                  />
                ) : (
                  <div className="visits-tab-layout">
                    {/* Interactive Visit Map */}
                    <div className="profile-map-wrapper">
                      <OddspotMap
                        posts={visitedPostsForMap}
                        height="420px"
                        onSelectPost={(p) => navigate(`#/post/${p._id}`)}
                      />
                    </div>

                    {/* Visit History List */}
                    <div className="visits-timeline-list">
                      <h4>Check-In Log ({visits.length})</h4>
                      {visits.map((v) => (
                        <div
                          key={v._id}
                          className="visit-history-card"
                          onClick={() => v.postId && navigate(`#/post/${v.postId}`)}
                          tabIndex={0}
                          role="button"
                        >
                          <div className="visit-card-header">
                            <span className="visit-title">{v.post?.title || 'Unknown Find'}</span>
                            <span className={`status-pill status-${v.spotStatus}`}>
                              {v.spotStatus?.replace('_', ' ')}
                            </span>
                          </div>
                          {v.notes && <p className="visit-card-notes">"{v.notes}"</p>}
                          <div className="visit-card-footer">
                            <span>📅 {new Date(v.visitedAt).toLocaleDateString()}</span>
                            {v.distanceMeters !== undefined && (
                              <span>📏 {Math.round(v.distanceMeters)}m from spot</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Finds Posted */}
            {activeTab === 'finds' && (
              <div className="profile-tab-content">
                {loadingPosts ? (
                  <LoadingSkeleton message="Loading finds..." count={2} />
                ) : posts.length === 0 ? (
                  <EmptyState
                    icon="📍"
                    title="No Finds Posted Yet"
                    message={
                      isSelf
                        ? 'You have not posted any strange discoveries yet. Find something weird in the wild and log it!'
                        : `${profile.username} has not posted any finds yet.`
                    }
                    actionLabel="+ Post a Find"
                    onAction={() => navigate('#/create')}
                  />
                ) : (
                  <div className="finds-cards-grid">
                    {posts.map((p) => (
                      <div
                        key={p._id}
                        className="find-summary-card"
                        onClick={() => navigate(`#/post/${p._id}`)}
                        tabIndex={0}
                        role="button"
                      >
                        {p.images && p.images.length > 0 && p.images[0].url && (
                          <div className="find-card-img-wrap">
                            <img src={p.images[0].url} alt={p.title} loading="lazy" />
                          </div>
                        )}
                        <div className="find-card-body">
                          <div className="find-card-top-row">
                            <span className={`badge-tier tier-${p.tier || 'city'}`}>
                              {(p.tier || 'city').toUpperCase()}
                            </span>
                            <OddometerPill score={p.meter?.score || 0} />
                          </div>
                          <h4 className="find-card-title">{p.title}</h4>
                          <p className="find-card-place">
                            📍 {p.place?.city}, {p.place?.country}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Joined Communities */}
            {activeTab === 'communities' && (
              <div className="profile-tab-content">
                {loadingCommunities ? (
                  <LoadingSkeleton message="Loading communities..." count={2} />
                ) : communities.length === 0 ? (
                  <EmptyState
                    icon="👥"
                    title="No Communities Joined"
                    message={
                      isSelf
                        ? 'Connect with nearby scout chapters to share field tips and organize expeditions.'
                        : `${profile.username} is not a member of any chapters yet.`
                    }
                    actionLabel="Discover Communities"
                    onAction={() => navigate('#/communities')}
                  />
                ) : (
                  <div className="communities-cards-grid">
                    {communities.map((c) => (
                      <div
                        key={c._id}
                        className="community-membership-card"
                        onClick={() => navigate(`#/c/${c.slug}`)}
                        tabIndex={0}
                        role="button"
                      >
                        <div className="community-card-header">
                          <span className="community-icon">🌐</span>
                          <div className="community-names">
                            <h4 className="community-name">{c.name}</h4>
                            <span className="community-slug">c/{c.slug}</span>
                          </div>
                          {c.role && (
                            <span className={`role-badge role-${c.role}`}>
                              {c.role.toUpperCase()}
                            </span>
                          )}
                        </div>
                        {c.description && <p className="community-desc">{c.description}</p>}
                        <div className="community-card-footer">
                          <span className="member-count">👥 {c.memberCount || 1} scouts</span>
                          <span className="scope-tag">{(c.scope || 'city').toUpperCase()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="page-container profile-page">
      {/* Scout Profile Header Card */}
      <div className="profile-header-card">
        <div className="profile-main-cluster">
          <div className="profile-avatar-wrapper">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.username} className="profile-avatar-img" />
            ) : (
              <div className="profile-avatar-placeholder">
                {profile.username.substring(0, 2).toUpperCase()}
              </div>
            )}
            <span className="profile-status-online" title="Active Field Scout" />
          </div>

          <div className="profile-details-group">
            <div className="profile-title-row">
              <h1 className="profile-username">{profile.username}</h1>
              {isSelf && <span className="self-tag">You</span>}
              {isSelf && (
                <button
                  type="button"
                  className="btn-customize-layout"
                  onClick={() => setCustomizingLayout(!customizingLayout)}
                  title="Customize profile widget order"
                >
                  ⚙️ {customizingLayout ? 'Done' : 'Customize Layout'}
                </button>
              )}
            </div>

            {profile.bio && <p className="profile-bio">{profile.bio}</p>}

            <div className="profile-meta-row">
              {profile.homePlace?.city && (
                <span className="profile-meta-item">
                  📍 Home Turf: <strong>{profile.homePlace.city}, {profile.homePlace.country}</strong>
                </span>
              )}
              <span className="profile-meta-item">
                🗓️ Scout Since: <strong>{new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Customizable Widget Order Panel */}
        {isSelf && customizingLayout && (
          <div className="layout-customizer-panel" role="region" aria-label="Widget Reorderer">
            <div className="layout-customizer-header">
              <h5>🗂️ Reorder Profile Sections</h5>
              <div className="layout-presets-strip">
                <button type="button" onClick={() => applyLayoutPreset('classic')}>
                  Classic
                </button>
                <button type="button" onClick={() => applyLayoutPreset('statsFirst')}>
                  Stats First
                </button>
                <button type="button" onClick={() => applyLayoutPreset('tabsFirst')}>
                  Activity First
                </button>
              </div>
            </div>

            <div className="widget-order-list">
              {widgetOrder.map((wId, idx) => (
                <div key={wId} className="widget-order-item">
                  <span className="order-num">#{idx + 1}</span>
                  <span className="order-name">
                    {wId === 'badges'
                      ? '🏅 Accreditations & Badges'
                      : wId === 'stats'
                      ? '📊 Scout Stats Grid'
                      : '🗺️ Map & Dossier Tabs'}
                  </span>
                  <div className="order-btns">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveWidget(idx, -1)}
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      disabled={idx === widgetOrder.length - 1}
                      onClick={() => moveWidget(idx, 1)}
                      title="Move down"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="layout-save-row">
              <button
                type="button"
                className="btn-primary btn-small"
                onClick={() => handleSaveLayout()}
                disabled={savingLayout}
              >
                {savingLayout ? 'Saving Layout...' : 'Save Layout Preference'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Dynamically Render Widgets in User's Customized Order */}
      <div className="profile-widgets-stack">
        {widgetOrder.map((wId) => renderWidget(wId))}
      </div>
    </div>
  );
}

export default ProfilePage;
