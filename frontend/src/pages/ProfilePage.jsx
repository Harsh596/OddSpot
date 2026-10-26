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

        {/* Earned Badges Row */}
        <div className="profile-badges-section">
          <h4 className="badges-title">Field Accreditations & Badges</h4>
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

        {/* Stats Row */}
        <div className="profile-stats-grid">
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
      </div>

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

              {/* Visited Spots Timeline List */}
              <div className="visits-timeline">
                <h3>Check-In History ({visits.length})</h3>
                <div className="visits-cards-grid">
                  {visits.map((v) => (
                    <div
                      key={v.id}
                      className="visit-history-card"
                      onClick={() => navigate(`#/post/${v.postId}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`#/post/${v.postId}`)}
                    >
                      <div className="visit-card-thumb">
                        {v.photoUrl ? (
                          <img src={v.photoUrl} alt="Check-in proof" loading="lazy" />
                        ) : v.post?.images?.[0]?.url ? (
                          <img src={v.post.images[0].url} alt="Spot" loading="lazy" />
                        ) : (
                          <div className="thumb-placeholder">📍</div>
                        )}
                        <span className={`status-badge-mini status-${v.spotStatus || 'still_there'}`}>
                          {v.spotStatus === 'still_there'
                            ? '🟢 Present'
                            : v.spotStatus === 'changed'
                            ? '🟡 Changed'
                            : '🔴 Gone'}
                        </span>
                      </div>

                      <div className="visit-card-details">
                        <h4 className="visit-post-title">{v.post?.title || 'Unknown Spot'}</h4>
                        <div className="visit-card-meta">
                          <span>
                            📍 {v.post?.place?.city || 'Field Location'}, {v.post?.place?.country || ''}
                          </span>
                          <span>Visited {new Date(v.createdAt).toLocaleDateString()}</span>
                        </div>
                        {v.note && <p className="visit-card-note">"{v.note}"</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Finds Posted */}
      {activeTab === 'finds' && (
        <div className="profile-tab-content">
          {loadingPosts ? (
            <LoadingSkeleton message="Loading scout discoveries..." count={3} />
          ) : posts.length === 0 ? (
            <EmptyState
              icon="🔭"
              title="No Discoveries Logged Yet"
              message={
                isSelf
                  ? 'You have not submitted any oddities to the map yet.'
                  : `${profile.username} has not submitted any odd spots.`
              }
              actionLabel={isSelf ? '+ Post First Find' : undefined}
              onAction={isSelf ? () => navigate('#/create') : undefined}
            />
          ) : (
            <div className="finds-grid">
              {posts.map((p) => (
                <div
                  key={p._id}
                  className="find-card"
                  onClick={() => navigate(`#/post/${p._id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`#/post/${p._id}`)}
                >
                  <div className="find-card-media">
                    {p.images && p.images.length > 0 ? (
                      <img src={p.images[0].url} alt={p.title} loading="lazy" />
                    ) : (
                      <div className="find-placeholder">👁️</div>
                    )}
                    <span className={`tier-tag tier-${p.tier || 'city'}`}>
                      {(p.tier || 'city').toUpperCase()}
                    </span>
                  </div>

                  <div className="find-card-body">
                    <h4 className="find-title">{p.title}</h4>
                    <p className="find-loc">
                      📍 {p.place?.city}, {p.place?.country}
                    </p>
                    <div className="find-footer">
                      <OddometerPill
                        score={p.meter?.score}
                        countryThreshold={p.meter?.countryThreshold}
                        label={p.meter?.label}
                        tier={p.tier}
                        size="sm"
                      />
                      <span className="find-date">
                        {new Date(p.createdAt).toLocaleDateString()}
                      </span>
                    </div>
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
            <LoadingSkeleton message="Retrieving scout affiliations..." count={2} />
          ) : communities.length === 0 ? (
            <EmptyState
              icon="👥"
              title="No Communities Joined"
              message={
                isSelf
                  ? 'You have not joined any scout communities yet. Join or found a local chapter!'
                  : `${profile.username} does not belong to any public communities.`
              }
              actionLabel="Discover Communities"
              onAction={() => navigate('#/explore')}
            />
          ) : (
            <div className="communities-grid">
              {communities.map((comm) => (
                <div key={comm.id || comm._id} className="community-card">
                  <div className="community-card-header">
                    <span className="community-icon">🌐</span>
                    <div className="community-names">
                      <h4 className="community-name">{comm.name}</h4>
                      <span className="community-slug">c/{comm.slug}</span>
                    </div>
                    <span className={`role-badge role-${comm.role}`}>
                      {comm.role === 'owner' ? '👑 Owner' : 'Scout'}
                    </span>
                  </div>
                  {comm.description && (
                    <p className="community-desc">{comm.description}</p>
                  )}
                  <div className="community-card-footer">
                    <span className="member-count">
                      👥 {comm.memberCount || 1} {comm.memberCount === 1 ? 'scout' : 'scouts'}
                    </span>
                    <button
                      type="button"
                      className="btn-secondary btn-small"
                      onClick={() => navigate(`#/explore?community=${comm.slug}`)}
                    >
                      Browse Dispatch
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProfilePage;
