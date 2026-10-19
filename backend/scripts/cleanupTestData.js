// backend/scripts/cleanupTestData.js
// Cleanup utility for test records created by smoke test and manual checks.
// Dry run by default. Pass --apply to actually delete.

const { connect, disconnect } = require('../db');
const { User, Post, Comment, Vote, Report } = require('../models');

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log(`=== Cleanup Test Data (${isApply ? 'APPLY MODE' : 'DRY RUN'}) ===\n`);

  await connect();

  try {
    // 1. Identify test users
    const userQuery = {
      $or: [
        { username: { $regex: /^test(_|chk_)/i } },
        { email: { $regex: /^test(_|chk_)/i } },
      ],
    };
    const testUsers = await User.find(userQuery).select('_id username email');
    const testUserIds = testUsers.map((u) => u._id);

    // 2. Identify test posts
    const postQuery = {
      $or: [
        { title: { $regex: /^test(_|chk_)/i } },
        { authorId: { $in: testUserIds } },
      ],
    };
    const testPosts = await Post.find(postQuery).select('_id title');
    const testPostIds = testPosts.map((p) => p._id);

    // 3. Identify child records (comments, votes, reports)
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

    const usersCount = testUsers.length;
    const postsCount = testPosts.length;
    const commentsCount = await Comment.countDocuments(commentQuery);
    const votesCount = await Vote.countDocuments(voteQuery);
    const reportsCount = await Report.countDocuments(reportQuery);

    console.log(`Found test records:`);
    console.log(`- Users:    ${usersCount}`);
    console.log(`- Posts:    ${postsCount}`);
    console.log(`- Comments: ${commentsCount}`);
    console.log(`- Votes:    ${votesCount}`);
    console.log(`- Reports:  ${reportsCount}`);

    if (!isApply) {
      console.log('\n[DRY RUN] No records were deleted.');
      console.log('To permanently delete these test records, run:');
      console.log('  node scripts/cleanupTestData.js --apply');
    } else {
      console.log('\n[APPLY] Deleting test records...');

      const delReports = await Report.deleteMany(reportQuery);
      const delVotes = await Vote.deleteMany(voteQuery);
      const delComments = await Comment.deleteMany(commentQuery);
      const delPosts = await Post.deleteMany(postQuery);
      const delUsers = await User.deleteMany(userQuery);

      console.log(`Successfully deleted:`);
      console.log(`- Reports:  ${delReports.deletedCount}`);
      console.log(`- Votes:    ${delVotes.deletedCount}`);
      console.log(`- Comments: ${delComments.deletedCount}`);
      console.log(`- Posts:    ${delPosts.deletedCount}`);
      console.log(`- Users:    ${delUsers.deletedCount}`);
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
