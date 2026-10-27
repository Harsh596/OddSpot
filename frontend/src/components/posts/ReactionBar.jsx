// frontend/src/components/posts/ReactionBar.jsx
// Animated reaction bar featuring Mind Blown, Eyebrow Raise, Cursed Oddity, and Legendary Find.
// Weight: +5 points to Oddometer score per reaction.

import React, { useState, useEffect } from 'react';
import { api } from '../../api';

const REACTION_CONFIG = [
  {
    type: 'mind_blown',
    label: 'Mind Blown',
    emoji: '🤯',
    description: 'Completely defies explanation',
    color: '#ff007f',
  },
  {
    type: 'eyebrow_raise',
    label: 'Eyebrow Raise',
    emoji: '🤨',
    description: 'Suspicious and mildly unsettling',
    color: '#00e5ff',
  },
  {
    type: 'cursed',
    label: 'Cursed Oddity',
    emoji: '🔮',
    description: 'Haunting vibes and weird energy',
    color: '#a855f7',
  },
  {
    type: 'legendary',
    label: 'Legendary Find',
    emoji: '🏆',
    description: 'Hall-of-fame neighborhood landmark',
    color: '#eab308',
  },
];

export function ReactionBar({
  postId,
  initialReactions,
  initialMyReaction,
  isAuthor = false,
  user = null,
  onReactionChange,
}) {
  const [reactions, setReactions] = useState(
    initialReactions || {
      mind_blown: 0,
      eyebrow_raise: 0,
      cursed: 0,
      legendary: 0,
    }
  );
  const [myReaction, setMyReaction] = useState(initialMyReaction || null);
  const [animatingType, setAnimatingType] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Sync if initial props change
  useEffect(() => {
    if (initialReactions) setReactions(initialReactions);
    if (initialMyReaction !== undefined) setMyReaction(initialMyReaction);
  }, [initialReactions, initialMyReaction]);

  const handleToggleReaction = async (type) => {
    if (!user) {
      setErrorMsg('Please log in to react to spots.');
      return;
    }

    if (isAuthor) {
      setErrorMsg('Authors cannot react to their own post.');
      return;
    }

    if (submitting) return;

    setErrorMsg('');
    setSubmitting(true);

    const isRemoving = myReaction === type;
    const targetType = isRemoving ? null : type;

    // Trigger visual pop animation
    setAnimatingType(type);
    setTimeout(() => setAnimatingType(null), 600);

    // Optimistic local state update
    const prevReactions = { ...reactions };
    const prevMyReaction = myReaction;

    const nextReactions = { ...reactions };
    if (isRemoving) {
      nextReactions[type] = Math.max(0, (nextReactions[type] || 0) - 1);
    } else {
      if (myReaction && myReaction !== type) {
        nextReactions[myReaction] = Math.max(0, (nextReactions[myReaction] || 0) - 1);
      }
      nextReactions[type] = (nextReactions[type] || 0) + 1;
    }

    setReactions(nextReactions);
    setMyReaction(targetType);

    try {
      const res = await api.reactToPost(postId, targetType);

      if (onReactionChange) {
        onReactionChange({
          meter: res.meter,
          score: res.score,
          tier: res.tier,
          myReaction: targetType,
          reactions: nextReactions,
        });
      }
    } catch (err) {
      // Rollback on failure
      setReactions(prevReactions);
      setMyReaction(prevMyReaction);
      setErrorMsg(err.message || 'Failed to update reaction.');
    } finally {
      setSubmitting(false);
    }
  };

  const totalReactions = Object.values(reactions).reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <div className="reaction-bar-container" role="region" aria-label="Scout Reactions">
      <div className="reaction-bar-header">
        <span className="reaction-bar-title">⚡ Scout Reactions (+5 pts each)</span>
        <span className="reaction-bar-total">{totalReactions} total</span>
      </div>

      {errorMsg && (
        <div className="alert-error alert-small reaction-error" role="alert">
          {errorMsg}
        </div>
      )}

      <div className="reaction-buttons-grid" role="group" aria-label="Reactions">
        {REACTION_CONFIG.map(({ type, label, emoji, description, color }) => {
          const isSelected = myReaction === type;
          const isAnimating = animatingType === type;
          const count = reactions[type] || 0;

          return (
            <button
              key={type}
              type="button"
              className={`btn-reaction-pill ${isSelected ? 'selected' : ''} ${
                isAnimating ? 'animate-burst' : ''
              }`}
              style={{
                '--pill-accent': color,
              }}
              onClick={() => handleToggleReaction(type)}
              disabled={isAuthor || submitting}
              aria-pressed={isSelected}
              title={
                isAuthor
                  ? 'Authors cannot react to their own post'
                  : `${label}: ${description} (${count})`
              }
            >
              <span className="reaction-emoji" aria-hidden="true">
                {emoji}
              </span>
              <span className="reaction-label">{label}</span>
              <span className="reaction-count">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
