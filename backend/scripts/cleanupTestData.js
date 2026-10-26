// backend/scripts/cleanupTestData.js
// Cleanup utility for test records created by smoke test, unit/integration tests, and manual checks.
// Targets records with test_ and test_2_ (and test_chk_) prefixes.
// Dry run by default. Pass --apply to actually delete.

const { connect, disconnect } = require('../db');
const { User, Post, Comment, Vote, Report, RefreshToken, IdempotencyKey } = require('../models');

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log(`=== Cleanup Test Data (${isApply ? 'APPLY MODE' : 'DRY RUN'}) ===\n`);

  await connect();

  try {
    const testPattern = /^(test_|test_2_|test_chk_)/i;

    // 1. Identify test users
    const userQuery = {
      $or: [
        { username: { $regex: testPattern } },
        { email: { $regex: testPattern } },
      ],
    };
    const testUsers = await User.find(userQuery).select('_id username email');
    const testUserIds = testUsers.map((u) => u._id);

    // 2. Identify test posts
    const postQuery = {
      $or: [
        { title: { $regex: testPattern } },
        { authorId: { $in: testUserIds } },
      ],
    };
    const testPosts = await Post.find(postQuery).select('_id title');
    const testPostIds = testPosts.map((p) => p._id);

    // 3. Identify child records (comments, votes, reports, refresh tokens, idempotency keys)
    const commentQuery = {
      $or: [{ authorId: { $in: testUserIds } }, { postId: { $in: testPostIds } }],
    };
    const voteQuery = {
      $or: [{ userId: { $in: testUserIds } }, { postId: { $in: testPostIds } }],
    };
    const reportQuery = {
      $or: [
        { reporterId: { $in: testUserIds } },
        { targetId: { $in: testPostIds } },
      ],
    };
    const tokenQuery = {
      userId: { $in: testUserIds },
    };
    const idempotencyQuery = {
      userId: { $in: testUserIds },
    };

    const usersCount = testUsers.length;
    const postsCount = testPosts.length;
    const commentsCount = await Comment.countDocuments(commentQuery);
    const votesCount = await Vote.countDocuments(voteQuery);
    const reportsCount = await Report.countDocuments(reportQuery);
    const tokensCount = RefreshToken ? await RefreshToken.countDocuments(tokenQuery) : 0;
    const idempotencyCount = IdempotencyKey ? await IdempotencyKey.countDocuments(idempotencyQuery) : 0;

    console.log(`Found test records:`);
    console.log(`- Users:            ${usersCount}`);
    console.log(`- Posts:            ${postsCount}`);
    console.log(`- Comments:         ${commentsCount}`);
    console.log(`- Votes:            ${votesCount}`);
    console.log(`- Reports:          ${reportsCount}`);
    console.log(`- Refresh Tokens:   ${tokensCount}`);
    console.log(`- Idempotency Keys: ${idempotencyCount}`);

    if (!isApply) {
      console.log('\n[DRY RUN] No records were deleted.');
      console.log('To permanently delete these test records, run:');
      console.log('  node scripts/cleanupTestData.js --apply');
    } else {
      console.log('\n[APPLY] Deleting test records...');

      const delReports = await Report.deleteMany(reportQuery);
      const delVotes = await Vote.deleteMany(voteQuery);
      const delComments = await Comment.deleteMany(commentQuery);
      if (RefreshToken) await RefreshToken.deleteMany(tokenQuery);
      if (IdempotencyKey) await IdempotencyKey.deleteMany(idempotencyQuery);
      const delPosts = await Post.deleteMany(postQuery);
      const delUsers = await User.deleteMany(userQuery);

      console.log(`Successfully deleted:`);
      console.log(`- Reports:          ${delReports.deletedCount}`);
      console.log(`- Votes:            ${delVotes.deletedCount}`);
      console.log(`- Comments:         ${delComments.deletedCount}`);
      console.log(`- Refresh Tokens:   ${tokensCount}`);
      console.log(`- Idempotency Keys: ${idempotencyCount}`);
      console.log(`- Posts:            ${delPosts.deletedCount}`);
      console.log(`- Users:            ${delUsers.deletedCount}`);
      console.log('\nCleanup complete.');
    }
  } catch (err) {
    console.error('Cleanup error:', err);
    process.exitCode = 1;
  } finally {
    await disconnect();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
