// backend/services/trust.js
// Per-user trust score engine and reporter weight calculator.

const { User, Report, Post, Comment } = require('../models');
const { invalidateUserAuthCache } = require('../middleware/auth');

/**
 * Recomputes and persists user trust score.
 *
 * Formula:
 * Base trust = 1.0, clamped to [0.1, 2.0]
 * + min(0.3, accountAgeDays * 0.01)
 * + min(0.4, verifiedVisitsCount * 0.05)
 * + min(0.3, upheldReportsByUserCount * 0.05)
 * - (dismissedReportsByUserCount * 0.10)
 * - (removedPostsOrCommentsOfUserCount * 0.25)
 *
 * @param {string|mongoose.Types.ObjectId} userId
 * @param {mongoose.ClientSession|null} session
 * @returns {Promise<number|null>}
 */
async function recomputeUserTrust(userId, session = null) {
  if (!userId) return null;

  let query = User.findById(userId);
  if (session) query = query.session(session);
  const user = await query;
  if (!user) return null;

  const now = Date.now();
  const createdAt = user.createdAt ? new Date(user.createdAt).getTime() : now;
  const accountAgeDays = Math.max(0, (now - createdAt) / (1000 * 60 * 60 * 24));
  const verifiedVisitsCount = Number(user.stats?.visits || 0);

  let upheldReportsQuery = Report.countDocuments({
    reporterId: userId,
    status: { $in: ['resolved', 'actioned'] },
  });
  if (session) upheldReportsQuery = upheldReportsQuery.session(session);
  const upheldReportsByUserCount = await upheldReportsQuery;

  let dismissedReportsQuery = Report.countDocuments({
    reporterId: userId,
    status: 'dismissed',
  });
  if (session) dismissedReportsQuery = dismissedReportsQuery.session(session);
  const dismissedReportsByUserCount = await dismissedReportsQuery;

  let removedPostsQuery = Post.countDocuments({
    authorId: userId,
    removed: true,
  });
  if (session) removedPostsQuery = removedPostsQuery.session(session);
  const removedPosts = await removedPostsQuery;

  let removedCommentsQuery = Comment.countDocuments({
    authorId: userId,
    removed: true,
  });
  if (session) removedCommentsQuery = removedCommentsQuery.session(session);
  const removedComments = await removedCommentsQuery;

  const removedPostsOrCommentsOfUserCount = removedPosts + removedComments;

  const rawScore =
    1.0 +
    Math.min(0.3, accountAgeDays * 0.01) +
    Math.min(0.4, verifiedVisitsCount * 0.05) +
    Math.min(0.3, upheldReportsByUserCount * 0.05) -
    (dismissedReportsByUserCount * 0.10) -
    (removedPostsOrCommentsOfUserCount * 0.25);

  const clampedScore = Number(Math.min(2.0, Math.max(0.1, rawScore)).toFixed(2));

  await User.updateOne(
    { _id: userId },
    { $set: { trust: { score: clampedScore, updatedAt: new Date() } } },
    session ? { session } : {}
  );

  invalidateUserAuthCache(userId.toString());
  return clampedScore;
}

/**
 * Calculates report weight for a reporter account.
 * Account younger than 3 days (config.newAccountDays) starts at 0.5 * user.trust.score;
 * mature account starts at 1.0 * user.trust.score, clamped to [0.2, 2.0].
 *
 * @param {object} user
 * @returns {number}
 */
function getReporterWeight(user) {
  let trustScore = 1.0;
  if (user?.trust && typeof user.trust === 'object' && user.trust.score !== undefined) {
    trustScore = Number(user.trust.score);
  } else if (typeof user?.trust === 'number' && user.trust > 0) {
    trustScore = user.trust;
  }

  const now = Date.now();
  const createdAt = user?.createdAt ? new Date(user.createdAt).getTime() : now;
  const ageDays = Math.max(0, (now - createdAt) / (1000 * 60 * 60 * 24));
  const isNew = ageDays < 3;
  const multiplier = isNew ? 0.5 : 1.0;
  const rawWeight = multiplier * trustScore;
  const clampedWeight = Number(Math.min(2.0, Math.max(0.2, rawWeight)).toFixed(2));
  return clampedWeight;
}

module.exports = {
  recomputeUserTrust,
  getReporterWeight,
};
