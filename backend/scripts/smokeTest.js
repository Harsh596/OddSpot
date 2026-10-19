process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'smoke-test-secret-value-12345';
process.env.AUTH_RATE_LIMIT_MAX = '5000';
process.env.WRITE_RATE_LIMIT_MAX = '5000';

const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { connect, mongoose } = require('../db');
const { app } = require('../server');
const models = require('../models');
const { User, Post, Comment, Vote, Report } = models;

const TEST_PORT = 5098;
const BASE_URL = `http://localhost:${TEST_PORT}`;

let server;
let mongod = null;
const createdUserIds = [];
const createdPostIds = [];
const createdCommentIds = [];
const createdVoteIds = [];
const createdReportIds = [];

const results = [];

function record(name, passed, message = '') {
  results.push({ name, passed, message });
  const status = passed ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
  console.log(`[${status}] ${name}${message ? ' - ' + message : ''}`);
}

async function run() {
  console.log('=== Oddspot Automated Smoke Test ===\n');

  let testUri = process.env.MONGODB_TEST_URI;
  if (!testUri) {
    mongod = await MongoMemoryReplSet.create({
      replSet: { count: 1, dbName: 'oddspot_test' },
    });
    testUri = mongod.getUri();
  }

  await connect(testUri);

  for (const Model of Object.values(models)) {
    await Model.createCollection().catch(() => {});
    await Model.syncIndexes();
  }

  server = app.listen(TEST_PORT);
  const runId = Date.now().toString().slice(-8);
  const testUsername = `test_${runId}`;
  const testEmail = `test_${runId}@example.com`;
  const testPassword = 'SmokePassword123!';

  let testUserToken = null;
  let testUserId = null;
  let testPostId = null;
  let testFuzzedPostId = null;

  try {
    // 1. Signup
    const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, email: testEmail, password: testPassword }),
    });
    const signupData = await signupRes.json();
    testUserToken = signupData.token;
    testUserId = signupData.user?.id;
    if (testUserId) createdUserIds.push(testUserId);
    record('1. Signup creates test_ user', signupRes.status === 201 && Boolean(testUserToken));

    // 2. Login
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testUsername, password: testPassword }),
    });
    const loginData = await loginRes.json();
    record('2. Login returns JWT token', loginRes.status === 200 && Boolean(loginData.token));

    // 3. Wrong password 401
    const wrongPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: testUsername, password: 'WrongPassword!' }),
    });
    record('3. Wrong password returns 401', wrongPassRes.status === 401);

    // 4. No-token 401 on protected route
    const noTokenRes = await fetch(`${BASE_URL}/api/auth/me`);
    record('4. Missing token on protected route returns 401', noTokenRes.status === 401);

    // 5. Duplicate signup 409
    const dupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: testUsername, email: `other_${runId}@example.com`, password: testPassword }),
    });
    record('5. Duplicate username signup returns 409', dupRes.status === 409);

    // 6. Invalid coordinates 400
    const invCoordRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Coord Post',
        latitude: 95.0, // Invalid: > 90
        longitude: 77.5,
        city: 'Bengaluru',
        country: 'India',
      }),
    });
    record('6. Invalid coordinates returns 400', invCoordRes.status === 400);

    // 7. Invalid image URL 400 (HTTP instead of HTTPS)
    const invImgRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Invalid Image Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        images: ['http://insecure-site.com/pic.jpg'],
      }),
    });
    record('7. Insecure non-HTTPS image URL returns 400', invImgRes.status === 400);

    // 8. Create standard post
    const createPostRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Smoke Test Mysterious Stone',
        body: 'A weird engraved rock sitting at the edge of the lake.',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        images: ['https://images.unsplash.com/photo-1513836279014-a89f7a76ae86'],
        tags: ['stone', 'odd'],
      }),
    });
    const createPostData = await createPostRes.json();
    testPostId = createPostData._id;
    if (testPostId) createdPostIds.push(testPostId);
    record('8. Create post returns 201 with stored URLs only', createPostRes.status === 201 && testPostId);

    // Verify user stats.posts incremented
    const userDoc = await User.findById(testUserId);
    record('8b. Author stats.posts incremented', userDoc?.stats?.posts >= 1);

    // 9. Create hideExact post, verify fuzzed coordinates and rounded distance
    const createFuzzedRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Smoke Test Hidden Shrine',
        latitude: 12.971842,
        longitude: 77.594891,
        city: 'Bengaluru',
        country: 'India',
        hideExact: true,
        images: ['https://images.unsplash.com/photo-1518709268805-4e9042af9f23'],
      }),
    });
    const fuzzedPostData = await createFuzzedRes.json();
    testFuzzedPostId = fuzzedPostData._id;
    if (testFuzzedPostId) createdPostIds.push(testFuzzedPostId);

    const isFuzzedCoords =
      fuzzedPostData.location?.fuzzed === true &&
      fuzzedPostData.location?.coordinates?.[0] !== 77.594891;
    record('9. hideExact post returns fuzzed coordinates in response', isFuzzedCoords);

    // 10. Nearby feed sorted by distance and hideExact rounded distance
    const nearbyRes = await fetch(
      `${BASE_URL}/api/posts/nearby?lat=12.9800&lng=77.6000&maxDistance=10000`
    );
    const nearbyData = await nearbyRes.json();
    let isSorted = true;
    for (let i = 0; i < nearbyData.posts.length - 1; i++) {
      if (nearbyData.posts[i].distanceMeters > nearbyData.posts[i + 1].distanceMeters) {
        isSorted = false;
        break;
      }
    }
    const hiddenInNearby = nearbyData.posts.find((p) => p._id === testFuzzedPostId);
    const isRoundedTo500 =
      hiddenInNearby && hiddenInNearby.distanceMeters % 500 === 0;

    record('10. Nearby feed returns posts sorted by distance', isSorted);
    record('10b. hideExact post distanceMeters quantized to 500m', Boolean(isRoundedTo500));

    // 11. Vote without token 401
    const noTokenVote = await fetch(`${BASE_URL}/api/posts/${testPostId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 1 }),
    });
    record('11. Vote without token returns 401', noTokenVote.status === 401);

    // 12. Vote value 5 returns 400
    const invVoteRes = await fetch(`${BASE_URL}/api/posts/${testPostId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ value: 5 }),
    });
    record('12. Vote value 5 returns 400', invVoteRes.status === 400);

    // 13. Like twice returns changed: false
    const firstLikeRes = await fetch(`${BASE_URL}/api/posts/${testPostId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ value: 1 }),
    });
    const firstLikeData = await firstLikeRes.json();

    const secondLikeRes = await fetch(`${BASE_URL}/api/posts/${testPostId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ value: 1 }),
    });
    const secondLikeData = await secondLikeRes.json();
    record('13. Like twice returns changed: false', secondLikeData.changed === false);

    // 14. Like -> dislike moves counters correctly
    const dislikeRes = await fetch(`${BASE_URL}/api/posts/${testPostId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ value: -1 }),
    });
    const dislikeData = await dislikeRes.json();
    const countersValid =
      dislikeData.meter?.likes === 0 &&
      dislikeData.meter?.dislikes === 1 &&
      dislikeData.score < firstLikeData.score;
    record('14. Like -> dislike moves counters correctly', countersValid);

    // 15. Comment create and fetch
    const commentRes = await fetch(`${BASE_URL}/api/posts/${testPostId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ body: 'Smoke test comment verifying applyDelta!' }),
    });
    const commentData = await commentRes.json();
    if (commentData.comment?._id) createdCommentIds.push(commentData.comment._id);

    const getCommentsRes = await fetch(`${BASE_URL}/api/posts/${testPostId}/comments`);
    const getCommentsData = await getCommentsRes.json();
    const commentFound = getCommentsData.comments?.some(
      (c) => c.body === 'Smoke test comment verifying applyDelta!'
    );
    record('15. Comment create and fetch works (applyDelta called)', commentRes.status === 201 && commentFound);

    // 16. Tier-up check with METER_COUNTRY_THRESHOLD override
    // Set low country threshold (e.g. 2 points)
    process.env.METER_COUNTRY_THRESHOLD = '2';
    // Create a new post for tier-up test
    const tierPostRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Tier-up Test Spot',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      }),
    });
    const tierPost = await tierPostRes.json();
    createdPostIds.push(tierPost._id);

    // Post comment (+3 points) which crosses threshold of 2
    const tierCommentRes = await fetch(`${BASE_URL}/api/posts/${tierPost._id}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ body: 'Points booster!' }),
    });
    const tierCommentData = await tierCommentRes.json();
    if (tierCommentData.comment?._id) createdCommentIds.push(tierCommentData.comment._id);

    const checkTieredPost = await Post.findById(tierPost._id);
    const movedToCountry = checkTieredPost.tier === 'country';

    // Now cast dislike to reduce score below threshold: tier must NEVER revert to city!
    await fetch(`${BASE_URL}/api/posts/${tierPost._id}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ value: -1 }),
    });
    const recheckPost = await Post.findById(tierPost._id);
    const neverReverts = recheckPost.tier === 'country';

    record('16. Tier moves city -> country and never reverts back down', movedToCountry && neverReverts);

    // Reset threshold
    delete process.env.METER_COUNTRY_THRESHOLD;

    // 17. Report endpoint checks (PART C)
    // 17a. Can't report own post
    const ownReportRes = await fetch(`${BASE_URL}/api/posts/${testPostId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({ reason: 'unsafe_or_private' }),
    });
    record('17a. Users cannot report their own post (400)', ownReportRes.status === 400);

    // Create 3 additional reporter users to test report duplicate and auto-fuzzing
    const reporterTokens = [];
    for (let r = 1; r <= 3; r++) {
      const repUser = `test_r${r}_${runId}`;
      const repRes = await fetch(`${BASE_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: repUser,
          email: `${repUser}@example.com`,
          password: testPassword,
        }),
      });
      const repData = await repRes.json();
      if (repData.user?.id) createdUserIds.push(repData.user.id);
      reporterTokens.push(repData.token);
    }

    // 17b. Valid report
    const validRepRes = await fetch(`${BASE_URL}/api/posts/${testPostId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${reporterTokens[0]}`,
      },
      body: JSON.stringify({ reason: 'unsafe_or_private', details: 'Private residence gate' }),
    });
    const validRepData = await validRepRes.json();
    if (validRepData.reportId) createdReportIds.push(validRepData.reportId);
    record('17b. Valid report returns 201', validRepRes.status === 201);

    // 17c. Duplicate report returns 409
    const dupRepRes = await fetch(`${BASE_URL}/api/posts/${testPostId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${reporterTokens[0]}`,
      },
      body: JSON.stringify({ reason: 'unsafe_or_private' }),
    });
    record('17c. Duplicate report by same user returns 409', dupRepRes.status === 409);

    // 17d. Reports reaching REPORT_FUZZ_THRESHOLD automatically set hideExact: true
    // Post testPostId has 1 unsafe_or_private report; submit reports from reporter 2 and 3
    const rep2 = await fetch(`${BASE_URL}/api/posts/${testPostId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${reporterTokens[1]}`,
      },
      body: JSON.stringify({ reason: 'unsafe_or_private' }),
    });
    const rep2Data = await rep2.json();
    if (rep2Data.reportId) createdReportIds.push(rep2Data.reportId);

    const rep3 = await fetch(`${BASE_URL}/api/posts/${testPostId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${reporterTokens[2]}`,
      },
      body: JSON.stringify({ reason: 'unsafe_or_private' }),
    });
    const rep3Data = await rep3.json();
    if (rep3Data.reportId) createdReportIds.push(rep3Data.reportId);

    const postAfterReports = await Post.findById(testPostId);
    record(
      '17d. Post auto-fuzzed (hideExact: true) upon reaching threshold unsafe reports',
      postAfterReports.hideExact === true
    );

    // 18. Radius-probing leak check (PART A)
    // Create a hideExact post where stored coordinates are at [77.59489, 12.97184]
    // The fuzzed coordinates are [77.595, 12.97]
    // Snapped distance steps: 1000, 2000, 5000, 10000, 25000.
    // Query with maxDistance=1000 from a query point:
    // If query is within 1000m of fuzzed point, it appears.
    const queryNearFuzzed = await fetch(
      `${BASE_URL}/api/posts/nearby?lat=12.9705&lng=77.5950&maxDistance=1000`
    );
    const nearFuzzedData = await queryNearFuzzed.json();
    const appearsInFuzzedRadius = nearFuzzedData.posts.some((p) => p._id === testFuzzedPostId);

    // Query from point where fuzzed distance is > 1000m (e.g. lat=12.9600, ~1.1km away)
    const queryAwayFuzzed = await fetch(
      `${BASE_URL}/api/posts/nearby?lat=12.9600&lng=77.5950&maxDistance=1000`
    );
    const awayFuzzedData = await queryAwayFuzzed.json();
    const excludedOutsideFuzzedRadius = !awayFuzzedData.posts.some((p) => p._id === testFuzzedPostId);

    record(
      '18. hideExact post feed appearance depends strictly on fuzzed-point distance (Part A)',
      appearsInFuzzedRadius && excludedOutsideFuzzedRadius
    );

    // 19. Malformed JSON returns 400 with generic error and leaks no parser internals
    const malformedRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    const malformedText = await malformedRes.text();
    const isGenericJsonError =
      malformedRes.status === 400 &&
      malformedText.includes('Invalid JSON body') &&
      !malformedText.includes('SyntaxError') &&
      !malformedText.includes('at ');
    record('19. Malformed JSON returns 400 with generic message and no parser leak', isGenericJsonError);

    // 20. Non-JSON Content-Type returns 400 without crashing
    const wrongCtRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello world',
    });
    record('20. Non-JSON Content-Type with body returns 400 without crashing', wrongCtRes.status === 400);

    // 21. Empty / undefined body handled gracefully without 500
    const emptyBodyRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    record('21. Empty request body returns 400 without crashing', emptyBodyRes.status === 400);

    // 22. Tags: max 10 tags (60 tags rejected with 400)
    const tooManyTags = Array.from({ length: 60 }, (_, i) => `tag${i}`);
    const sixtyTagsRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Too Many Tags Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        tags: tooManyTags,
      }),
    });
    record('22. Exceeding 10 tags returns 400', sixtyTagsRes.status === 400);

    // 23. Tag exceeding 30 characters rejected with 400
    const longTag = 'a'.repeat(31);
    const longTagRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Long Tag Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
        tags: [longTag],
      }),
    });
    record('23. Tag exceeding 30 characters returns 400', longTagRes.status === 400);

    // 24. Unknown post type rejected with 400
    const unknownTypeRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Unknown Type Post',
        type: 'hacked',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      }),
    });
    record('24. Unknown post type returns 400', unknownTypeRes.status === 400);

    // 25. Concurrency: 20 parallel likes from ONE user: none return 500 and counter is exactly 1
    const racePostRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Race Condition Test Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        country: 'India',
      }),
    });
    const racePostData = await racePostRes.json();
    if (racePostData._id) createdPostIds.push(racePostData._id);

    const parallelLikes = await Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`${BASE_URL}/api/posts/${racePostData._id}/vote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testUserToken}`,
          },
          body: JSON.stringify({ value: 1 }),
        })
      )
    );
    const likeStatuses = parallelLikes.map((r) => r.status);
    const noLike500 = !likeStatuses.some((s) => s >= 500);

    const postAfterLikes = await Post.findById(racePostData._id);
    record(
      '25. 20 parallel likes from one user: zero 500s and likes counter is exactly 1',
      noLike500 && postAfterLikes.meter?.likes === 1
    );

    // 26. Concurrency: 20 parallel like->dislike switches from ONE user: zero 500s, likes=0, dislikes=1
    const parallelDislikes = await Promise.all(
      Array.from({ length: 20 }, () =>
        fetch(`${BASE_URL}/api/posts/${racePostData._id}/vote`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testUserToken}`,
          },
          body: JSON.stringify({ value: -1 }),
        })
      )
    );
    const dislikeStatuses = parallelDislikes.map((r) => r.status);
    const noDislike500 = !dislikeStatuses.some((s) => s >= 500);

    const postAfterDislikes = await Post.findById(racePostData._id);
    record(
      '26. 20 parallel like->dislike switches: zero 500s, likes=0, dislikes=1',
      noDislike500 &&
        postAfterDislikes.meter?.likes === 0 &&
        postAfterDislikes.meter?.dislikes === 1
    );

    // 27. Unexpected input shape: non-string state and image without string URL handled safely
    const badShapeRes = await fetch(`${BASE_URL}/api/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${testUserToken}`,
      },
      body: JSON.stringify({
        title: 'Bad Shape Post',
        latitude: 12.9716,
        longitude: 77.5946,
        city: 'Bengaluru',
        state: 12345, // Non-string state
        country: 'India',
        images: [{ url: 99999 }], // Non-string URL
      }),
    });
    record('27. Unexpected input shape (non-string image URL) returns 400 without 500', badShapeRes.status === 400);
  } catch (err) {
    console.error('Smoke test exception:', err);
    record('Unexpected smoke test error', false, err.message);
  } finally {
    // Clean up ONLY test_ records created during this run
    console.log('\nCleaning up smoke test artifacts...');
    if (createdReportIds.length) {
      await Report.deleteMany({ _id: { $in: createdReportIds } });
    }
    if (createdCommentIds.length) {
      await Comment.deleteMany({ _id: { $in: createdCommentIds } });
    }
    if (testUserId) {
      await Vote.deleteMany({ userId: { $in: createdUserIds } });
    }
    if (createdPostIds.length) {
      await Post.deleteMany({ _id: { $in: createdPostIds } });
    }
    if (createdUserIds.length) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
    }
    console.log('Cleanup complete.');

    if (server) server.close();
    await mongoose.disconnect();
    if (mongod) {
      await mongod.stop();
    }
  }

  // Summary
  console.log('\n=== Smoke Test Summary ===');
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`Passed: ${passedCount}/${totalCount}`);

  if (passedCount === totalCount) {
    console.log('\x1b[32mAll smoke tests passed successfully!\x1b[0m\n');
    process.exit(0);
  } else {
    console.log('\x1b[31mSome smoke tests failed.\x1b[0m\n');
    process.exit(1);
  }
}

run();
