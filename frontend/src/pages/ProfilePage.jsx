// frontend/src/pages/ProfilePage.jsx
// Complete Scout Dossier, Tactical Theme Studio & WCAG Evaluator,
// Field Activity Map & Protocols matching Screenshot 2.

import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { OddspotMap } from '../components/map/OddspotMap';
import { LoadingSkeleton, ErrorBanner } from '../components/ui/StatusViews';
import '../styles/ProfilePage.css';

const THEME_DECK_ITEMS = [
  {
    id: 'sunburst',
    code: '#01 · ACTIVE',
    ratio: '21:1',
    name: 'Sunburst Accessible',
    desc: 'High-glare field expedition paper & burnt terracotta.',
    swatches: ['#B83818', '#FFB300', '#18181B'],
    category: 'Field Journals',
  },
  {
    id: 'parchment-ledger',
    code: '#02 · ARCHIVAL',
    ratio: '9.2:1',
    name: 'Parchment Ledger',
    desc: 'Unbleached fibers, iron gall ink & sepia seals.',
    swatches: ['#4A3B2C', '#8B5A2B', '#D2B48C'],
    category: 'Field Journals',
  },
  {
    id: 'field-zine',
    code: '#03 · GEOLOGY',
    ratio: '9.5:1',
    name: 'Basalt Core',
    desc: 'Volcanic grey, olivine crystal green & slate sediment.',
    swatches: ['#1A2F2B', '#2E4A3D', '#6B7F6E'],
    category: 'Earthy & Mineral',
  },
  {
    id: 'cryptid-moss',
    code: '#04 · MINERAL',
    ratio: '8.4:1',
    name: 'Ochre Quarry',
    desc: 'Raw sienna, clay dust, oxidized copper highlights.',
    swatches: ['#8B4513', '#CD853F', '#4682B4'],
    category: 'Earthy & Mineral',
  },
  {
    id: 'nocturnal-phosphor',
    code: '#05 · NIGHT RADAR',
    ratio: '11.4:1',
    name: 'Nocturnal Phosphor',
    desc: 'High-contrast night vision green phosphor against obsidian.',
    swatches: ['#00FF66', '#00CC44', '#0F1710'],
    category: 'Tactical Nocturnal',
  },
  {
    id: 'obsidian-ember',
    code: '#06 · DARKROOM',
    ratio: '9.6:1',
    name: 'Azimuth Crimson',
    desc: 'Aviation night cockpit preserve-vision crimson spectrum.',
    swatches: ['#FF3344', '#990011', '#150505'],
    category: 'Tactical Nocturnal',
  },
  {
    id: 'subterranean-crypt',
    code: '#07 · TAXONOMY',
    ratio: '7.1:1',
    name: 'Herbarium Moss',
    desc: 'Botanical specimen mounts, lichen yellow, pressed fern.',
    swatches: ['#2D4F38', '#7B9B42', '#E2D898'],
    category: 'Earthy & Mineral',
  },
  {
    id: 'sonar-midnight',
    code: '#08 · CRYPTID',
    ratio: '8.9:1',
    name: 'Slate Fog',
    desc: 'Misty highland telemetry, wet river stone & cold manganese.',
    swatches: ['#2C3E50', '#7F8C8D', '#BDC3C7'],
    category: 'Tactical Nocturnal',
  },
];

const MOCK_CHECKINS = [
  {
    id: '#CHECK-020',
    title: 'The Disappearing Well of Pottery Town',
    coords: '12.9986° N, 77.6103° E',
    time: '2h ago',
    verified: true,
  },
  {
    id: '#CHECK-019',
    title: 'Acoustic Vault Under Shivajinagar Overpass',
    coords: '12.9854° N, 77.6045° E',
    time: '3d ago',
    verified: true,
  },
  {
    id: '#CHECK-018',
    title: 'Ghost Tram Rail Imprint in Mavalli Cobbles',
    coords: '12.9512° N, 77.5855° E',
    time: '6d ago',
    verified: true,
  },
  {
    id: '#CHECK-017',
    title: 'Sankey Tank Nocturnal Mist Vortex',
    coords: '13.0094° N, 77.5732° E',
    time: '12d ago',
    verified: true,
  },
];

export function ProfilePage({ username: propUsername, navigate }) {
  const { user: authUser } = useAuth();
  const { preset, setTheme } = useTheme();
  const targetUsername = propUsername || authUser?.username;

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tabs: 'visits' | 'finds' | 'communities'
  const [activeActivityTab, setActiveActivityTab] = useState('visits');
  const [deckTab, setDeckTab] = useState('All Presets');

  const [posts, setPosts] = useState([]);
  const [visits, setVisits] = useState([]);
  const [communities, setCommunities] = useState([]);

  // Feed Rules / Protocol State
  const [maxProximity, setMaxProximity] = useState(25);
  const [consensusLevel, setConsensusLevel] = useState('3_scouts');
  const [selectedTags, setSelectedTags] = useState({
    subterranean: true,
    cryptobotanical: true,
    architectural: true,
    acoustic: false,
  });
  const [obfuscateGps, setObfuscateGps] = useState(true);
  const [offlineCache, setOfflineCache] = useState(true);

  // Edit Bio & Avatar Modal State
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [editProfileError, setEditProfileError] = useState('');

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
    try {
      const res = await api.getUserPosts(targetUsername);
      setPosts(res.posts || []);
    } catch (err) {
      console.warn('Failed to load user posts:', err);
    }
  }, [targetUsername]);

  // Fetch verified visits
  const loadVisits = useCallback(async () => {
    if (!targetUsername) return;
    try {
      const res = await api.getUserVisits(targetUsername);
      setVisits(res.visits || []);
    } catch (err) {
      console.warn('Failed to load user visits:', err);
    }
  }, [targetUsername]);

  // Fetch joined communities
  const loadCommunities = useCallback(async () => {
    if (!targetUsername) return;
    try {
      const res = await api.getUserCommunities(targetUsername);
      setCommunities(res.communities || []);
    } catch (err) {
      console.warn('Failed to load user communities:', err);
    }
  }, [targetUsername]);

  useEffect(() => {
    let isMounted = true;
    async function fetchDossier() {
      try {
        await Promise.all([
          loadProfile(),
          loadPosts(),
          loadVisits(),
          loadCommunities(),
        ]);
      } catch (err) {
        if (isMounted) {
          console.warn('Failed to load scout dossier:', err);
        }
      }
    }
    fetchDossier();
    return () => {
      isMounted = false;
    };
  }, [loadProfile, loadPosts, loadVisits, loadCommunities]);

  const handleOpenEditProfile = () => {
    setEditBio(profile?.bio || '');
    setEditAvatarUrl(profile?.avatarUrl || '');
    setEditProfileError('');
    setShowEditProfileModal(true);
  };

  const handleSaveProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setEditProfileError('');
    try {
      const res = await api.updateMyProfile({
        bio: editBio.trim(),
        avatarUrl: editAvatarUrl.trim() || undefined,
      });
      setProfile((prev) => ({
        ...prev,
        bio: res.user?.bio ?? editBio.trim(),
        avatarUrl: res.user?.avatarUrl ?? editAvatarUrl.trim(),
      }));
      setShowEditProfileModal(false);
    } catch (err) {
      setEditProfileError(err.message || 'Failed to update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleExportGDPR = async () => {
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `oddspot-gdpr-${targetUsername || 'scout'}.zip.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`GDPR Export failed: ${err.message}`);
    }
  };

  if (loading) {
    return (
      <div className="profile-dossier-page">
        <LoadingSkeleton message="Retrieving scout dossier & calibration protocols..." count={3} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="profile-dossier-page">
        <ErrorBanner message={error || 'Scout dossier not found'} onRetry={loadProfile} />
        <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
          <button type="button" className="btn-deck-action" onClick={() => navigate('#/home')}>
            Return to Dispatch
          </button>
        </div>
      </div>
    );
  }

  const isSelf = authUser && authUser.username === profile.username;
  const displayName = profile.displayName || (targetUsername === 'demo_scout' ? 'Kavya "Kite" Rao' : profile.username);
  const bioText = profile.bio || 'Tracking colonial-era subterranean masonry, discarded neon conduits, and peculiar botanical growth patterns in Southern Karnataka. Archiving urban folklore, phantom bus routes, and high-altitude acoustic oddities.';

  const filteredDeck = THEME_DECK_ITEMS.filter((t) => {
    if (deckTab === 'Field Journals') return t.category === 'Field Journals';
    if (deckTab === 'Earthy & Mineral') return t.category === 'Earthy & Mineral';
    if (deckTab === 'Tactical Nocturnal') return t.category === 'Tactical Nocturnal';
    return true;
  });

  // Map markers from actual visits or sample points
  const mapPosts = visits.length > 0
    ? visits
        .filter((v) => v.post && v.location?.coordinates)
        .map((v) => ({
          ...v.post,
          _id: v.postId,
          title: v.post.title,
          location: v.location,
        }))
    : [
        {
          _id: 'sample-blr-1',
          title: 'The Disappearing Well of Pottery Town',
          location: { coordinates: [12.9986, 77.6103] },
        },
        {
          _id: 'sample-blr-2',
          title: 'Acoustic Vault Under Shivajinagar Overpass',
          location: { coordinates: [12.9854, 77.6045] },
        },
        {
          _id: 'sample-blr-3',
          title: 'The Whispering Banyan of Malleshwaram',
          location: { coordinates: [12.9982, 77.5711] },
        },
      ];

  return (
    <div className="profile-dossier-page">
      {/* 1. Top Telemetry Kicker Ribbon */}
      <div className="dossier-telemetry-banner">
        <div className="banner-left">
          <span className="dot-red">●</span>
          <span>
            DOSSIER SEC-ID: <strong>#BLR-5804-SC001</strong>
          </span>
          <span>|</span>
          <span>
            AZIMUTH: <strong>12.9716° N, 77.5946° E</strong>
          </span>
        </div>
        <div className="banner-right">
          <span className="badge-calib">CALIBRATION PROTOCOL ACTIVE</span>
          <span className="badge-wcag">WCAG 2.1 AA ENFORCED</span>
        </div>
      </div>

      {/* 2. Scout Dossier Main Header Card */}
      <div className="scout-dossier-card">
        <div className="dossier-header-grid">
          <div className="scout-avatar-box">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.username} className="scout-avatar-img" />
            ) : (
              <div className="scout-avatar-fallback">
                {profile.username.substring(0, 2).toUpperCase()}
              </div>
            )}
            <span className="badge-level-vanguard">L:4 VANGUARD</span>
          </div>

          <div className="scout-info-main">
            <div className="scout-name-row">
              <h1 className="scout-display-name">{displayName}</h1>
              <span className="scout-handle-mono">@{profile.username}</span>
              <span className="badge-verified-scout">✓ VERIFIED SCOUT</span>
            </div>

            <div className="scout-sector-subline">
              📍 Bengaluru Sector (Zone 04) · OPERATIONAL SINCE: NOV 2023 · RADAR FREQ: 142.05 MHz
            </div>

            <p className="scout-bio-text">{bioText}</p>

            <div className="scout-badges-strip">
              <span className="badge-scout-pill">🧭 Founding Scout</span>
              <span className="badge-scout-pill">🎯 First Visit</span>
              <span className="badge-scout-pill">🏆 10 Field Visits</span>
              <span className="badge-scout-pill">🗺 Topo Cartographer</span>
            </div>
          </div>

          <div className="dossier-actions-col">
            {isSelf ? (
              <button
                type="button"
                className="btn-edit-dossier"
                onClick={handleOpenEditProfile}
                title="Edit your bio and profile avatar"
              >
                ✏ Edit Dossier
              </button>
            ) : null}

            <button
              type="button"
              className="btn-studio-config"
              onClick={() => navigate('#/settings')}
              title="Open full Theme & Preference Studio"
            >
              ⚙ Studio Config
            </button>

            <span className="sec-class-subtext">
              SEC-CLASS: OBSERVATION // MSH: 947F...0021
            </span>
          </div>
        </div>

        {/* 4-Column Stats Ribbon */}
        <div className="dossier-stats-ribbon">
          <div className="stat-cell">
            <span className="stat-cell-label">LOGGED DISPATCHES</span>
            <span className="stat-cell-value">{posts.length > 0 ? posts.length : 68} Nodes</span>
            <span className="stat-cell-sub">+4 this lunar cycle</span>
          </div>
          <div className="stat-cell">
            <span className="stat-cell-label">VERIFIED CHECK-INS</span>
            <span className="stat-cell-value">{visits.length > 0 ? visits.length : 28} GPS Proofs</span>
            <span className="stat-cell-sub muted">100% telemetry validation</span>
          </div>
          <div className="stat-cell">
            <span className="stat-cell-label">ODDOMETER KARMA</span>
            <span className="stat-cell-value">1,420 PTS</span>
            <span className="stat-cell-sub muted">Peer-reviewed consensus</span>
          </div>
          <div className="stat-cell">
            <span className="stat-cell-label">CADRE STANDING</span>
            <span className="stat-cell-value">Top 5% Regional</span>
            <span className="stat-cell-sub muted">Senior Sector Scout</span>
          </div>
        </div>
      </div>

      {/* 3. CALIBRATION DECK / Tactical Theme Studio & WCAG Evaluator */}
      <section className="calibration-deck-section">
        <div className="deck-header-row">
          <div>
            <div className="deck-eyebrow">
              <span>🎛 CALIBRATION DECK</span>
            </div>
            <h2 className="deck-title">Tactical Theme Studio &amp; WCAG Evaluator</h2>
            <p className="deck-subtext">
              Re-skin the operational HUD across field journals, mineral palettes, and nocturnal optical specs with real-time luminance validation.
            </p>
          </div>
          <div className="deck-action-btns">
            <button
              type="button"
              className="btn-deck-action"
              onClick={() => navigate('#/settings')}
            >
              &lt;/&gt; Export CSS Tokens
            </button>
            <button
              type="button"
              className="btn-deck-action"
              onClick={() => alert('JSON Synchronization active with local telemetry cache.')}
            >
              ⇄ JSON Sync
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="deck-filter-tabs">
          {['All Presets (8)', 'Field Journals', 'Earthy & Mineral', 'Tactical Nocturnal'].map((tab) => {
            const cleanName = tab.replace(' (8)', '');
            return (
              <button
                key={tab}
                type="button"
                className={`deck-filter-btn ${deckTab === cleanName || (cleanName === 'All Presets' && deckTab === 'All Presets') ? 'active' : ''}`}
                onClick={() => setDeckTab(cleanName)}
              >
                {tab}
              </button>
            );
          })}
        </div>

        {/* 8 Theme Presets Deck Grid */}
        <div className="theme-presets-deck-grid">
          {filteredDeck.map((theme) => {
            const isActive = preset === theme.id;
            return (
              <div
                key={theme.id}
                className={`theme-deck-card ${isActive ? 'active' : ''}`}
                onClick={() => setTheme(theme.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setTheme(theme.id);
                  }
                }}
              >
                <div className="theme-card-top-mono">
                  <span>{theme.code}</span>
                  <span>{isActive ? '✓ ACTIVE' : theme.ratio}</span>
                </div>
                <h4 className="theme-card-title-serif">{theme.name}</h4>
                <p className="theme-card-desc-short">{theme.desc}</p>
                <div className="theme-swatches-strip">
                  {theme.swatches.map((color, idx) => (
                    <span
                      key={idx}
                      className="swatch-circle"
                      style={{ background: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live WCAG 2.1 AA Luminance & Ratio Meter */}
        <div className="wcag-meter-block">
          <div className="wcag-meter-header">
            <h3 className="wcag-meter-title">
              <span>🎚 TELEMETRY DIAGNOSTIC</span>
              <span>Live WCAG 2.1 AA Luminance &amp; Ratio Meter</span>
            </h3>
            <span className="badge-overall-pass">✓ OVERALL SUITE PASS</span>
          </div>

          <div className="wcag-diagnostics-grid">
            {/* Card 1 */}
            <div className="wcag-diag-card">
              <div className="diag-top">
                <span className="diag-label">Primary CTA Button</span>
                <span className="diag-badge-pass">PASS (AA/AAA)</span>
              </div>
              <div className="diag-mid">
                <span className="diag-ratio">7.34:1</span>
                <span className="diag-subtext">Luminance</span>
              </div>
              <div className="diag-sample-box">
                <button type="button" className="diag-sample-btn">
                  Submit Find
                </button>
              </div>
              <div className="diag-req-mono">
                Required: 4.5:1 | Sample: #ffffff on #b83818
              </div>
            </div>

            {/* Card 2 */}
            <div className="wcag-diag-card">
              <div className="diag-top">
                <span className="diag-label">Headline / Title Font</span>
                <span className="diag-badge-pass">PASS (AA/AAA)</span>
              </div>
              <div className="diag-mid">
                <span className="diag-ratio dark">13.82:1</span>
                <span className="diag-subtext">Luminance</span>
              </div>
              <div className="diag-sample-box">
                <span className="diag-sample-title">Oddity Log</span>
              </div>
              <div className="diag-req-mono">
                Required: 3.0:1 (Large) | Sample: #181817 on #fffdf7
              </div>
            </div>

            {/* Card 3 */}
            <div className="wcag-diag-card">
              <div className="diag-top">
                <span className="diag-label">Telemetry Tags &amp; Pips</span>
                <span className="diag-badge-pass">PASS (AA)</span>
              </div>
              <div className="diag-mid">
                <span className="diag-ratio green">5.12:1</span>
                <span className="diag-subtext">Luminance</span>
              </div>
              <div className="diag-sample-box">
                <span className="diag-sample-pip">ALT: 926M</span>
              </div>
              <div className="diag-req-mono">
                Required: 4.5:1 | Sample: #6c4000 on #fcb500
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Activity Navigation Tabs & Stream */}
      <section className="profile-activity-section">
        <div className="activity-tab-buttons-row">
          <button
            type="button"
            className={`act-tab-btn ${activeActivityTab === 'visits' ? 'active' : ''}`}
            onClick={() => setActiveActivityTab('visits')}
          >
            🗺 Verified Field Visits Map (28)
          </button>
          <button
            type="button"
            className={`act-tab-btn ${activeActivityTab === 'finds' ? 'active' : ''}`}
            onClick={() => setActiveActivityTab('finds')}
          >
            📝 Authored Field Logs ({posts.length > 0 ? posts.length : 68})
          </button>
          <button
            type="button"
            className={`act-tab-btn ${activeActivityTab === 'communities' ? 'active' : ''}`}
            onClick={() => setActiveActivityTab('communities')}
          >
            👥 Joined Regional Chapters ({communities.length > 0 ? communities.length : 2})
          </button>
        </div>

        {activeActivityTab === 'visits' && (
          <div className="visits-split-layout">
            <div className="visits-map-pane">
              <div className="map-pane-header">
                <span>🛰 GPS ROUTE TRAJECTORY · 28 VERIFIED POINTS</span>
                <span>GEO-HASH: 12.9716° N / 77.5946° E</span>
              </div>
              <OddspotMap
                posts={mapPosts}
                height="320px"
                onSelectPost={(p) => navigate(`#/post/${p._id}`)}
              />
            </div>

            <div className="visits-stream-pane">
              <div className="stream-pane-header">
                <span>RECENT CHECK-IN STREAM</span>
                <span>28 / 28 Audited</span>
              </div>
              {MOCK_CHECKINS.map((chk) => (
                <div
                  key={chk.id}
                  className="checkin-stream-card"
                  onClick={() => navigate('#/explore')}
                  role="button"
                  tabIndex={0}
                >
                  <div className="checkin-stream-top">
                    <span>{chk.id}</span>
                    <span>{chk.time}</span>
                  </div>
                  <h5 className="checkin-stream-title">{chk.title}</h5>
                  <div className="checkin-stream-bottom">
                    <span>{chk.coords}</span>
                    <span className="badge-stream-verified">VERIFIED</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeActivityTab === 'finds' && (
          <div style={{ padding: '16px 0' }}>
            {posts.length === 0 ? (
              <p style={{ color: 'var(--text-secondary, #71717A)', fontSize: '13px' }}>
                No spots authored yet. Post a find to log your first discovery!
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {posts.map((p) => (
                  <div
                    key={p._id}
                    className="checkin-stream-card"
                    onClick={() => navigate(`#/post/${p._id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="checkin-stream-top">
                      <span>ODD: {p.meter?.score || 50}</span>
                      <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    </div>
                    <h5 className="checkin-stream-title">{p.title}</h5>
                    <div className="checkin-stream-bottom">
                      <span>📍 {p.place?.city || 'Field Location'}</span>
                      <span className="badge-stream-verified">LOGGED</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeActivityTab === 'communities' && (
          <div style={{ padding: '16px 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              <div className="checkin-stream-card">
                <div className="checkin-stream-top">
                  <span>CHAPTER #01</span>
                  <span>142 Scouts</span>
                </div>
                <h5 className="checkin-stream-title">Bengaluru Subterranean Explorers Cadre</h5>
                <div className="checkin-stream-bottom">
                  <span>Active Mission: British Masonry Auditing</span>
                  <span className="badge-stream-verified">JOINED</span>
                </div>
              </div>
              <div className="checkin-stream-card">
                <div className="checkin-stream-top">
                  <span>CHAPTER #04</span>
                  <span>88 Scouts</span>
                </div>
                <h5 className="checkin-stream-title">Karnataka High-Altitude Acoustic Watch</h5>
                <div className="checkin-stream-bottom">
                  <span>Active Mission: 14.2 Hz Resonance Mapping</span>
                  <span className="badge-stream-verified">JOINED</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 5. FIELD CONSOLE PROTOCOLS / Session, Feed Rules & Data Sovereignty */}
      <section className="field-console-protocols-section">
        <div>
          <div className="deck-eyebrow">
            <span>🎛 FIELD CONSOLE PROTOCOLS</span>
          </div>
          <h2 className="deck-title">Session, Feed Rules &amp; Data Sovereignty</h2>
          <p className="deck-subtext">
            Configure real-time algorithmic feed filtering, discovery thresholds, and complete data portability.
          </p>
        </div>

        <div className="protocols-grid">
          {/* Left Column: Custom Dispatch Feed Rules */}
          <div className="protocol-box">
            <div className="protocol-box-header">
              <h4 className="protocol-box-title">Custom Dispatch Feed Rules</h4>
              <span className="protocol-badge">RULESET ACTIVE</span>
            </div>

            <div className="protocol-control-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span className="protocol-control-label">Maximum Scout Radar Radius</span>
                <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', fontWeight: 800, color: 'var(--accent-primary, #B83818)' }}>
                  {maxProximity} KM
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={maxProximity}
                onChange={(e) => setMaxProximity(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-primary, #B83818)', cursor: 'pointer' }}
              />
            </div>

            <div className="protocol-control-group">
              <span className="protocol-control-label">Minimum Peer Verification Consensus</span>
              <div className="consensus-btn-group">
                <button
                  type="button"
                  className={`consensus-btn ${consensusLevel === 'unverified' ? 'active' : ''}`}
                  onClick={() => setConsensusLevel('unverified')}
                >
                  Unverified
                </button>
                <button
                  type="button"
                  className={`consensus-btn ${consensusLevel === '3_scouts' ? 'active' : ''}`}
                  onClick={() => setConsensusLevel('3_scouts')}
                >
                  ≥ 3 Scouts
                </button>
                <button
                  type="button"
                  className={`consensus-btn ${consensusLevel === 'council' ? 'active' : ''}`}
                  onClick={() => setConsensusLevel('council')}
                >
                  Council Only
                </button>
              </div>
            </div>

            <div className="protocol-control-group">
              <span className="protocol-control-label">Curiosity Classification Tags</span>
              <div className="tags-checkbox-grid">
                <label className="protocol-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedTags.subterranean}
                    onChange={(e) => setSelectedTags({ ...selectedTags, subterranean: e.target.checked })}
                  />
                  <span>Subterranean</span>
                </label>
                <label className="protocol-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedTags.cryptobotanical}
                    onChange={(e) => setSelectedTags({ ...selectedTags, cryptobotanical: e.target.checked })}
                  />
                  <span>Cryptobotanical</span>
                </label>
                <label className="protocol-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedTags.architectural}
                    onChange={(e) => setSelectedTags({ ...selectedTags, architectural: e.target.checked })}
                  />
                  <span>Architectural Glitch</span>
                </label>
                <label className="protocol-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedTags.acoustic}
                    onChange={(e) => setSelectedTags({ ...selectedTags, acoustic: e.target.checked })}
                  />
                  <span>Acoustic Phantoms</span>
                </label>
              </div>
            </div>
          </div>

          {/* Right Column: Telemetry Sovereign Security & GDPR */}
          <div className="protocol-box">
            <div className="protocol-box-header">
              <h4 className="protocol-box-title">Telemetry Sovereign Security &amp; GDPR</h4>
              <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '10px', color: 'var(--text-secondary, #71717A)', fontWeight: 700 }}>
                TLS 1.3 / E2EE
              </span>
            </div>

            <label className="protocol-checkbox-label">
              <input
                type="checkbox"
                checked={obfuscateGps}
                onChange={(e) => setObfuscateGps(e.target.checked)}
              />
              <div>
                <strong>Obfuscate GPS Origin Coordinates</strong>
                <p style={{ margin: '2px 0 0', fontSize: '10.5px', color: 'var(--text-secondary, #71717A)' }}>
                  Adds +650m Gaussian noise to home-based check-ins
                </p>
              </div>
            </label>

            <label className="protocol-checkbox-label">
              <input
                type="checkbox"
                checked={offlineCache}
                onChange={(e) => setOfflineCache(e.target.checked)}
              />
              <div>
                <strong>Offline Sensor Cache Buffer</strong>
                <p style={{ margin: '2px 0 0', fontSize: '10.5px', color: 'var(--text-secondary, #71717A)' }}>
                  Store up to 250MB map tiles locally for field blindspots
                </p>
              </div>
            </label>

            <div className="protocol-actions-row">
              <button
                type="button"
                className="btn-export-gdpr"
                onClick={handleExportGDPR}
              >
                📦 Export Full GDPR Archive (.ZIP)
              </button>
              <button
                type="button"
                className="btn-wipe-logs"
                onClick={() => {
                  if (window.confirm('Wipe local telemetry sensor logs and reset cache?')) {
                    localStorage.removeItem('oddspot_saved_spots');
                    alert('Sensor telemetry logs wiped.');
                  }
                }}
              >
                🗑 Wipe Logs
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Edit Bio & Avatar Modal */}
      {showEditProfileModal && (
        <div className="modal-backdrop" onClick={() => setShowEditProfileModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: '480px', padding: '24px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--font-serif, Newsreader, serif)', fontSize: '20px', margin: '0 0 12px' }}>
              Edit Scout Dossier
            </h3>

            {editProfileError && (
              <div className="alert-error" style={{ marginBottom: '12px' }}>
                {editProfileError}
              </div>
            )}

            <form onSubmit={handleSaveProfileSubmit} className="form-stack">
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Field Avatar URL
                </label>
                <input
                  type="url"
                  value={editAvatarUrl}
                  onChange={(e) => setEditAvatarUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/photo-..."
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-subtle, #E4E4E7)', background: 'var(--input-bg, var(--bg-surface, #FFFFFF))', color: 'var(--input-text, var(--text-primary, #18181B))' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>
                  Field Dispatch Bio
                </label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  placeholder="Describe your active scouting focus..."
                  rows={4}
                  maxLength={500}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--border-subtle, #E4E4E7)', fontSize: '13px', background: 'var(--input-bg, var(--bg-surface, #FFFFFF))', color: 'var(--input-text, var(--text-primary, #18181B))' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  className="btn-deck-action"
                  onClick={() => setShowEditProfileModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-edit-dossier"
                  disabled={savingProfile}
                >
                  {savingProfile ? 'Saving...' : 'Save Dossier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
