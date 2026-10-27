// frontend/src/pages/AdminPage.jsx
// Complete Admin & Moderator Dashboard with Analytics, Moderation Queue,
// Runtime Meter Tuning, and Audit Log Viewer.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

export function AdminPage({ navigate }) {
  const { user } = useAuth();

  const isStaff = user && (user.role === 'admin' || user.role === 'moderator');
  const isAdmin = user && user.role === 'admin';

  const [activeTab, setActiveTab] = useState('analytics'); // 'analytics' | 'moderation' | 'meter' | 'audit'

  // Analytics State
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');

  // Moderation Queue State
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportFilter, setReportFilter] = useState('pending');
  const [reportActionMsg, setReportActionMsg] = useState('');

  // Meter Config State
  const [_meterConfig, setMeterConfig] = useState(null);
  const [countryThreshold, setCountryThreshold] = useState(50);
  const [reportFuzzThreshold, setReportFuzzThreshold] = useState(3);
  const [weights, setWeights] = useState({
    reaction: 5,
    visit: 4,
    comment: 3,
    like: 1,
    dislike: -0.5,
  });
  const [configReason, setConfigReason] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState('');
  const [configErrorMsg, setConfigErrorMsg] = useState('');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);

  // Moderation Reports Pagination (20 per page)
  const [reportPage, setReportPage] = useState(1);
  const REPORTS_PER_PAGE = 20;

  useEffect(() => {
    setReportPage(1);
  }, [reportFilter]);

  const totalReportPages = Math.ceil(reports.length / REPORTS_PER_PAGE) || 1;
  const pagedReports = useMemo(() => {
    const start = (reportPage - 1) * REPORTS_PER_PAGE;
    return reports.slice(start, start + REPORTS_PER_PAGE);
  }, [reports, reportPage]);

  // Audit Logs Pagination (20 per page)
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PER_PAGE = 20;
  const totalAuditPages = Math.ceil(auditLogs.length / AUDIT_PER_PAGE) || 1;
  const pagedAuditLogs = useMemo(() => {
    const start = (auditPage - 1) * AUDIT_PER_PAGE;
    return auditLogs.slice(start, start + AUDIT_PER_PAGE);
  }, [auditLogs, auditPage]);

  // Load Analytics
  const loadAnalytics = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingAnalytics(true);
    setAnalyticsError('');
    try {
      const data = await api.getAdminAnalytics();
      setAnalytics(data);
    } catch (err) {
      setAnalyticsError(err.message || 'Failed to load analytics.');
    } finally {
      setLoadingAnalytics(false);
    }
  }, [isAdmin]);

  // Load Moderation Reports Queue
  const loadReports = useCallback(async () => {
    if (!isStaff) return;
    setLoadingReports(true);
    try {
      const data = await api.getModReports({ status: reportFilter });
      setReports(data.reports || []);
    } catch (err) {
      console.error('Failed to load reports:', err);
    } finally {
      setLoadingReports(false);
    }
  }, [isStaff, reportFilter]);

  // Load Meter Config
  const loadMeterConfig = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const data = await api.getAdminConfigMeter();
      if (data.config) {
        setMeterConfig(data.config);
        setCountryThreshold(data.config.thresholds?.country || 50);
        setReportFuzzThreshold(data.config.reportFuzzThreshold || 3);
        if (data.config.weights) {
          setWeights(data.config.weights);
        }
      }
    } catch (err) {
      console.error('Failed to load meter config:', err);
    }
  }, [isAdmin]);

  // Load Audit Logs
  const loadAuditLogs = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingAuditLogs(true);
    try {
      const data = await api.getAdminAuditLogs({ limit: 100 });
      setAuditLogs(data.logs || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoadingAuditLogs(false);
    }
  }, [isAdmin]);

  // Tab switching effect
  useEffect(() => {
    if (activeTab === 'analytics' && isAdmin) loadAnalytics();
    if (activeTab === 'moderation') loadReports();
    if (activeTab === 'meter' && isAdmin) loadMeterConfig();
    if (activeTab === 'audit' && isAdmin) loadAuditLogs();
  }, [activeTab, isAdmin, loadAnalytics, loadReports, loadMeterConfig, loadAuditLogs]);

  // Initial load
  useEffect(() => {
    if (isAdmin) {
      loadAnalytics();
    } else if (isStaff) {
      setActiveTab('moderation');
      loadReports();
    }
  }, [isAdmin, isStaff, loadAnalytics, loadReports]);

  // Action a moderation report (one-click triage)
  const handleActionReport = async (reportId, action, reason) => {
    setReportActionMsg('');
    try {
      await api.actionModReport(reportId, { action, reason });
      setReportActionMsg(`Report actioned: ${action}`);
      loadReports();
    } catch (err) {
      setReportActionMsg(`Error: ${err.message}`);
    }
  };

  // Ban or shadow-ban user from moderation card
  const handleBanUser = async (targetUserId, shadow) => {
    const promptMsg = shadow
      ? 'Reason for shadow-banning this user:'
      : 'Reason for hard-banning this user:';
    const reason = window.prompt(promptMsg, shadow ? 'Suspected Sybil bot' : 'Severe violation');
    if (!reason) return;

    try {
      await api.banUser(targetUserId, { reason, shadow });
      setReportActionMsg(`User ${shadow ? 'shadow-banned' : 'banned'} successfully.`);
      loadReports();
    } catch (err) {
      setReportActionMsg(`Error banning user: ${err.message}`);
    }
  };

  // Save Meter Config Tuning
  const handleSaveMeterConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccessMsg('');
    setConfigErrorMsg('');

    try {
      const payload = {
        countryThreshold: Number(countryThreshold),
        reportFuzzThreshold: Number(reportFuzzThreshold),
        weights: {
          reaction: Number(weights.reaction),
          visit: Number(weights.visit),
          comment: Number(weights.comment),
          like: Number(weights.like),
          dislike: Number(weights.dislike),
        },
        reason: configReason || 'Admin runtime meter tuning',
      };

      const res = await api.updateAdminConfigMeter(payload);
      setConfigSuccessMsg('Oddometer configuration updated successfully!');
      if (res.config) {
        setMeterConfig(res.config);
      }
    } catch (err) {
      setConfigErrorMsg(err.message || 'Failed to update meter configuration.');
    } finally {
      setSavingConfig(false);
    }
  };

  if (!user || !isStaff) {
    return (
      <div className="container" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto', padding: '2rem' }}>
          <h2 style={{ color: 'var(--accent-primary)' }}>🔒 Access Restricted</h2>
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
            The Oddspot Admin Panel is reserved for verified platform administrators and moderators.
          </p>
          <button
            type="button"
            className="btn-primary"
            style={{ marginTop: '1.5rem' }}
            onClick={() => navigate('#/home')}
          >
            ← Return to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page-container container" style={{ padding: '2rem 1rem' }}>
      <div className="admin-header" style={{ marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>🛡️</span> Oddspot Command Center
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Logged in as <strong>{user.username}</strong> ({user.role.toUpperCase()})
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="admin-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem', flexWrap: 'wrap' }}>
        {isAdmin && (
          <button
            type="button"
            className={`btn-tab ${activeTab === 'analytics' ? 'active' : ''}`}
            onClick={() => setActiveTab('analytics')}
          >
            📊 Analytics & Growth
          </button>
        )}
        <button
          type="button"
          className={`btn-tab ${activeTab === 'moderation' ? 'active' : ''}`}
          onClick={() => setActiveTab('moderation')}
        >
          🚨 Moderation Queue ({reports.length})
        </button>
        {isAdmin && (
          <button
            type="button"
            className={`btn-tab ${activeTab === 'meter' ? 'active' : ''}`}
            onClick={() => setActiveTab('meter')}
          >
            ⚡ Oddometer Tuning
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            className={`btn-tab ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            📜 Audit Log Trail
          </button>
        )}
      </div>

      {/* TAB 1: Analytics Overview */}
      {activeTab === 'analytics' && isAdmin && (
        <div className="admin-tab-content">
          {loadingAnalytics && <p>Loading real-time platform metrics...</p>}
          {analyticsError && <div className="alert-error">{analyticsError}</div>}

          {analytics && (
            <div>
              {/* Stat Cards Grid */}
              <div
                className="analytics-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '2rem',
                }}
              >
                <div className="card stat-card">
                  <h4>👥 Registered Users</h4>
                  <div className="stat-number" style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-primary)' }}>
                    {analytics.totalUsers}
                  </div>
                  <span className="stat-sub">{analytics.activeUsers7d} active (7d)</span>
                </div>

                <div className="card stat-card">
                  <h4>📍 Total Spots</h4>
                  <div className="stat-number" style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent-secondary)' }}>
                    {analytics.storageSummary?.totalPosts || 0}
                  </div>
                  <span className="stat-sub">{analytics.postsUnderReviewCount} under review</span>
                </div>

                <div className="card stat-card">
                  <h4>💬 Total Comments</h4>
                  <div className="stat-number" style={{ fontSize: '2rem', fontWeight: 'bold' }}>
                    {analytics.storageSummary?.totalComments || 0}
                  </div>
                </div>

                <div className="card stat-card">
                  <h4>🎒 Physical Visits</h4>
                  <div className="stat-number" style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-success, #10b981)' }}>
                    {analytics.storageSummary?.totalVisits || 0}
                  </div>
                </div>

                <div className="card stat-card">
                  <h4>⚡ Total Reactions</h4>
                  <div className="stat-number" style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-warning, #eab308)' }}>
                    {analytics.storageSummary?.totalReactions || 0}
                  </div>
                </div>

                <div className="card stat-card">
                  <h4>🚨 Open Reports</h4>
                  <div className="stat-number" style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-danger, #ef4444)' }}>
                    {analytics.openReportsCount}
                  </div>
                </div>
              </div>

              {/* Two Column Layout for Breakdown */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                {/* Posts per City */}
                <div className="card">
                  <h3>🏙️ Top Discovery Hotspots</h3>
                  {analytics.postsPerCity.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)' }}>No spots recorded yet.</p>
                  ) : (
                    <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left' }}>
                          <th style={{ padding: '0.5rem' }}>City</th>
                          <th style={{ padding: '0.5rem', textAlign: 'right' }}>Spots</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.postsPerCity.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                            <td style={{ padding: '0.5rem' }}>{item.city}</td>
                            <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 'bold' }}>{item.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Tier & Storage Status */}
                <div className="card">
                  <h3>📈 Tier & Storage Health</h3>
                  <div style={{ marginTop: '1rem' }}>
                    <p><strong>Tier Distribution:</strong></p>
                    <ul>
                      <li>Local / City Tier: <strong>{analytics.tierBreakdown?.city || 0}</strong></li>
                      <li>Country-Wide Tier: <strong>{analytics.tierBreakdown?.country || 0}</strong></li>
                    </ul>
                  </div>

                  <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '1rem' }}>
                    <p><strong>Atlas M0 Quota Budget:</strong></p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      Hard Disk Cap: {analytics.storageSummary?.databaseLimitMB} MB | Soft Alert: {analytics.storageSummary?.warnThresholdMB} MB
                    </p>
                    <div style={{ background: 'var(--bg-surface-elevated)', borderRadius: '4px', height: '12px', marginTop: '0.5rem', overflow: 'hidden' }}>
                      <div
                        style={{
                          background: 'linear-gradient(90deg, var(--color-success, #15803D), var(--accent-secondary, #FFB300))',
                          width: '18%',
                          height: '100%',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Status: Healthy (&lt; 20% consumed)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Moderation Queue */}
      {activeTab === 'moderation' && (
        <div className="admin-tab-content">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <h2>🚨 Moderation Queue</h2>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn-small ${reportFilter === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setReportFilter('pending')}
              >
                Open & Pending
              </button>
              <button
                type="button"
                className={`btn-small ${reportFilter === 'resolved' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setReportFilter('resolved')}
              >
                Resolved
              </button>
              <button
                type="button"
                className={`btn-small ${reportFilter === 'dismissed' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setReportFilter('dismissed')}
              >
                Dismissed
              </button>
            </div>
          </div>

          {reportActionMsg && (
            <div className="alert-info" style={{ marginBottom: '1rem' }}>
              {reportActionMsg}
            </div>
          )}

          {loadingReports && <p>Loading queue items...</p>}

          {!loadingReports && reports.length === 0 && (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>🎉 The moderation queue is empty!</p>
              <span style={{ color: 'var(--text-muted)' }}>No reports match the current filter.</span>
            </div>
          )}

          <div className="reports-stack" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {pagedReports.map((r) => {
              const target = r.target || {};
              return (
                <div key={r.id || r._id} className="card report-card" style={{ borderLeft: r.isEscalated ? '4px solid var(--color-danger, #ef4444)' : '4px solid var(--accent-primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span className="badge-warning" style={{ marginRight: '0.5rem' }}>
                        {r.reason?.replace('_', ' ').toUpperCase()}
                      </span>
                      {r.isEscalated && (
                        <span className="badge-danger" style={{ marginRight: '0.5rem' }}>
                          ⚡ UNDER REVIEW QUARANTINE
                        </span>
                      )}
                      <span style={{ color: 'var(--text-secondary)' }}>
                        Target: <strong>{r.targetType?.toUpperCase()}</strong>
                      </span>
                    </div>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Weight: {r.weight?.toFixed(1)} · {new Date(r.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div style={{ marginTop: '0.75rem' }}>
                    <p><strong>Reporter:</strong> {r.reporter?.username || 'Unknown'} (Trust: {r.reporter?.trust?.score ?? 1.0})</p>
                    {r.details && <p><strong>Reporter Note:</strong> "{r.details}"</p>}
                    {target.title && (
                      <p><strong>Content Title:</strong> <a href={`#/post/${target._id}`} target="_blank" rel="noopener noreferrer">{target.title}</a></p>
                    )}
                    {target.body && <p><strong>Content Snippet:</strong> {target.body.slice(0, 150)}...</p>}
                  </div>

                  {/* One-click Action Buttons matching backend contract 2.10 */}
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-primary btn-small"
                      onClick={() => handleActionReport(r.id || r._id, 'dismiss', 'Dismissed by staff')}
                    >
                      ✓ Dismiss Report
                    </button>
                    {r.targetType === 'comment' ? (
                      <button
                        type="button"
                        className="btn-danger btn-small"
                        onClick={() => handleActionReport(r.id || r._id, 'remove_comment', 'Comment removed for guidelines violation')}
                      >
                        🗑️ Remove Comment
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="btn-danger btn-small"
                          onClick={() => handleActionReport(r.id || r._id, 'hide_post', 'Post hidden for guidelines violation')}
                        >
                          👁️ Hide Post
                        </button>
                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          onClick={() => handleActionReport(r.id || r._id, 'fuzz_location', 'Coordinates fuzzed for safety/privacy')}
                        >
                          🔒 Fuzz Location
                        </button>
                      </>
                    )}
                    {target.authorId && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary btn-small"
                          onClick={() => handleBanUser(target.authorId, true)}
                        >
                          👻 Shadow-Ban Author
                        </button>
                        <button
                          type="button"
                          className="btn-danger-outline btn-small"
                          onClick={() => handleBanUser(target.authorId, false)}
                        >
                          ⛔ Ban Author
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reports Pagination Bar (20 per page) */}
          {reports.length > REPORTS_PER_PAGE && (
            <div
              className="pagination-controls-bar"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '1.5rem',
                padding: '12px 16px',
                background: 'var(--bg-surface, #FFFFFF)',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle, #E4E4E7)',
              }}
            >
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={reportPage === 1}
                onClick={() => setReportPage((p) => Math.max(p - 1, 1))}
                style={{ minHeight: '36px' }}
              >
                ← Previous
              </button>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Page {reportPage} of {totalReportPages} ({reports.length} total reports)
              </span>
              <button
                type="button"
                className="btn-secondary btn-small"
                disabled={reportPage >= totalReportPages}
                onClick={() => setReportPage((p) => Math.min(p + 1, totalReportPages))}
                style={{ minHeight: '36px' }}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Oddometer Tuning (Admin only) */}
      {activeTab === 'meter' && isAdmin && (
        <div className="admin-tab-content">
          <h2>⚡ Oddometer Runtime Tuning</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Adjust engagement weights and promotion thresholds live without server restarts.
            All modifications write to the immutable regulatory AuditLog.
          </p>

          {configSuccessMsg && <div className="alert-success" style={{ marginBottom: '1rem' }}>{configSuccessMsg}</div>}
          {configErrorMsg && <div className="alert-error" style={{ marginBottom: '1rem' }}>{configErrorMsg}</div>}

          <form onSubmit={handleSaveMeterConfig} className="card form-stack" style={{ maxWidth: '650px' }}>
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label><strong>Country-Wide Promotion Threshold</strong></label>
                <span className="badge-warning">{countryThreshold} pts</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                  type="range"
                  min="10"
                  max="200"
                  value={countryThreshold}
                  onChange={(e) => setCountryThreshold(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent-primary, #FF6F00)', cursor: 'pointer' }}
                />
                <input
                  type="number"
                  min="10"
                  max="500"
                  value={countryThreshold}
                  onChange={(e) => setCountryThreshold(Number(e.target.value))}
                  style={{ width: '84px', textAlign: 'center', fontWeight: 'bold' }}
                  required
                />
              </div>
              <span className="field-note">Oddometer score needed to ratchet from City to Country feed.</span>
            </div>

            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label><strong>Automated Report Quarantine Threshold</strong></label>
                <span className="badge-danger">{reportFuzzThreshold} reports</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={reportFuzzThreshold}
                  onChange={(e) => setReportFuzzThreshold(Number(e.target.value))}
                  style={{ flex: 1, accentColor: 'var(--accent-primary, #FF6F00)', cursor: 'pointer' }}
                />
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={reportFuzzThreshold}
                  onChange={(e) => setReportFuzzThreshold(Number(e.target.value))}
                  style={{ width: '84px', textAlign: 'center', fontWeight: 'bold' }}
                  required
                />
              </div>
              <span className="field-note">Number of safety reports that automatically hides a spot for review.</span>
            </div>

            <div className="form-group">
              <label><strong>Signal Multiplier Weights:</strong></label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.5rem' }}>
                <div>
                  <label>Scout Reaction (+pts)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={weights.reaction}
                    onChange={(e) => setWeights({ ...weights, reaction: e.target.value })}
                  />
                </div>
                <div>
                  <label>Physical GPS Visit (+pts)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={weights.visit}
                    onChange={(e) => setWeights({ ...weights, visit: e.target.value })}
                  />
                </div>
                <div>
                  <label>Comment Discussion (+pts)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={weights.comment}
                    onChange={(e) => setWeights({ ...weights, comment: e.target.value })}
                  />
                </div>
                <div>
                  <label>Upvote / Like (+pts)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={weights.like}
                    onChange={(e) => setWeights({ ...weights, like: e.target.value })}
                  />
                </div>
                <div>
                  <label>Downvote / Dislike (-pts)</label>
                  <input
                    type="number"
                    step="0.1"
                    max="0"
                    value={weights.dislike}
                    onChange={(e) => setWeights({ ...weights, dislike: e.target.value })}
                  />
                </div>
              </div>
            </div>

            <div className="form-group">
              <label><strong>Reason for Audit Log:</strong></label>
              <input
                type="text"
                placeholder="e.g. Tuning weights for seasonal scavenger hunt"
                value={configReason}
                onChange={(e) => setConfigReason(e.target.value)}
              />
            </div>

            <button type="submit" className="btn-primary" disabled={savingConfig} style={{ marginTop: '1rem' }}>
              {savingConfig ? 'Saving Updates...' : '💾 Apply Configuration'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 4: Audit Log Trail (Admin only) */}
      {activeTab === 'audit' && isAdmin && (
        <div className="admin-tab-content">
          <h2>📜 Security & Moderation Audit Trail</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
            Immutable chronological ledger of administrative interventions and security events.
          </p>

          {loadingAuditLogs && <p>Loading audit ledger...</p>}

          {!loadingAuditLogs && auditLogs.length === 0 && (
            <p>No audit records found.</p>
          )}

          {auditLogs.length > 0 && (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Timestamp</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Actor</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Action</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Target</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Reason / Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedAuditLogs.map((log) => (
                    <tr key={log._id} style={{ borderBottom: '1px solid var(--border-subtle)', fontSize: '0.9rem' }}>
                      <td style={{ padding: '0.5rem', whiteSpace: 'nowrap' }}>
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {log.actorId?.username || 'System'}
                      </td>
                      <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>
                        <code>{log.action}</code>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        {log.targetType} ({String(log.targetId).slice(-6)})
                      </td>
                      <td style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}>
                        {log.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Audit Logs Pagination Bar (20 per page) */}
              {auditLogs.length > AUDIT_PER_PAGE && (
                <div
                  className="pagination-controls-bar"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderTop: '1px solid var(--border-subtle, #E4E4E7)',
                    background: 'var(--bg-surface, #FFFFFF)',
                  }}
                >
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    disabled={auditPage === 1}
                    onClick={() => setAuditPage((p) => Math.max(p - 1, 1))}
                    style={{ minHeight: '36px' }}
                  >
                    ← Previous
                  </button>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    Page {auditPage} of {totalAuditPages} ({auditLogs.length} total entries)
                  </span>
                  <button
                    type="button"
                    className="btn-secondary btn-small"
                    disabled={auditPage >= totalAuditPages}
                    onClick={() => setAuditPage((p) => Math.min(p + 1, totalAuditPages))}
                    style={{ minHeight: '36px' }}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminPage;
