// frontend/src/pages/PostDetail.jsx
// Complete post details view featuring ImageGallery with lightbox, RichText markdown,
// author post edits within 24h, edit history modal, author updates timeline,
// and threaded comments with 'identify' solve flow.

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { RichText } from '../components/markdown/RichText';
import { MarkdownEditor } from '../components/markdown/MarkdownEditor';
import { ImageGallery } from '../components/posts/ImageGallery';
import { CommentThread } from '../components/posts/CommentThread';
import OddometerGauge from '../components/meter/OddometerGauge';
import { VisitActionPanel } from '../components/visits/VisitActionPanel';
import { ThenAndNowGallery } from '../components/visits/ThenAndNowGallery';

const REPORT_REASONS = [
  { value: 'unsafe_or_private', label: 'Unsafe or Private Property' },
  { value: 'nsfw', label: 'NSFW Content' },
  { value: 'spam', label: 'Spam or Commercial Promotion' },
  { value: 'doxxing', label: 'Doxxing or Personal Privacy Violation' },
  { value: 'misinformation', label: 'Misinformation or Fake Location' },
  { value: 'other', label: 'Other Issue' },
];

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function PostDetail({ postId, navigate }) {
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Voting state
  const [myVote, setMyVote] = useState(null);

  // Comments state
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  // Report state
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('unsafe_or_private');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportMessage, setReportMessage] = useState({ type: '', text: '' });

  // Post Edit state (24h window)
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editWarnings, setEditWarnings] = useState([]);
  const [submittingEdit, setSubmittingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Edit History Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Post Updates state
  const [newUpdateText, setNewUpdateText] = useState('');
  const [submittingUpdate, setSubmittingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState('');

  const loadPost = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getPost(postId);
      setPost(data);
    } catch (err) {
      setError(err.message || 'Post not found.');
    } finally {
      setLoading(false);
    }
  }, [postId]);

  // Verified visits state
  const [visits, setVisits] = useState([]);

  const loadComments = useCallback(async () => {
    try {
      const res = await api.getComments(postId);
      setComments(res.comments || []);
    } catch {
      // Non-critical if comments fail to load
    }
  }, [postId]);

  const loadVisits = useCallback(async () => {
    try {
      const res = await api.getSpotVisits(postId);
      setVisits(res.visits || []);
    } catch {
      // Non-critical if visits fail to load
    }
  }, [postId]);

  useEffect(() => {
    loadPost();
    loadComments();
    loadVisits();
  }, [loadPost, loadComments, loadVisits]);

  const handleVisitRecorded = (newVisit, newMeterScore) => {
    setVisits((prev) => [newVisit, ...prev]);
    if (newMeterScore !== undefined) {
      setPost((prev) => ({
        ...prev,
        meter: {
          ...prev.meter,
          score: newMeterScore,
          visits: (prev.meter?.visits || 0) + 1,
        },
      }));
    }
  };

  const handleSpotRevealed = (coordinates) => {
    setPost((prev) => ({
      ...prev,
      location: {
        ...prev.location,
        coordinates,
        fuzzed: false,
        revealed: true,
      },
    }));
  };

  const isAuthor =
    user &&
    post &&
    String(user.id || user._id) ===
      String(post.authorId?._id || post.authorId);

  const isWithinEditWindow =
    post &&
    Date.now() - new Date(post.createdAt).getTime() <= TWENTY_FOUR_HOURS_MS;

  const handleVote = async (value) => {
    if (!user) {
      navigate('#/login');
      return;
    }
    try {
      const res = await api.votePost(postId, value);
      setMyVote(value);
      if (res.meter) {
        setPost((prev) => ({
          ...prev,
          meter: res.meter,
          tier: res.tier || prev.tier,
        }));
      }
    } catch (err) {
      alert(err.message || 'Failed to submit vote.');
    }
  };

  const handleAddTopComment = async (e) => {
    e.preventDefault();
    setCommentError('');

    if (!user) {
      navigate('#/login');
      return;
    }

    const cleanBody = newComment.trim();
    if (!cleanBody) {
      setCommentError('Comment cannot be empty.');
      return;
    }

    setSubmittingComment(true);
    try {
      const res = await api.addComment(postId, { body: cleanBody });
      setComments((prev) => [...prev, res.comment]);
      setNewComment('');
      if (res.meterScore !== undefined) {
        setPost((prev) => ({
          ...prev,
          meter: {
            ...prev.meter,
            score: res.meterScore,
            comments: (prev.meter?.comments || 0) + 1,
          },
        }));
      }
    } catch (err) {
      setCommentError(err.message || 'Failed to post comment.');
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleAddReply = async (body, parentId) => {
    const res = await api.addComment(postId, { body, parentId });
    setComments((prev) => [...prev, res.comment]);
    if (res.meterScore !== undefined) {
      setPost((prev) => ({
        ...prev,
        meter: {
          ...prev.meter,
          score: res.meterScore,
          comments: (prev.meter?.comments || 0) + 1,
        },
      }));
    }
  };

  const handleEditComment = async (commentId, body) => {
    const res = await api.updateComment(commentId, { body });
    setComments((prev) =>
      prev.map((c) => (c._id === commentId ? { ...c, ...res.comment, body } : c))
    );
  };

  const handleDeleteComment = async (commentId) => {
    await api.deleteComment(commentId);
    setComments((prev) => prev.filter((c) => c._id !== commentId));
    setPost((prev) => ({
      ...prev,
      meter: {
        ...prev.meter,
        comments: Math.max((prev.meter?.comments || 1) - 1, 0),
      },
    }));
  };

  const handleSolve = async (commentId) => {
    if (!window.confirm('Mark this comment as the Best Answer solution?')) return;
    try {
      const res = await api.solvePost(postId, commentId);
      setPost((prev) => ({
        ...prev,
        solved: true,
        bestCommentId: commentId,
      }));
      alert('Spot marked as SOLVED!');
    } catch (err) {
      alert(err.message || 'Failed to mark post as solved.');
    }
  };

  const handleOpenEditModal = () => {
    setEditTitle(post.title || '');
    setEditBody(post.body || '');
    setEditTags(Array.isArray(post.tags) ? post.tags.join(', ') : '');
    setEditWarnings(Array.isArray(post.warnings) ? post.warnings : []);
    setEditError('');
    setShowEditModal(true);
  };

  const handleSavePostEdit = async (e) => {
    e.preventDefault();
    setEditError('');

    const cleanTitle = editTitle.trim();
    if (!cleanTitle) {
      setEditError('Title is required.');
      return;
    }

    setSubmittingEdit(true);
    try {
      const tagsArray = editTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const updated = await api.updatePost(postId, {
        title: cleanTitle,
        body: editBody.trim(),
        tags: tagsArray,
        warnings: editWarnings,
      });

      setPost(updated);
      setShowEditModal(false);
    } catch (err) {
      setEditError(err.message || 'Failed to update spot.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleAddPostUpdate = async (e) => {
    e.preventDefault();
    setUpdateError('');

    const clean = newUpdateText.trim();
    if (!clean) return;

    setSubmittingUpdate(true);
    try {
      const res = await api.addPostUpdate(postId, clean);
      setPost((prev) => ({
        ...prev,
        updates: res.updates || [...(prev.updates || []), res.update],
      }));
      setNewUpdateText('');
    } catch (err) {
      setUpdateError(err.message || 'Failed to post field update.');
    } finally {
      setSubmittingUpdate(false);
    }
  };

  const handleReport = async (e) => {
    e.preventDefault();
    setReportMessage({ type: '', text: '' });

    if (!user) {
      navigate('#/login');
      return;
    }

    setSubmittingReport(true);
    try {
      const res = await api.reportPost(postId, {
        reason: reportReason,
        details: reportDetails.trim(),
      });
      setReportMessage({
        type: 'success',
        text: 'Report submitted to moderators. Thank you.',
      });
      if (res.autoFuzzed) {
        setPost((prev) => ({ ...prev, hideExact: true }));
      }
      setTimeout(() => setShowReportModal(false), 2000);
    } catch (err) {
      setReportMessage({
        type: 'error',
        text: err.message || 'Failed to submit report.',
      });
    } finally {
      setSubmittingReport(false);
    }
  };

  if (loading) {
    return <div className="loading-state">Loading oddspot details...</div>;
  }

  if (error || !post) {
    return (
      <div className="empty-state">
        <h3>Could not load post</h3>
        <p>{error || 'Post does not exist or has been removed.'}</p>
        <button className="btn-secondary" onClick={() => navigate('#/feed')}>
          Back to Nearby Feed
        </button>
      </div>
    );
  }

  const editHistory = post.editHistory || [];
  const updates = post.updates || [];

  return (
    <div className="post-detail-container">
      <div className="detail-top-nav">
        <button className="btn-back" onClick={() => navigate('#/feed')}>
          ← Back to Nearby Feed
        </button>

        <div className="detail-author-actions">
          {isAuthor && isWithinEditWindow && (
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={handleOpenEditModal}
              title="Edit spot title, notes, and tags within 24 hours of creation"
            >
              ✏️ Edit Spot
            </button>
          )}

          {editHistory.length > 0 && (
            <button
              type="button"
              className="btn-secondary btn-small"
              onClick={() => setShowHistoryModal(true)}
              title="View past revision history"
            >
              🕒 Revisions ({editHistory.length})
            </button>
          )}
        </div>
      </div>

      <div className="detail-header">
        <div className="post-badges">
          <span className={`tier-badge tier-${post.tier || 'city'}`}>
            {(post.tier || 'city').toUpperCase()} TIER
          </span>

          {post.type === 'identify' && (
            <span
              className={`badge-type ${post.solved ? 'badge-solved' : 'badge-identify'}`}
            >
              {post.solved ? '✓ SOLVED' : '❓ HELP IDENTIFY'}
            </span>
          )}

          {post.hideExact && (
            <span className="badge-fuzzed">Approximate location</span>
          )}
        </div>

        <h1 className="detail-title">{post.title}</h1>

        <div className="detail-meta">
          <span>
            📍 {post.place?.city}, {post.place?.state ? `${post.place.state}, ` : ''}
            {post.place?.country}
          </span>
          <span>
            {post.location?.coordinates
              ? `Coordinates: [${post.location.coordinates[0]}, ${post.location.coordinates[1]}]`
              : null}
          </span>
          <span>Posted by: <strong>{post.authorId?.username || 'Scout'}</strong></span>
          <span>{new Date(post.createdAt).toLocaleDateString()}</span>
          {post.editedAt && <span className="edited-indicator">(edited)</span>}
        </div>
      </div>

      {/* Signature Visit Action Panel: Distance, Bearing, Open in Maps & GPS Check-In */}
      <VisitActionPanel
        post={post}
        user={user}
        onVisitRecorded={handleVisitRecorded}
        onSpotRevealed={handleSpotRevealed}
      />

      {/* Multi-Image Gallery with Keyboard Lightbox */}
      {post.images && post.images.length > 0 && (
        <ImageGallery images={post.images} title={post.title} />
      )}

      {/* Then-and-Now Visitor Comparison Gallery */}
      <ThenAndNowGallery post={post} visits={visits} />

      {/* Post Description Rendered with Spoilers & Collapsible Markdown */}
      {post.body && (
        <div className="detail-body">
          <RichText content={post.body} />
        </div>
      )}

      {/* Author Updates Timeline */}
      {updates.length > 0 && (
        <div className="timeline-section">
          <h3>Field Updates ({updates.length})</h3>
          {updates.map((upd, idx) => (
            <div key={idx} className="timeline-card">
              <div className="timeline-date">
                Update · {new Date(upd.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
              <RichText content={upd.body} />
            </div>
          ))}
        </div>
      )}

      {/* Add Field Update Box for Author */}
      {isAuthor && (
        <div className="add-update-box">
          <h4>Post a Field Update ({updates.length}/10 used)</h4>
          {updates.length >= 10 ? (
            <p className="field-note">Maximum of 10 field updates reached.</p>
          ) : (
            <form onSubmit={handleAddPostUpdate} className="form-stack">
              {updateError && <div className="alert-error">{updateError}</div>}
              <textarea
                value={newUpdateText}
                onChange={(e) => setNewUpdateText(e.target.value)}
                placeholder="Log a change in status, demolition notice, or new discovery..."
                rows={2}
                maxLength={2000}
                required
              />
              <button
                type="submit"
                className="btn-secondary btn-small"
                disabled={submittingUpdate || !newUpdateText.trim()}
              >
                {submittingUpdate ? 'Posting Update...' : 'Post Update'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Tags & Warnings */}
      {post.tags && post.tags.length > 0 && (
        <div className="detail-tags">
          {post.tags.map((t, idx) => (
            <span key={idx} className="tag-pill">
              #{t}
            </span>
          ))}
        </div>
      )}

      {post.warnings && post.warnings.length > 0 && (
        <div className="detail-warnings">
          <strong>⚠️ Caution tags: </strong>
          {post.warnings.map((w, idx) => (
            <span key={idx} className="warning-pill">
              {w.replace('_', ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Signature Oddometer Radial SVG Gauge & Next-Tier Progress Bar */}
      <OddometerGauge post={post} isAuthor={isAuthor} />

      {/* Engagement & Voting Bar */}
      <div className="detail-engagement">

        <div className="action-buttons">
          <button
            className={`btn-vote ${myVote === 1 ? 'voted-up' : ''}`}
            onClick={() => handleVote(1)}
          >
            👍 Like ({post.meter?.likes ?? 0})
          </button>
          <button
            className={`btn-vote ${myVote === -1 ? 'voted-down' : ''}`}
            onClick={() => handleVote(-1)}
          >
            👎 Dislike ({post.meter?.dislikes ?? 0})
          </button>
          <button
            className="btn-danger-outline"
            onClick={() => setShowReportModal(true)}
          >
            🚩 Report Post
          </button>
        </div>
      </div>

      {/* Edit Spot Modal (Within 24h) */}
      {showEditModal && (
        <div className="modal-backdrop" onClick={() => setShowEditModal(false)}>
          <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Spot (24h Window)</h3>
            <p className="subtitle">
              Update title, field notes, or tags. (Coordinates and images cannot be changed).
            </p>

            {editError && <div className="alert-error">{editError}</div>}

            <form onSubmit={handleSavePostEdit} className="form-stack">
              <label>
                Title *
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={140}
                  required
                />
              </label>

              <MarkdownEditor
                id="edit-post-body"
                label="Description & Field Notes"
                value={editBody}
                onChange={setEditBody}
                rows={6}
                maxLength={10000}
                showTemplateButton={false}
              />

              <label>
                Tags (comma-separated)
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={submittingEdit || !editTitle.trim()}
                >
                  {submittingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit History Viewer Modal */}
      {showHistoryModal && (
        <div className="modal-backdrop" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content modal-wide" onClick={(e) => e.stopPropagation()}>
            <h3>Edit History ({editHistory.length} Revisions)</h3>
            <p className="subtitle">
              Prior versions of this spot before subsequent edits.
            </p>

            <div className="revisions-list">
              {editHistory.map((rev, idx) => (
                <div key={idx} className="revision-card">
                  <div className="revision-header">
                    <strong>Revision #{idx + 1}</strong> ·{' '}
                    <span>{new Date(rev.editedAt).toLocaleString()}</span>
                  </div>
                  <h4>{rev.title}</h4>
                  <RichText content={rev.body || '*No description*'} />
                  {rev.tags && rev.tags.length > 0 && (
                    <div className="detail-tags">
                      {rev.tags.map((t, tIdx) => (
                        <span key={tIdx} className="tag-pill">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowHistoryModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report Modal */}
      {showReportModal && (
        <div className="modal-backdrop" onClick={() => setShowReportModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Report this Spot</h3>
            <p className="subtitle">
              Help keep Oddspot safe and respectful of real-world spaces.
            </p>

            {reportMessage.text && (
              <div className={`alert-${reportMessage.type}`}>
                {reportMessage.text}
              </div>
            )}

            <form onSubmit={handleReport} className="form-stack">
              <label>
                Reason *
                <select
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  required
                >
                  {REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Details (Optional)
                <textarea
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                  placeholder="Describe why this location is unsafe or private..."
                  rows={3}
                  maxLength={500}
                />
              </label>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setShowReportModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-danger"
                  disabled={submittingReport}
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Threaded Discussion Section */}
      <div className="comments-section">
        <h3>
          Discussion ({comments.length})
          {post.type === 'identify' && (
            <small style={{ marginLeft: '0.5rem', fontWeight: 'normal', color: 'var(--text-muted)' }}>
              — Help identify this find!
            </small>
          )}
        </h3>

        {user ? (
          <form onSubmit={handleAddTopComment} className="comment-form">
            {commentError && <div className="alert-error">{commentError}</div>}
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={
                post.type === 'identify'
                  ? 'Know what this is? Leave your identification or clue...'
                  : 'Leave a comment, verification note, or tip...'
              }
              rows={3}
              maxLength={5000}
              required
            />
            <button
              type="submit"
              className="btn-primary btn-small"
              disabled={submittingComment}
            >
              {submittingComment ? 'Posting...' : 'Post Comment (+3 to Meter)'}
            </button>
          </form>
        ) : (
          <div className="comment-login-prompt">
            <button className="link-btn" onClick={() => navigate('#/login')}>
              Log in
            </button>{' '}
            to join the discussion and boost the meter score.
          </div>
        )}

        <CommentThread
          comments={comments}
          postId={postId}
          postAuthorId={post.authorId}
          isIdentifyPost={post.type === 'identify'}
          isSolved={Boolean(post.solved)}
          bestCommentId={post.bestCommentId}
          currentUser={user}
          onSolve={handleSolve}
          onAddComment={handleAddReply}
          onEditComment={handleEditComment}
          onDeleteComment={handleDeleteComment}
        />
      </div>
    </div>
  );
}
