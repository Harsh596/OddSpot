// frontend/src/components/posts/CommentThread.jsx
// Threaded comments tree up to depth 3 with inline reply, edit, delete, and Best Answer solve flow.

import { useState, useMemo } from 'react';
import { RichText } from '../markdown/RichText';
import { MentionTextarea } from './MentionTextarea';

function SingleCommentItem({
  comment,
  depth = 1,
  postId,
  isPostAuthor,
  isIdentifyPost,
  isSolved,
  bestCommentId,
  currentUser,
  usernames = [],
  children = [],
  onSolve,
  onAddReply,
  onEditComment,
  onDeleteComment,
}) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(comment.body);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const isBestAnswer =
    bestCommentId && String(bestCommentId) === String(comment._id);

  const isMyComment =
    currentUser &&
    String(currentUser.id || currentUser._id) ===
      String(comment.authorId?._id || comment.authorId);

  const canSolve =
    isIdentifyPost && !isSolved && isPostAuthor && !isBestAnswer;

  const handleSendReply = async (e) => {
    e.preventDefault();
    const clean = replyText.trim();
    if (!clean) return;

    setSubmittingReply(true);
    try {
      await onAddReply(clean, comment._id);
      setReplyText('');
      setIsReplying(false);
    } catch (err) {
      alert(err.message || 'Failed to post reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    const clean = editText.trim();
    if (!clean) return;

    setSubmittingEdit(true);
    try {
      await onEditComment(comment._id, clean);
      setIsEditing(false);
    } catch (err) {
      alert(err.message || 'Failed to update comment.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this comment?')) return;
    try {
      await onDeleteComment(comment._id);
    } catch (err) {
      alert(err.message || 'Failed to delete comment.');
    }
  };

  const authorName = comment.authorId?.username || 'Anonymous';
  const authorBadges = comment.authorId?.badges || [];

  return (
    <div
      className={`comment-item depth-${depth} ${
        isBestAnswer ? 'best-answer-highlight' : ''
      }`}
      id={`comment-${comment._id}`}
    >
      <div className="comment-header">
        <div className="comment-author-info">
          <span className="author-name">{authorName}</span>
          {authorBadges.map((badge, idx) => (
            <span key={idx} className="badge-pill">
              {badge}
            </span>
          ))}
          <span className="comment-date">
            {new Date(comment.createdAt).toLocaleDateString(undefined, {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          {comment.edited && <span className="edited-indicator">(edited)</span>}
        </div>

        {isBestAnswer && (
          <span className="best-answer-badge">
            ✓ SOLVED - Best Answer
          </span>
        )}

        {canSolve && (
          <button
            type="button"
            className="btn-mark-solved"
            onClick={() => onSolve(comment._id)}
            title="Mark this answer as the correct solution"
          >
            Mark as Solved
          </button>
        )}
      </div>

      <div className="comment-body">
        {isEditing ? (
          <form onSubmit={handleSaveEdit} className="inline-edit-form">
            <MentionTextarea
              className="inline-edit-textarea"
              rows={3}
              value={editText}
              onChange={setEditText}
              usernames={usernames}
              required
            />
            <div className="inline-action-buttons">
              <button
                type="submit"
                className="btn-primary btn-sm"
                disabled={submittingEdit || !editText.trim()}
              >
                {submittingEdit ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => {
                  setEditText(comment.body);
                  setIsEditing(false);
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <RichText content={comment.body} />
        )}
      </div>

      {/* Comment Actions Toolbar */}
      {!isEditing && (
        <div className="comment-actions">
          {depth < 3 && currentUser && (
            <button
              type="button"
              className="action-link"
              onClick={() => setIsReplying(!isReplying)}
            >
              {isReplying ? 'Cancel' : 'Reply'}
            </button>
          )}

          {isMyComment && (
            <>
              <button
                type="button"
                className="action-link"
                onClick={() => setIsEditing(true)}
              >
                Edit
              </button>
              <button
                type="button"
                className="action-link danger-link"
                onClick={handleDelete}
              >
                Delete
              </button>
            </>
          )}
        </div>
      )}

      {/* Inline Reply Form */}
      {isReplying && (
        <form onSubmit={handleSendReply} className="inline-reply-form">
          <MentionTextarea
            className="inline-reply-textarea"
            rows={2}
            placeholder={`Reply to ${authorName}...`}
            value={replyText}
            onChange={setReplyText}
            usernames={usernames}
            required
          />
          <div className="inline-action-buttons">
            <button
              type="submit"
              className="btn-primary btn-sm"
              disabled={submittingReply || !replyText.trim()}
            >
              {submittingReply ? 'Sending...' : 'Reply'}
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setReplyText('');
                setIsReplying(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Nested Children */}
      {children.length > 0 && (
        <div className="comment-replies">
          {children.map((child) => (
            <SingleCommentItem
              key={child._id}
              comment={child}
              depth={depth + 1}
              postId={postId}
              isPostAuthor={isPostAuthor}
              isIdentifyPost={isIdentifyPost}
              isSolved={isSolved}
              bestCommentId={bestCommentId}
              currentUser={currentUser}
              usernames={usernames}
              children={child.children || []}
              onSolve={onSolve}
              onAddReply={onAddReply}
              onEditComment={onEditComment}
              onDeleteComment={onDeleteComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CommentThread({
  comments = [],
  postId,
  postAuthorId,
  isIdentifyPost = false,
  isSolved = false,
  bestCommentId = null,
  currentUser = null,
  usernames = [],
  onSolve,
  onAddComment,
  onEditComment,
  onDeleteComment,
}) {
  const isPostAuthor =
    currentUser &&
    String(currentUser.id || currentUser._id) ===
      String(postAuthorId?._id || postAuthorId);

  // Build tree from flat comments list up to depth 3
  const commentTree = useMemo(() => {
    const map = new Map();
    const roots = [];

    // Initialize items with children array
    comments.forEach((c) => {
      map.set(String(c._id), { ...c, children: [] });
    });

    comments.forEach((c) => {
      const item = map.get(String(c._id));
      if (!c.parentId) {
        roots.push(item);
      } else {
        const parent = map.get(String(c.parentId));
        if (parent) {
          parent.children.push(item);
        } else {
          // If parent not found (e.g. deleted or outside limit), treat as root
          roots.push(item);
        }
      }
    });

    return roots;
  }, [comments]);

  if (!comments.length) {
    return (
      <div className="comments-empty">
        <p>No comments yet. Be the first to scout this location or help identify it!</p>
      </div>
    );
  }

  return (
    <div className="odd-comment-thread">
      {commentTree.map((rootComment) => (
        <SingleCommentItem
          key={rootComment._id}
          comment={rootComment}
          depth={1}
          postId={postId}
          isPostAuthor={isPostAuthor}
          isIdentifyPost={isIdentifyPost}
          isSolved={isSolved}
          bestCommentId={bestCommentId}
          currentUser={currentUser}
          usernames={usernames}
          children={rootComment.children || []}
          onSolve={onSolve}
          onAddReply={onAddComment}
          onEditComment={onEditComment}
          onDeleteComment={onDeleteComment}
        />
      ))}
    </div>
  );
}
