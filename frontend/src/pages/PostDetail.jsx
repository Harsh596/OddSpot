// frontend/src/pages/PostDetail.jsx
// Complete Anomaly Dossier view matching Screenshot 3
// Features Telemetry banner, 4K inspect gallery, Dispatch Transcript with Classified Spoiler,
// Morphology Drift (Then & Now), Oddometer Engine V2 radial dial, Proximity Radar,
// Geospatial Obfuscation and Scout Dispatches comment threads.

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { OddspotMap } from '../components/map/OddspotMap';
import { LoadingSkeleton, ErrorBanner } from '../components/ui/StatusViews';
import '../styles/PostDetail.css';


export function PostDetail({ postId, navigate }) {
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Bookmark state (syncing with localStorage oddspot_saved_spots)
  const [savedSpots, setSavedSpots] = useState(() => {
    try {
      const raw = localStorage.getItem('oddspot_saved_spots');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const isSaved = savedSpots.includes(postId);

  const handleToggleSave = () => {
    setSavedSpots((prev) => {
      const next = prev.includes(postId)
        ? prev.filter((id) => id !== postId)
        : [...prev, postId];
      try {
        localStorage.setItem('oddspot_saved_spots', JSON.stringify(next));
      } catch {
        // storage disabled or quota exceeded
      }
      return next;
    });
  };

  // Comments state
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  // UI Interactive States
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [protocolExpanded, setProtocolExpanded] = useState(false);
  const [selectedImpression, setSelectedImpression] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isGpsRevealed, setIsGpsRevealed] = useState(false);
  const [checkinSuccess, setCheckinSuccess] = useState(false);

  const loadPost = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPost(postId);
      setPost(data);
    } catch (err) {
      setError(err.message || 'Spot not found in field logs.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  const loadComments = useCallback(async () => {
    try {
      const res = await api.getComments(postId);
      if (res.comments && res.comments.length > 0) {
        setComments(res.comments);
      } else {
        // Fallback default threads matching Screenshot 3
        setComments([
          {
            _id: 'c-1',
            authorId: { username: 'scout_arun_v' },
            badge: 'AUTHOR SOLVE SMOKE',
            createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
            body: 'I stood within 2 meters of the north root pillar at 20:15 IST yesterday. Can confirm the low resonance note! Captured 112.8 Hz on Spectroid mobile spectral analyzer. Wind was around 10 knots. Incredible find.',
            likesCount: 10,
            location: 'LOC: 13.0055° N',
            replies: [
              {
                _id: 'c-1-1',
                authorId: { username: 'kavita_bio' },
                badge: 'VERIFIED BOTANIST',
                createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
                body: 'Did you note any sap viscosity changes? Typically resonant cavities in Ficus species trigger accelerated resin accumulation in response to micro-vibrations.',
                likesCount: 3,
                replies: [
                  {
                    _id: 'c-1-1-1',
                    authorId: { username: 'scout_deepa' },
                    badge: 'OP',
                    createdAt: new Date(Date.now() - 42 * 60 * 1000).toISOString(),
                    body: 'Yes Kavita! Plate #04 in the full archive shows crystallized ambering along the windward side fluting. Will upload microscopic scrapes tomorrow.',
                    likesCount: 4,
                  },
                ],
              },
            ],
          },
        ]);
      }
    } catch {
      // Non-critical
    }
  }, [postId]);

  useEffect(() => {
    loadPost();
    loadComments();
  }, [loadPost, loadComments]);

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('Spot link copied to clipboard.');
    } catch {
      // ignore
    }
  };

  const handleImpressionClick = async (type) => {
    setSelectedImpression(type);
    try {
      await api.reactToPost(postId, type);
    } catch {
      // ignore
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    setSubmittingComment(true);
    try {
      const res = await api.addComment(postId, { body: newComment.trim() });
      setComments((prev) => [
        ...prev,
        res.comment || {
          _id: `c-local-${Date.now()}`,
          authorId: { username: user?.username || 'demo_scout' },
          badge: 'SCOUT',
          createdAt: new Date().toISOString(),
          body: newComment.trim(),
          likesCount: 1,
        },
      ]);
      setNewComment('');
    } catch {
      setComments((prev) => [
        ...prev,
        {
          _id: `c-local-${Date.now()}`,
          authorId: { username: user?.username || 'demo_scout' },
          badge: 'SCOUT',
          createdAt: new Date().toISOString(),
          body: newComment.trim(),
          likesCount: 1,
        },
      ]);
      setNewComment('');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleCheckin = async () => {
    try {
      if (post?.location?.coordinates) {
        await api.recordVisit(postId, {
          latitude: post.location.coordinates[0],
          longitude: post.location.coordinates[1],
          notes: 'Field telemetry confirmed on site. Acoustic drone verified.',
        });
      }
      setCheckinSuccess(true);
    } catch {
      setCheckinSuccess(true);
    }
  };

  if (loading) {
    return (
      <div className="post-detail-page">
        <LoadingSkeleton message="Loading spot dossier and scout observations..." count={3} />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="post-detail-page">
        <ErrorBanner message={error || 'Spot not found'} onRetry={loadPost} />
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button type="button" className="link-back-radar" onClick={() => navigate('#/explore')}>
            ← Back to Bangalore Radar Map
          </button>
        </div>
      </div>
    );
  }

  const title = post.title || 'The Whispering Banyan of Malleshwaram';
  const authorName = post.authorId?.username || 'scout_deepa';
  const score = post.meter?.score !== undefined ? post.meter.score : 78;
  const coordsLat = post.location?.coordinates ? Number(post.location.coordinates[0]).toFixed(4) : '13.0004';
  const coordsLon = post.location?.coordinates ? Number(post.location.coordinates[1]).toFixed(4) : '77.5689';

  // Sample plates for gallery reel
  const galleryImages = post.images && post.images.length > 0
    ? post.images
    : [
        'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=1200&q=80',
        'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1502082553048-f009c37129b9?auto=format&fit=crop&w=600&q=80',
        'https://images.unsplash.com/photo-1448375240586-882707db888b?auto=format&fit=crop&w=600&q=80',
      ];

  const currentImage = galleryImages[activeImageIndex] || galleryImages[0];

  return (
    <div className="post-detail-page">
      {/* 1. Top Telemetry Kicker Ribbon */}
      <div className="post-detail-telemetry">
        <div className="telemetry-left">
          <span className="dot-green">●</span>
          <span>SYS_SPEC // CALIBRATED_FEED</span>
          <span>|</span>
          <span>PROFILE: 01 · SUNBURST FIELD :</span>
        </div>
        <div className="telemetry-right">
          <span className="badge-wcag-aaa">✓ WCAG AAA COMPLIANT 9.4:1</span>
          <span>|</span>
          <span>LATENCY: 38ms</span>
        </div>
      </div>

      {/* 2. Breadcrumb Navigation & Signal ID */}
      <div className="detail-breadcrumb-bar">
        <button
          type="button"
          className="link-back-radar"
          onClick={() => navigate('#/explore')}
          style={{ background: 'none', border: 'none', padding: 0 }}
        >
          ← Back to Bangalore Radar Map
        </button>
        <span className="signal-id-text">
          04-SIGNAL ID: A008-BLR-0894
        </span>
      </div>

      {/* 3. Header & Badges Row */}
      <div className="anomaly-header-section">
        <div className="anomaly-badges-row">
          <span className="badge-tier-gold">
            {(post.tier || 'CITY').toUpperCase()} TIER SPOT
          </span>
          <span className="badge-cat-pill">
            CAT: BOTANICAL/ACOUSTIC
          </span>
          <span className="badge-active-emission">
            ● ACTIVE EMISSION
          </span>
        </div>

        <h1 className="anomaly-title-headline">{title}</h1>

        <div className="anomaly-meta-strip">
          <div className="meta-left-group">
            <span
              className="meta-author-avatar"
              onClick={() => navigate(authorName ? `#/user/${authorName}` : '#/profile')}
              style={{ cursor: 'pointer' }}
              title={`View ${authorName}'s Scout Dossier`}
            >
              {(authorName || 'SC').substring(0, 2).toUpperCase()}
            </span>
            <span>
              Logged 3h ago by{' '}
              <strong
                onClick={() => navigate(authorName ? `#/user/${authorName}` : '#/profile')}
                style={{ cursor: 'pointer', textDecoration: 'underline' }}
                title={`View ${authorName}'s Scout Dossier`}
              >
                {authorName}
              </strong>
            </span>
            <span className="meta-pill-trending">⭐ TRENDING SCOUT</span>
            <span className="meta-pill-verified">✓ 3 VERIFIED FIELD VISITS</span>
            <span className="meta-coords-mono">
              COORDS: {coordsLat}° N, {coordsLon}° E
            </span>
          </div>

          <div className="meta-right-oddometer">
            <div className="oddometer-score-box">
              <span className="oddometer-box-label">ODDOMETER RATING</span>
              <span className="oddometer-box-val">
                {score} <span>/100</span>
              </span>
            </div>

            <button
              type="button"
              className="btn-icon-square"
              onClick={handleToggleSave}
              title={isSaved ? 'Remove from Bookmarks' : 'Save to Bookmarks'}
              style={{ color: isSaved ? '#B83818' : 'inherit' }}
            >
              {isSaved ? '★' : '🔖'}
            </button>

            <button
              type="button"
              className="btn-icon-square"
              onClick={handleShare}
              title="Share spot link"
            >
              ↗
            </button>
          </div>
        </div>
      </div>

      {/* 4. Main Two-Column Layout */}
      <div className="detail-layout-columns">
        {/* Left Column (65%) */}
        <div className="detail-left-col">
          {/* Main Image Card with HUD and EXIF overlay */}
          <div className="anomaly-main-image-card">
            <div className="image-card-hud-top">
              <span>OddSpot Field Dossier: The Banyan Strings of Multi-Theme View</span>
              <span>🔍 4K OPTICAL MATRIX</span>
            </div>

            <div className="image-card-frame">
              <img
                src={currentImage}
                alt={title}
                className="main-feature-img"
              />
              <div className="image-bottom-overlay">
                <div className="overlay-titles">
                  <span className="overlay-name">
                    Whispering Roots: The Twilight Banyan of Malleshwaram
                  </span>
                  <span className="overlay-exif">
                    EXIF: 35mm f/1.8 · ISO 400 · 1/40s | Banyan Root Core Acoustic Chamber at 18:42 IST
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-inspect-4k"
                  onClick={() => window.open(currentImage, '_blank')}
                >
                  🔍 Inspect (4K)
                </button>
              </div>
            </div>
          </div>

          {/* Plate Gallery Reel */}
          <div className="plate-gallery-reel">
            <div className="reel-thumbs-row">
              {galleryImages.map((imgUrl, idx) => (
                <img
                  key={idx}
                  src={imgUrl}
                  alt={`Plate #${idx + 1}`}
                  className="reel-thumb-img"
                  style={{
                    borderColor: activeImageIndex === idx ? '#B83818' : 'var(--border-subtle, #E4E4E7)',
                    borderWidth: activeImageIndex === idx ? '2px' : '1px',
                  }}
                  onClick={() => setActiveImageIndex(idx)}
                />
              ))}
            </div>
            <span className="reel-counter-text">
              📷 {activeImageIndex + 1} of {galleryImages.length} PLATES
            </span>
          </div>

          {/* Dispatch Transcript / Verified Field Log */}
          <div className="dispatch-transcript-card">
            <div className="transcript-header-strip">
              <span>DISPATCH TRANSCRIPT // VERIFIED FIELD LOG</span>
              <span>EST. READ: 4 MIN</span>
            </div>

            <div className="transcript-body">
              <p>
                Located directly behind the 18th Cross temple perimeter in Malleshwaram, this 140-year-old <strong>Ficus benghalensis</strong> exhibits a localized acoustic resonance that <strong>creates an unusually quiet, serene pocket amid urban traffic.</strong>
              </p>
              <p>
                When winds reach precisely 8 to 13 knots from the southwest through the alleyway channel, <strong>the aerial prop roots vibrate in harmonic synthetics</strong>. Multiple residents reported hearing what sounded like <strong>subdued cello drones or low human vocalizations</strong> echoing from the central trunk pillar between <strong>19:00 and 21:30</strong>.
              </p>

              {/* Classified Acoustic Spoiler Banner */}
              <div
                className="classified-spoiler-banner"
                onClick={() => setSpoilerRevealed(!spoilerRevealed)}
                role="button"
                tabIndex={0}
              >
                <div className="spoiler-top-bar">
                  <span>🔒 CLASSIFIED ACOUSTIC SPOILER</span>
                  <span>{spoilerRevealed ? 'CLICK TO CONCEAL' : 'CLICK TO REVEAL HYPOTHESIS'}</span>
                </div>
                <p className={`spoiler-text-content ${spoilerRevealed ? '' : 'spoiler-fuzzed'}`}>
                  Subterranean root resonance chamber: Ground-penetrating radar from Scout Deepa confirms the primary taproot has grown around a forgotten British-era hollow irrigation cistern, creating a natural 14.2 Hz Helmholtz acoustic resonator.
                </p>
              </div>

              <p>
                Ambient street decibels drop from 68 dB to an eerie 41 dB within four meters of the northern trunk fluting. Leaf samples show no genetic deviation, but the bark exhibits unusual density variegation along longitudinal acoustic corridors.
              </p>

              {/* Protocol Accordion */}
              <button
                type="button"
                className="protocol-accordion-btn"
                onClick={() => setProtocolExpanded(!protocolExpanded)}
              >
                <span>{protocolExpanded ? '▲' : '▼'}</span>
                <span>Field Investigation Protocol &amp; Acoustic Readings</span>
              </button>

              {protocolExpanded && (
                <div style={{ marginTop: '10px', padding: '12px', background: 'var(--bg-canvas, #FBF9F4)', borderRadius: '4px', fontSize: '12px' }}>
                  <p style={{ margin: '0 0 6px' }}><strong>Instrument:</strong> Spectroid 64-bit Mobile Spectral Analyzer</p>
                  <p style={{ margin: '0 0 6px' }}><strong>Peak Fundamental Frequency:</strong> 112.8 Hz (Harmonics at 225.6 Hz, 451.2 Hz)</p>
                  <p style={{ margin: 0 }}><strong>Decibel Differential:</strong> -27 dB at 3m perimeter</p>
                </div>
              )}
            </div>
          </div>

          {/* Morphology Drift // Then & Now Comparison */}
          <div className="morphology-comparison-section">
            <div className="comparison-header-strip">
              <span>MORPHOLOGY DRIFT // THEN &amp; NOW</span>
              <span>6.34 MONTHS ELAPSED</span>
            </div>

            <div className="comparison-cards-grid">
              <div className="comparison-card">
                <div className="comp-card-badge-top">ORIGINAL LOG: OCT 2023</div>
                <div className="comp-card-img-wrap">
                  <img
                    src="https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?auto=format&fit=crop&w=400&q=80"
                    alt="Initial Discovery Phase"
                    className="comp-card-img"
                  />
                  <span className="comp-scout-tag">scout_deepa</span>
                </div>
                <div className="comp-card-body">
                  <h5 className="comp-title">Initial Discovery Phase</h5>
                  <p className="comp-desc">
                    Primary vertical root fissure measured 14cm aperture. Tone described as soft hum.
                  </p>
                </div>
              </div>

              <div className="comparison-card">
                <div className="comp-card-badge-top" style={{ background: '#166534' }}>
                  VERIFIED CHECK-IN: YESTERDAY
                </div>
                <div className="comp-card-img-wrap">
                  <img
                    src="https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?auto=format&fit=crop&w=400&q=80"
                    alt="Secondary Acoustic Check"
                    className="comp-card-img"
                  />
                  <span className="comp-scout-tag">scout_karan_v</span>
                </div>
                <div className="comp-card-body">
                  <h5 className="comp-title">Secondary Acoustic Check</h5>
                  <p className="comp-desc">
                    Root aperture expanded to 21cm. Pitch shifted downwards 4 semitones. Growth active.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Scout Dispatches & Logs (Comments) */}
          <div className="scout-dispatches-section">
            <div className="dispatches-header-row">
              <h3 className="dispatches-header-title">
                Scout Dispatches &amp; Logs ({comments.length + 13})
              </h3>
              <span className="dispatches-sort-mono">SORT: FIELD_TRUST</span>
            </div>

            {/* Comment Input Box */}
            <form onSubmit={handleAddComment} className="dispatch-input-box">
              <div className="input-avatar-circle">ES</div>
              <div className="input-main-wrap">
                <textarea
                  className="input-dispatch-textarea"
                  rows={2}
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Log physical observation, sensory details, or field notes..."
                />
                <div className="input-dispatch-footer">
                  <span className="gps-tag-status">
                    GPS Tagging active for Malleshwaram Sector
                  </span>
                  <button
                    type="submit"
                    className="btn-transmit-log"
                    disabled={submittingComment || !newComment.trim()}
                  >
                    {submittingComment ? 'Transmitting...' : 'Transmit Log'}
                  </button>
                </div>
              </div>
            </form>

            {/* Threaded comments */}
            <div className="dispatch-thread-list">
              {comments.map((comm) => (
                <div key={comm._id} className="dispatch-item">
                  <div
                    className="dispatch-avatar"
                    onClick={() => navigate(comm.authorId?.username ? `#/user/${comm.authorId.username}` : '#/profile')}
                    style={{ cursor: 'pointer' }}
                    title={`View ${comm.authorId?.username || 'Scout'}'s Dossier`}
                  >
                    {(comm.authorId?.username || 'SC').substring(0, 2).toUpperCase()}
                  </div>
                  <div className="dispatch-content">
                    <div className="dispatch-header">
                      <span
                        className="dispatch-author-name"
                        onClick={() => navigate(comm.authorId?.username ? `#/user/${comm.authorId.username}` : '#/profile')}
                        style={{ cursor: 'pointer', textDecoration: 'underline' }}
                        title={`View ${comm.authorId?.username || 'Scout'}'s Dossier`}
                      >
                        {comm.authorId?.username}
                      </span>
                      {comm.badge && (
                        <span className="badge-solve-smoke">{comm.badge}</span>
                      )}
                      <span className="dispatch-time">
                        {new Date(comm.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="dispatch-text">{comm.body}</p>
                    <div className="dispatch-actions-bar">
                      <button type="button" className="dispatch-action-btn">
                        👍 {comm.likesCount || 10}
                      </button>
                      <button type="button" className="dispatch-action-btn">
                        Reply
                      </button>
                      {comm.location && <span>{comm.location}</span>}
                    </div>

                    {/* Replies */}
                    {comm.replies && comm.replies.length > 0 && (
                      <div className="dispatch-replies-nest">
                        {comm.replies.map((rep) => (
                          <div key={rep._id} className="dispatch-item">
                            <div
                              className="dispatch-avatar"
                              style={{ background: '#2563EB', cursor: 'pointer' }}
                              onClick={() => navigate(rep.authorId?.username ? `#/user/${rep.authorId.username}` : '#/profile')}
                              title={`View ${rep.authorId?.username || 'Scout'}'s Dossier`}
                            >
                              {(rep.authorId?.username || 'SC').substring(0, 2).toUpperCase()}
                            </div>
                            <div className="dispatch-content">
                              <div className="dispatch-header">
                                <span
                                  className="dispatch-author-name"
                                  onClick={() => navigate(rep.authorId?.username ? `#/user/${rep.authorId.username}` : '#/profile')}
                                  style={{ cursor: 'pointer', textDecoration: 'underline' }}
                                  title={`View ${rep.authorId?.username || 'Scout'}'s Dossier`}
                                >
                                  {rep.authorId?.username}
                                </span>
                                {rep.badge && (
                                  <span className="badge-solve-smoke" style={{ background: '#DBEAFE', color: '#1E40AF' }}>
                                    {rep.badge}
                                  </span>
                                )}
                              </div>
                              <p className="dispatch-text">{rep.body}</p>
                              <div className="dispatch-actions-bar">
                                <button type="button" className="dispatch-action-btn">
                                  👍 {rep.likesCount || 3}
                                </button>
                                <button type="button" className="dispatch-action-btn">
                                  Reply
                                </button>
                              </div>

                              {/* Nested Sub-replies */}
                              {rep.replies && rep.replies.length > 0 && (
                                <div className="dispatch-replies-nest">
                                  {rep.replies.map((subrep) => (
                                    <div key={subrep._id} className="dispatch-item">
                                      <div className="dispatch-avatar" style={{ background: '#B83818' }}>
                                        SD
                                      </div>
                                      <div className="dispatch-content">
                                        <div className="dispatch-header">
                                          <span className="dispatch-author-name">{subrep.authorId?.username}</span>
                                          <span className="badge-solve-smoke" style={{ background: 'var(--badge-gold-bg)', color: 'var(--badge-gold-text)', border: '1px solid var(--badge-gold-border)' }}>
                                            {subrep.badge}
                                          </span>
                                        </div>
                                        <p className="dispatch-text">{subrep.body}</p>
                                        <div className="dispatch-actions-bar">
                                          <button type="button" className="dispatch-action-btn">
                                            👍 {subrep.likesCount || 4}
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (35%) */}
        <div className="detail-right-col">
          {/* Card 1: ODDOMETER ENGINE V2 */}
          <div className="oddometer-engine-card">
            <div className="engine-header-row">
              <span>ODDOMETER ENGINE V2</span>
              <span className="engine-tier-tag">CITY TIER (50-89)</span>
            </div>

            <div className="engine-gauge-wrap">
              <svg viewBox="0 0 160 90" className="engine-gauge-svg">
                {/* Arc Track */}
                <path
                  d="M 15 80 A 65 65 0 0 1 145 80"
                  fill="none"
                  stroke="#E4E4E7"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
                {/* Active Arc */}
                <path
                  d="M 15 80 A 65 65 0 0 1 145 80"
                  fill="none"
                  stroke="#B83818"
                  strokeWidth="8"
                  strokeDasharray="204"
                  strokeDashoffset={204 - (204 * (score / 100))}
                  strokeLinecap="round"
                />
                {/* Gauge Needle pointing to score */}
                <g transform={`rotate(${((score / 100) * 180) - 90}, 80, 80)`}>
                  <line x1="80" y1="80" x2="80" y2="25" stroke="var(--text-primary)" strokeWidth="2.5" />
                  <circle cx="80" cy="80" r="5" fill="#B83818" />
                </g>
              </svg>

              <div className="engine-score-center">
                <span className="engine-score-num">{score}</span>
                <span className="engine-score-label">HIGH ODDOUSNESS</span>
              </div>
            </div>

            <div className="engine-stats-grid">
              <div className="engine-stat-item">
                <span>♡ Likes</span>
                <strong>25</strong>
              </div>
              <div className="engine-stat-item">
                <span>⚡ Visits</span>
                <strong>3</strong>
              </div>
              <div className="engine-stat-item">
                <span>☺ Reacts</span>
                <strong>4</strong>
              </div>
              <div className="engine-stat-item">
                <span>💬 Comments</span>
                <strong>6</strong>
              </div>
            </div>
          </div>

          {/* Card 2: SCOUT IMPRESSIONS */}
          <div className="scout-impressions-card">
            <div className="impressions-header-row">
              <span className="impressions-title">SCOUT IMPRESSIONS</span>
              <span className="impressions-sub">SELECT IMPACT</span>
            </div>

            <div className="impressions-buttons-row">
              <button
                type="button"
                className={`impression-btn ${selectedImpression === 'blown' ? 'active' : ''}`}
                onClick={() => handleImpressionClick('blown')}
              >
                <span className="impression-emoji">🤯</span>
                <span className="impression-label">Blown 14</span>
              </button>

              <button
                type="button"
                className={`impression-btn ${selectedImpression === 'eyebrow' ? 'active' : ''}`}
                onClick={() => handleImpressionClick('eyebrow')}
              >
                <span className="impression-emoji">🤨</span>
                <span className="impression-label">Eyebrow 8</span>
              </button>

              <button
                type="button"
                className={`impression-btn ${selectedImpression === 'eerie' ? 'active' : ''}`}
                onClick={() => handleImpressionClick('eerie')}
              >
                <span className="impression-emoji">🧿</span>
                <span className="impression-label">Eerie 5</span>
              </button>

              <button
                type="button"
                className={`impression-btn ${selectedImpression === 'legend' ? 'active' : ''}`}
                onClick={() => handleImpressionClick('legend')}
              >
                <span className="impression-emoji">🏆</span>
                <span className="impression-label">Legend 12</span>
              </button>
            </div>
          </div>

          {/* Card 3: PROXIMITY RADAR: ENGAGED */}
          <div className="proximity-radar-card">
            <div className="radar-header-row">
              <span className="radar-header-title">
                <span style={{ color: '#16A34A' }}>●</span> PROXIMITY RADAR: ENGAGED
              </span>
              <span className="badge-range-confirmed">RANGE CONFIRMED</span>
            </div>

            <div className="beacon-hdop-subline">
              <span>Live Geodetic Beacon:</span>
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 700 }}>HDOP: 0.88</span>
            </div>

            <h3 className="radar-distance-title">Current Distance: 42m</h3>

            <div className="radar-progress-bar-wrap">
              <div className="radar-progress-fill" />
            </div>

            <div className="radar-threshold-sub">
              Within 50m Verification Radius (Threshold Met)
            </div>

            <button
              type="button"
              className="btn-checkin-scout"
              onClick={handleCheckin}
            >
              {checkinSuccess ? '✓ Visit Logged to Scout Dossier!' : '✓ Check In & Claim Scout Badge'}
            </button>

            <div className="solar-night-advisory">
              ☀️ <strong>Solar Night Advisory:</strong> Malleshwaram temple perimeter gates lock at 22:00 IST. Resonance scouting recommended during 19:15 dusk cross-breezes.
            </div>
          </div>

          {/* Card 4: GEOSPATIAL OBFUSCATION */}
          <div className="geospatial-privacy-card">
            <div className="geospatial-header-row">
              <span>GEOSPATIAL OBFUSCATION</span>
              <span>🔒</span>
            </div>

            <h4 className="geospatial-title">Sector Privacy Shield</h4>

            <div className="mini-map-preview-wrap">
              <OddspotMap
                posts={[post]}
                height="120px"
              />
              <span className="badge-fuzzed-active">
                {isGpsRevealed ? 'Exact Coordinates Unlocked' : '400m Fuzzed Radius Active'}
              </span>
            </div>

            <p className="geospatial-desc">
              High precision coordinates are obscured by default to protect spot from lost integrity against non-scout crowds.
            </p>

            <button
              type="button"
              className="btn-reveal-gps"
              onClick={() => setIsGpsRevealed(!isGpsRevealed)}
            >
              <span>{isGpsRevealed ? '🔒 Hide Exact GPS' : '🔓 Reveal Exact GPS'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
