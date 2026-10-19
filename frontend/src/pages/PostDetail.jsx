import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';

const REPORT_REASONS = [
  { value: 'unsafe_or_private', label: 'Unsafe or Private Property' },
  { value: 'nsfw', label: 'NSFW Content' },
  { value: 'spam', label: 'Spam or Commercial Promotion' },
  { value: 'doxxing', label: 'Doxxing or Personal Privacy Violation' },
  { value: 'misinformation', label: 'Misinformation or Fake Location' },
  { value: 'other', label: 'Other Issue' },
];

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

  const loadComments = useCallback(async () => {
    try {
      const res = await api.getComments(postId);
      setComments(res.comments || []);
    } catch {
      // Non-critical if comments fail to load
    }
  }, [postId]);

  useEffect(() => {
    loadPost();
    loadComments();
  }, [loadPost, loadComments]);

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

  const handleAddComment = async (e) => {
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
      // Update meter score
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

  return (
    <div className="post-detail-container">
      <button className="btn-back" onClick={() => navigate('#/feed')}>
        ← Back to Nearby Feed
      </button>

      <div className="detail-header">
        <div className="post-badges">
          <span className={`tier-badge tier-${post.tier || 'city'}`}>
            {(post.tier || 'city').toUpperCase()} TIER
          </span>
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
        </div>
      </div>

      {post.images && post.images.length > 0 && (
        <div className="image-gallery">
          {post.images.map((img, idx) => (
            <div key={idx} className="gallery-item">
              <img src={img.url} alt={`${post.title} photo ${idx + 1}`} loading="lazy" />
            </div>
          ))}
        </div>
      )}

      {post.body && (
        <div className="detail-body">
          <p className="plain-text-body">{post.body}</p>
        </div>
      )}

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

      <div className="detail-engagement">
        <div className="meter-box">
          <span className="meter-label">Oddity Score</span>
          <span className="meter-number">{post.meter?.score ?? 0}</span>
          <small className="meter-sub">
            {post.meter?.likes ?? 0} likes · {post.meter?.dislikes ?? 0} dislikes ·{' '}
            {post.meter?.comments ?? 0} comments
          </small>
        </div>

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

      {/* Report Modal */}
      {showReportModal && (
        <div className="modal-backdrop">
          <div className="modal-content">
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

      {/* Comments Section */}
      <div className="comments-section">
        <h3>Discussion ({comments.length})</h3>

        {user ? (
          <form onSubmit={handleAddComment} className="comment-form">
            {commentError && <div className="alert-error">{commentError}</div>}
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Leave a comment, verification note, or tip..."
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

        <div className="comments-list">
          {comments.length === 0 ? (
            <p className="no-comments">No comments yet. Start the conversation!</p>
          ) : (
            comments.map((c) => (
              <div key={c._id} className="comment-item">
                <div className="comment-header">
                  <strong>{c.authorId?.username || 'Scout'}</strong>
                  <span className="comment-date">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="comment-body plain-text-body">{c.body}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
