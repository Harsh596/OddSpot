// frontend/src/pages/CommunityDetailPage.jsx
// Detailed Community view featuring banner, Join/Leave membership action,
// rules and flairs sidebar, + Post shortcut, and sortable community feed.

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { OddometerPill } from '../components/meter/OddometerPill';
import { LoadingSkeleton, EmptyState, ErrorBanner } from '../components/ui/StatusViews';

export function CommunityDetailPage({ slug, navigate }) {
  const { user } = useAuth();

  const [community, setCommunity] = useState(null);
  const [isMember, setIsMember] = useState(false);
  const [memberRole, setMemberRole] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Feed state
  const [posts, setPosts] = useState([]);
  const [sort, setSort] = useState('hot'); // 'hot' | 'new' | 'top'
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [joining, setJoining] = useState(false);

  // Load community metadata
  const loadCommunity = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.getCommunity(slug);
      setCommunity(data.community);
      setIsMember(!!data.isMember);
      setMemberRole(data.memberRole || null);
      setMemberCount(data.community?.memberCount || 1);
    } catch (err) {
      setError(err.message || 'Community chapter not found.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  // Load community posts
  const loadPosts = useCallback(async () => {
    if (!slug) return;
    setLoadingPosts(true);
    try {
      const res = await api.getCommunityPosts(slug, { sort });
      setPosts(res.posts || []);
    } catch (err) {
      console.warn('Failed to load community feed:', err);
    } finally {
      setLoadingPosts(false);
    }
  }, [slug, sort]);

  useEffect(() => {
    loadCommunity();
  }, [loadCommunity]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handleJoinToggle = async () => {
    if (!user) {
      navigate('#/login');
      return;
    }

    if (memberRole === 'owner') {
      alert('Community founders cannot leave without transferring ownership.');
      return;
    }

    setJoining(true);
    try {
      if (isMember) {
        const res = await api.leaveCommunity(slug);
        if (res.left) {
          setIsMember(false);
          setMemberRole(null);
          setMemberCount(res.memberCount);
        }
      } else {
        const res = await api.joinCommunity(slug);
        if (res.joined) {
          setIsMember(true);
          setMemberRole(res.role || 'member');
          setMemberCount(res.memberCount);
        }
      }
    } catch (err) {
      alert(err.message || 'Action failed');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="page-container">
        <LoadingSkeleton message="Opening community charter..." count={3} />
      </div>
    );
  }

  if (error || !community) {
    return (
      <div className="page-container">
        <ErrorBanner message={error || 'Community not found'} onRetry={loadCommunity} />
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button type="button" className="btn-secondary" onClick={() => navigate('#/communities')}>
            ← Back to Communities Hub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-container community-detail-page">
      {/* Top Banner & Header */}
      <div className="community-banner-card">
        <div className="banner-top-row">
          <button
            type="button"
            className="btn-back-clean"
            onClick={() => navigate('#/communities')}
          >
            ← All Chapters
          </button>

          <span className="community-scope-badge">{community.scope.toUpperCase()} SCOPE</span>
        </div>

        <div className="community-header-main">
          <div className="community-title-group">
            <h1 className="community-title">{community.name}</h1>
            <span className="community-slug-handle">c/{community.slug}</span>

            {community.place && (community.place.city || community.place.country) && (
              <p className="community-location-meta">
                📍 {community.place.city ? `${community.place.city}, ` : ''}{community.place.country}
              </p>
            )}

            <p className="community-description-text">{community.description}</p>
          </div>

          <div className="community-action-cluster">
            <div className="community-stats-box">
              <span className="stat-value">👥 {memberCount}</span>
              <span className="stat-label">Active Scouts</span>
            </div>

            {memberRole === 'owner' ? (
              <span className="badge-owner-tag">👑 Chapter Founder</span>
            ) : (
              <button
                type="button"
                className={`btn-join-toggle ${isMember ? 'joined' : 'join'}`}
                onClick={handleJoinToggle}
                disabled={joining}
              >
                {joining ? 'Updating...' : isMember ? '✓ Joined (Leave)' : '+ Join Chapter'}
              </button>
            )}

            <button
              type="button"
              className="btn-primary btn-post-shortcut"
              onClick={() => navigate('#/create')}
            >
              + Post a Find
            </button>
          </div>
        </div>
      </div>

      {/* Main Two-Column Layout: Feed + Sidebar */}
      <div className="community-content-layout">
        {/* Left Column: Posts Feed */}
        <div className="community-feed-column">
          <div className="feed-sort-strip">
            <h3>Discovered Spots</h3>
            <div className="sort-buttons-group">
              <button
                type="button"
                className={`sort-pill ${sort === 'hot' ? 'active' : ''}`}
                onClick={() => setSort('hot')}
              >
                🔥 Hot
              </button>
              <button
                type="button"
                className={`sort-pill ${sort === 'new' ? 'active' : ''}`}
                onClick={() => setSort('new')}
              >
                ⏱️ Newest
              </button>
              <button
                type="button"
                className={`sort-pill ${sort === 'top' ? 'active' : ''}`}
                onClick={() => setSort('top')}
              >
                🏆 Top Rated
              </button>
            </div>
          </div>

          {loadingPosts ? (
            <LoadingSkeleton message="Retrieving chapter spots..." count={2} />
          ) : posts.length === 0 ? (
            <EmptyState
              icon="📍"
              title="No spots posted to this chapter yet"
              description="Be the first scout to document an oddity or mystery spot for this community!"
              actionLabel="+ Post First Find"
              onAction={() => navigate('#/create')}
            />
          ) : (
            <div className="community-posts-list">
              {posts.map((post) => (
                <div
                  key={post._id}
                  className="community-post-card"
                  onClick={() => navigate(`#/post/${post._id}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      navigate(`#/post/${post._id}`);
                    }
                  }}
                >
                  <div className="post-card-inner">
                    <div className="post-content-meta">
                      <div className="post-header-badges">
                        <span className={`post-tier-tag tier-${post.tier || 'city'}`}>
                          {(post.tier || 'city').toUpperCase()}
                        </span>
                        <OddometerPill score={post.meter?.score || 0} />
                      </div>

                      <h4 className="post-card-title">{post.title}</h4>

                      <div className="post-card-author-row">
                        <span>by <strong>{post.authorId?.username || 'Scout'}</strong></span>
                        <span>·</span>
                        <span>{new Date(post.createdAt).toLocaleDateString()}</span>
                        {post.place?.city && (
                          <>
                            <span>·</span>
                            <span>📍 {post.place.city}</span>
                          </>
                        )}
                      </div>

                      {post.tags && post.tags.length > 0 && (
                        <div className="post-tags-row">
                          {post.tags.slice(0, 4).map((t, idx) => (
                            <span key={idx} className="post-mini-tag">#{t}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {post.images && post.images.length > 0 && post.images[0].url && (
                      <div className="post-card-thumb">
                        <img src={post.images[0].url} alt={post.title} loading="lazy" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Rules & Flairs Sidebar */}
        <aside className="community-sidebar-column">
          {/* Rules Card */}
          <div className="sidebar-widget rules-widget">
            <h4>📜 Chapter Rules</h4>
            {community.rules && community.rules.length > 0 ? (
              <ol className="sidebar-rules-list">
                {community.rules.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ol>
            ) : (
              <p className="sidebar-empty-note">Standard Oddspot scout code of ethics applies.</p>
            )}
          </div>

          {/* Flairs Card */}
          {community.flairs && community.flairs.length > 0 && (
            <div className="sidebar-widget flairs-widget">
              <h4>🏷️ Topic Flairs</h4>
              <div className="sidebar-flairs-list">
                {community.flairs.map((f, i) => (
                  <span key={i} className="sidebar-flair-pill">
                    #{f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Scout Safety Notice */}
          <div className="sidebar-widget safety-widget">
            <h4>🛡️ Field Code</h4>
            <p>
              Always adhere to real-world safety: respect private property, stay on public right-of-ways, and fuzz pins where appropriate.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default CommunityDetailPage;
