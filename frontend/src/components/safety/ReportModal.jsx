// frontend/src/components/safety/ReportModal.jsx
// Structured moderation report modal with radio cards, character count,
// coordinate auto-fuzzing explanation, and duplicate/error handling.

import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api';
import { REPORT_REASONS } from '../../utils/safety';

export { REPORT_REASONS };

export function ReportModal({
  postId,
  postTitle,
  isAuthor = false,
  user = null,
  onClose,
  onReportSuccess,
  navigate,
}) {
  const [selectedReason, setSelectedReason] = useState('unsafe_or_private');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'success' | 'error' | 'duplicate', message, autoFuzzed }

  const modalRef = useRef(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFeedback(null);

    if (!user) {
      if (navigate) navigate('#/login');
      return;
    }

    if (isAuthor) {
      setFeedback({
        type: 'error',
        message: 'You cannot report your own post.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.reportPost(postId, {
        reason: selectedReason,
        details: details.trim(),
      });

      const autoFuzzed = !!res.autoFuzzed;
      setFeedback({
        type: 'success',
        message: autoFuzzed
          ? 'Report submitted. Real-time safety threshold reached — exact coordinates have been automatically fuzzed!'
          : 'Report submitted to moderators. Thank you for keeping Oddspot safe.',
        autoFuzzed,
      });

      if (onReportSuccess) {
        onReportSuccess(res);
      }

      // Close modal automatically after brief celebration/confirmation
      setTimeout(() => {
        onClose();
      }, 2500);
    } catch (err) {
      const isDuplicate = err.status === 409 || err.code === 'DUPLICATE_KEY';
      setFeedback({
        type: isDuplicate ? 'duplicate' : 'error',
        message: isDuplicate
          ? 'You have already reported this post. Our moderation team has it queued for review.'
          : err.message || 'Failed to submit report. Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-content modal-report"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        ref={modalRef}
      >
        <div className="modal-header-row">
          <div>
            <h3 id="report-modal-title">Report Spot for Review</h3>
            {postTitle && <p className="subtitle">Target: <em>"{postTitle}"</em></p>}
          </div>
          <button
            type="button"
            className="btn-modal-close"
            onClick={onClose}
            aria-label="Close report dialog"
          >
            ✕
          </button>
        </div>

        {/* Auth Check Notice */}
        {!user && (
          <div className="alert-warning">
            <p>You must be signed in to submit a safety report.</p>
            <button
              type="button"
              className="btn-primary btn-small"
              onClick={() => {
                onClose();
                if (navigate) navigate('#/login');
              }}
            >
              Sign In to Report
            </button>
          </div>
        )}

        {/* Self-reporting guard */}
        {isAuthor && user && (
          <div className="alert-error">
            <p>You are the author of this post. You cannot report your own post. If this post needs removal or updates, use the Edit or Delete controls.</p>
          </div>
        )}

        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`alert-${feedback.type === 'duplicate' ? 'info' : feedback.type}`}
            role="status"
          >
            <p>{feedback.message}</p>
            {feedback.autoFuzzed && (
              <div className="auto-fuzz-badge">
                🛡️ <strong>Coordinates Fuzzed:</strong> 150–400m HMAC displacement has been applied.
              </div>
            )}
          </div>
        )}

        {user && !isAuthor && (
          <form onSubmit={handleSubmit} className="form-stack">
            {/* Safety Fuzzing Policy Notice */}
            <div className="safety-policy-callout">
              <span className="policy-icon" aria-hidden="true">💡</span>
              <p>
                <strong>Oddspot Community Safety Threshold:</strong> Reports for <em>Unsafe or Private Property</em> are weighted. When 3 or more weighted scouts flag a spot, exact coordinates are permanently fuzzed (150–400m radius) to safeguard real-world boundaries.
              </p>
            </div>

            {/* Structured Reason Radio Cards */}
            <fieldset className="report-reasons-fieldset">
              <legend>Select Reason *</legend>
              <div className="reasons-grid">
                {REPORT_REASONS.map((r) => {
                  const isSelected = selectedReason === r.id;
                  return (
                    <label
                      key={r.id}
                      className={`reason-card ${isSelected ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={r.id}
                        checked={isSelected}
                        onChange={() => setSelectedReason(r.id)}
                        disabled={submitting || (feedback && feedback.type === 'success')}
                      />
                      <div className="reason-content">
                        <div className="reason-title-line">
                          <span className="reason-icon" aria-hidden="true">{r.icon}</span>
                          <strong>{r.label}</strong>
                        </div>
                        <p className="reason-desc">{r.description}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Details Field with Character Counter */}
            <label className="details-label">
              <div className="details-label-row">
                <span>Additional Details (Optional)</span>
                <span className={`counter ${details.length > 450 ? 'near-limit' : ''}`}>
                  {details.length}/500
                </span>
              </div>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Provide specific field notes (e.g., 'Private driveway with posted no trespassing signs', 'Active construction site with open pits')..."
                rows={3}
                maxLength={500}
                disabled={submitting || (feedback && feedback.type === 'success')}
              />
            </label>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-danger"
                disabled={submitting || (feedback && feedback.type === 'success')}
              >
                {submitting ? 'Submitting Report...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default ReportModal;
