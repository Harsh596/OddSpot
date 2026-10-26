// backend/services/notifications.js
// Notification dispatcher with 1-hour bucket deduplication, mention extractor, and trigger handlers (P13).

const { Notification, User } = require('../models');

/**
 * Creates a notification with atomic deduplication.
 * - Never notifies a user of their own action.
 * - Never creates notifications from shadow-banned actors.
 * - 1-hour time-bucket deduplication for interaction events.
 * - Single-fire deduplication for tier_up.
 */
async function createNotification({
  userId,
  actorId = null,
  type,
  postId = null,
  data = {},
  actorShadowBanned = false,
}) {
  if (!userId) return null;
  if (actorId && String(userId) === String(actorId)) return null;
  if (actorShadowBanned === true) return null;

  // Deduplication Key Construction
  let dedupeKey;
  if (type === 'tier_up') {
    dedupeKey = `tier_up:${postId}`;
  } else {
    const hourBucket = Math.floor(Date.now() / 3600000);
    dedupeKey = `${type}:${userId}:${actorId}:${postId}:${hourBucket}`;
  }

  try {
    const doc = await Notification.findOneAndUpdate(
      { dedupeKey },
      {
        $setOnInsert: {
          userId,
          actorId: actorId || null,
          type,
          postId: postId || null,
          dedupeKey,
          data,
          read: false,
          createdAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return doc;
  } catch (err) {
    if (err.code === 11000) {
      // Swallowed duplicate key error due to race condition on dedupeKey unique index
      return await Notification.findOne({ dedupeKey });
    }
    console.error('Failed to create notification:', err.message);
    return null;
  }
}

/**
 * Extracts up to 5 unique @username mentions from text.
 * Matches ASCII usernames: 3-24 characters containing letters, numbers, underscores.
 *
 * @param {string} text
 * @returns {string[]} Unique usernames
 */
function extractMentionedUsernames(text) {
  if (!text || typeof text !== 'string') return [];
  const regex = /(?:^|[^A-Za-z0-9_])@([A-Za-z0-9_]{3,24})/g;
  const usernames = new Set();
  let match;

  while ((match = regex.exec(text)) !== null) {
    usernames.add(match[1]);
    if (usernames.size >= 5) break;
  }

  return Array.from(usernames);
}

/**
 * Resolves mentioned usernames and dispatches mention notifications.
 */
async function notifyMentions({
  text,
  postId = null,
  actorId = null,
  commentId = null,
  actorShadowBanned = false,
}) {
  const usernames = extractMentionedUsernames(text);
  if (usernames.length === 0) return [];

  const lowerNames = usernames.map((u) => u.toLowerCase());
  const matchedUsers = await User.find({
    usernameLower: { $in: lowerNames },
    banned: { $ne: true },
  })
    .select('_id username')
    .lean();

  const dispatched = [];
  for (const targetUser of matchedUsers) {
    const notif = await createNotification({
      userId: targetUser._id,
      actorId,
      type: 'mention',
      postId,
      data: {
        commentId: commentId || null,
        mentionText: text.length > 100 ? `${text.slice(0, 97)}...` : text,
      },
      actorShadowBanned,
    });
    if (notif) dispatched.push(notif);
  }

  return dispatched;
}

/**
 * Dispatches notifications for comment creation (comment, reply, and mentions).
 */
async function notifyComment({
  post,
  comment,
  actorId,
  parentCommentAuthorId = null,
  actorShadowBanned = false,
}) {
  if (!post) return;

  const results = [];

  // 1. Reply to parent comment author (if this is a nested comment)
  if (parentCommentAuthorId) {
    const replyNotif = await createNotification({
      userId: parentCommentAuthorId,
      actorId,
      type: 'reply',
      postId: post._id,
      data: {
        commentId: comment._id,
        parentId: comment.parentId,
      },
      actorShadowBanned,
    });
    if (replyNotif) results.push(replyNotif);

    // If post author is distinct from parent comment author, also notify post author of comment
    if (
      post.authorId &&
      String(post.authorId) !== String(parentCommentAuthorId)
    ) {
      const postCommentNotif = await createNotification({
        userId: post.authorId,
        actorId,
        type: 'comment',
        postId: post._id,
        data: {
          commentId: comment._id,
        },
        actorShadowBanned,
      });
      if (postCommentNotif) results.push(postCommentNotif);
    }
  } else {
    // 2. Top-level comment: notify post author
    if (post.authorId) {
      const commentNotif = await createNotification({
        userId: post.authorId,
        actorId,
        type: 'comment',
        postId: post._id,
        data: {
          commentId: comment._id,
        },
        actorShadowBanned,
      });
      if (commentNotif) results.push(commentNotif);
    }
  }

  // 3. Mentions in comment body
  if (comment.body) {
    const mentionNotifs = await notifyMentions({
      text: comment.body,
      postId: post._id,
      actorId,
      commentId: comment._id,
      actorShadowBanned,
    });
    results.push(...mentionNotifs);
  }

  return results;
}

/**
 * Dispatches a tier_up notification when a post transitions from city to country tier.
 */
async function notifyTierUp({ post }) {
  if (!post || !post.authorId) return null;
  return await createNotification({
    userId: post.authorId,
    actorId: null,
    type: 'tier_up',
    postId: post._id,
    data: {
      newTier: post.tier || 'country',
      score: post.meter?.score ?? 0,
    },
  });
}

/**
 * Dispatches a visit notification when a user checks in at a spot.
 */
async function notifyVisit({ post, actorId, visitId = null, actorShadowBanned = false }) {
  if (!post || !post.authorId) return null;
  return await createNotification({
    userId: post.authorId,
    actorId,
    type: 'visit',
    postId: post._id,
    data: {
      visitId,
    },
    actorShadowBanned,
  });
}

module.exports = {
  createNotification,
  extractMentionedUsernames,
  notifyMentions,
  notifyComment,
  notifyTierUp,
  notifyVisit,
};
