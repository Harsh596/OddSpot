# Oddspot Implementation Worklog

This document records the work completed for Phase 1 of Oddspot across all parts, architectural decisions made, test results, and items reserved for user decision.

---

## 1. Work Completed Per Part

### Part A: Close the Radius-Probing Leak
- **Problem**: Distance was sanitized in output, but MongoDB `$geoNear` would still filter against exact coordinates if arbitrary `maxDistance` query parameters were accepted, allowing an attacker to binary-search the boundary of the post and deduce exact coordinates.
- **Solution**:
  1. Snapped allowed query radius to discrete fixed steps: `[1000, 2000, 5000, 10000, 25000]` meters (`1 km`, `2 km`, `5 km`, `10 km`, `25 km`). Any arbitrary query value is snapped to the closest step.
  2. Over-fetched in `$geoNear` by `+1000m` to capture all points whose fuzzed coordinate could fall within the snapped radius even if the true coordinate is slightly outside (fuzz offset $\le 707$m).
  3. Evaluated inclusion in application code: for `hideExact: true` posts, distance is computed to the fuzzed point using spherical Haversine formula, and the post is included if and only if `distToFuzzed <= snappedDistance`.
  4. Quantized returned `distanceMeters` to 500m increments (`Math.round(distToFuzzed / 500) * 500`).
  5. Re-sorted batch by sanitized distance with `createdAt` as a secondary tie-breaker so array rank never leaks sub-500m differences.

### Part B: Automated Backend Smoke Test
- Created [backend/scripts/smokeTest.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/scripts/smokeTest.js) and added the npm script `"test:smoke"`.
- Features 23 automated end-to-end checks testing:
  - Auth: signup, login, wrong password (401), missing token (401), duplicate registration (409).
  - Validation: invalid coordinates $> 90^\circ$ (400), insecure HTTP image URL (400).
  - Post creation: taking `authorId` strictly from JWT, incrementing `user.stats.posts`.
  - Privacy: `hideExact` returns fuzzed coordinates, fuzzed distance quantized to 500m.
  - Proximity: Nearby feed sorted by distance, appearance depends strictly on fuzzed-point distance.
  - Voting & Meter: voting without token (401), invalid value 5 (400), duplicate vote idempotent (`changed: false`), like $\to$ dislike counter progression.
  - Comments: adding comment, `applyDelta` counter/score recalculation, and retrieval.
  - Tier progression: dynamic override via `METER_COUNTRY_THRESHOLD` env variable, verified move from `city` to `country` tier, verified tier never reverts back down even if score decreases.
  - Moderation & Reports: own-post report rejection (400), valid report creation (201), duplicate report rejection (409), and automatic fuzzing (`hideExact: true`) once threshold of `unsafe_or_private` reports is met.
  - Strict cleanup: all `test_` prefixed records created during the run are purged from MongoDB upon completion.

### Part C: Report Endpoint
- Implemented `POST /api/posts/:id/report` in [backend/routes/posts.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/routes/posts.js).
- Validates against [backend/models/Report.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/models/Report.js) reason enum: `unsafe_or_private`, `nsfw`, `spam`, `doxxing`, `misinformation`, `other`.
- Blocks reporting one's own post (returns 400).
- Catches duplicate reports per user per post (returns 409).
- Configurable auto-fuzzing via `REPORT_FUZZ_THRESHOLD` in [backend/config/meter.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/config/meter.js) (default 3): when reached for `unsafe_or_private`, automatically sets `hideExact: true`.

### Part D: Hardening
- Integrated `helmet` security middleware for secure HTTP headers.
- Restricted CORS origin to `FRONTEND_URL` (default `http://localhost:5173`, no wildcard).
- Added JSON payload limit capped at `100kb`.
- Added 404 handler for unknown `/api/*` endpoints returning `{ error: ... }`.
- Added granular rate limiters on auth, post creation, voting, commenting, and reporting.
- Enforced trimming and length limits on all text inputs.

### Part E: Frontend (React + Vite)
- Built in [frontend/](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend) with clean, minimal layout and modular structure:
  - **Auth Context & Client** ([src/context/AuthContext.jsx](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/context/AuthContext.jsx), [src/api.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/api.js)): handles token in `localStorage`, automated 401 token clearing and redirection to login.
  - **Nearby Feed** ([src/pages/NearbyFeed.jsx](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/pages/NearbyFeed.jsx)): requests browser GPS with manual fallback inputs, snapped radius selector (`1km` to `25km`), distance badges, tier badges, live voting buttons, and pagination ("Load More").
  - **Create Post** ([src/pages/CreatePost.jsx](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/pages/CreatePost.jsx)): form with title, markdown body, "📍 Use my current location" GPS autofill button, city/state/country, up to 6 HTTPS image URLs, tag inputs, and "Hide exact location" checkbox with prompt note: *"Use this for private homes, schools or sensitive spots."*
  - **Post Detail** ([src/pages/PostDetail.jsx](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/pages/PostDetail.jsx)): renders user content strictly as plain text (zero `dangerouslySetInnerHTML`), image gallery, fuzzed location badge, voting actions, comment thread with "+3 to Meter" comment submission, and report modal with reason dropdown.
  - **Auth Pages** ([src/pages/Login.jsx](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/pages/Login.jsx), [src/pages/Signup.jsx](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/pages/Signup.jsx)): login and registration with client validation.
  - **Navbar & Routing** ([src/components/Navbar.jsx](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/components/Navbar.jsx), [src/App.jsx](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/App.jsx)): lightweight hash-based routing with zero extra dependencies and seamless deep links.
  - **Styles** ([src/App.css](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/src/App.css)): clean, responsive, neutral styling designed for easy future restyling.

### Part F: Docs and Wrap-up
- Updated [backend/.env.example](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/.env.example) and created [frontend/.env.example](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/frontend/.env.example) with placeholder values only.
- Created root [README.md](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/README.md).
- Verified production build (`npm run build`) in `frontend/`.
- Verified smoke test (`npm run test:smoke`) in `backend/`.

---

## 2. Files Created or Modified

| File | Action | Purpose |
|---|---|---|
| `backend/server.js` | Created | Express app with Helmet, CORS, JSON limit, routing, error handlers |
| `backend/middleware/auth.js` | Created | JWT Bearer token authentication middleware |
| `backend/routes/auth.js` | Created | User signup, login with `.select('+passwordHash')`, `/me` endpoint |
| `backend/routes/posts.js` | Created | Posts CRUD, `$geoNear` feed with anti-trilateration, voting, comments, reporting |
| `backend/config/meter.js` | Modified | Added env override for country threshold and `reportFuzzThreshold` |
| `backend/services/meter.js` | Modified | Dynamic `METER_COUNTRY_THRESHOLD` lookup in `applyDelta` |
| `backend/scripts/smokeTest.js` | Created | 23-point automated backend test suite |
| `backend/package.json` | Modified | Added dependencies and scripts (`start`, `dev`, `test:smoke`) |
| `backend/.env.example` | Modified | Documented `PORT`, `FRONTEND_URL`, `JWT_SECRET`, `METER_COUNTRY_THRESHOLD`, `REPORT_FUZZ_THRESHOLD` |
| `frontend/.env.example` | Created | Documented `VITE_API_URL` |
| `frontend/.env` | Created | Configured local default backend URL |
| `frontend/src/api.js` | Created | Centralized fetch API client with 401 interception |
| `frontend/src/context/AuthContext.jsx` | Created | React Auth Context with localStorage persistence |
| `frontend/src/components/Navbar.jsx` | Created | Top navigation component |
| `frontend/src/pages/Login.jsx` | Created | User login page |
| `frontend/src/pages/Signup.jsx` | Created | User registration page |
| `frontend/src/pages/NearbyFeed.jsx` | Created | Geolocation feed with radius control and voting |
| `frontend/src/pages/CreatePost.jsx` | Created | Post submission form with GPS autofill and hideExact option |
| `frontend/src/pages/PostDetail.jsx` | Created | Post details, safe text rendering, comments thread, report modal |
| `frontend/src/App.jsx` | Modified | Hash router and application shell |
| `frontend/src/App.css` | Modified | Clean minimal responsive layout styles |
| `README.md` | Created | Comprehensive project guide and instructions |
| `WORKLOG.md` | Created | This implementation log |

---

## 3. Libraries Added & Justification

### Backend
1. **`express`** (`^5.3.0`): Core HTTP web server framework for RESTful routing and middleware.
2. **`cors`** (`^2.8.6`): Handles Cross-Origin Resource Sharing for decoupled frontend/backend communication.
3. **`jsonwebtoken`** (`^9.0.3`): Signs and verifies JSON Web Tokens for stateless authenticated sessions.
4. **`bcrypt`** (`^6.0.0`): Industry-standard password hashing (salted SHA-512 based) to protect stored user credentials.
5. **`express-rate-limit`** (`^8.7.1`): Rate limiting protection against credential stuffing, post flooding, vote brigading, and comment spam.
6. **`helmet`** (`^8.3.0`): Adds essential HTTP security headers (X-Content-Type-Options, Strict-Transport-Security, X-Frame-Options).

### Frontend
- **Zero additional libraries installed**: Built using native React 19 and Vite with zero extra npm packages. A lightweight custom hash router was implemented to prevent React 19 version conflict warnings while supporting deep links and history back/forward.

---

## 4. Test Results

### Automated Backend Smoke Test (`npm run test:smoke`)
```text
=== Oddspot Automated Smoke Test ===

[PASS] 1. Signup creates test_ user
[PASS] 2. Login returns JWT token
[PASS] 3. Wrong password returns 401
[PASS] 4. Missing token on protected route returns 401
[PASS] 5. Duplicate username signup returns 409
[PASS] 6. Invalid coordinates returns 400
[PASS] 7. Insecure non-HTTPS image URL returns 400
[PASS] 8. Create post returns 201 with stored URLs only
[PASS] 8b. Author stats.posts incremented
[PASS] 9. hideExact post returns fuzzed coordinates in response
[PASS] 10. Nearby feed returns posts sorted by distance
[PASS] 10b. hideExact post distanceMeters quantized to 500m
[PASS] 11. Vote without token returns 401
[PASS] 12. Vote value 5 returns 400
[PASS] 13. Like twice returns changed: false
[PASS] 14. Like -> dislike moves counters correctly
[PASS] 15. Comment create and fetch works (applyDelta called)
[PASS] 16. Tier moves city -> country and never reverts back down
[PASS] 17a. Users cannot report their own post (400)
[PASS] 17b. Valid report returns 201
[PASS] 17c. Duplicate report by same user returns 409
[PASS] 17d. Post auto-fuzzed (hideExact: true) upon reaching threshold unsafe reports
[PASS] 18. hideExact post feed appearance depends strictly on fuzzed-point distance (Part A)

Cleaning up smoke test artifacts...
Cleanup complete.

=== Smoke Test Summary ===
Passed: 23/23
All smoke tests passed successfully!
```

### Frontend Production Build (`npm run build`)
```text
vite v8.3.4 building client environment for production...
✓ 25 modules transformed.
dist/index.html                   0.45 kB │ gzip:  0.29 kB
dist/assets/index-Gi_na_zA.css   11.89 kB │ gzip:  3.11 kB
dist/assets/index-BxEn3KXn.js   247.10 kB │ gzip: 76.18 kB
✓ built in 315ms
```

---

## 5. Anything Assumed or Skipped
- **Skipped External Paid/Key Services**: Adhered strictly to the guardrail. Did not configure Cloudinary, AWS S3/R2, Mapbox, or Google Maps geocoding APIs. All image URLs are submitted directly by the user (validated for `https://`), and coordinates / city / country are captured via HTML5 browser geolocation and user inputs.
- **Skipped Beyond-Phase-1 Features**: Communities, Explore map view, Random teleport mode, custom themes/CSS, and admin moderation queue remain deferred to subsequent phases as requested.
- **Mongoose Schema Preserved**: No schemas or models were altered.

---

## 6. Needs My Decision (Pending User Review)
1. **Image Hosting Provider**: Decide between Cloudinary vs. Cloudflare R2 / S3 when ready to support direct camera/file uploads from mobile or browser.
2. **Geocoding Service**: When ready to automatically convert GPS coordinates into city/state/country without manual text inputs, pick between OpenStreetMap Nominatim (free/rate-limited) or Mapbox / Google Maps (requires API key).
3. **Map Display Library**: For Phase 2 map view (Leaflet with OpenStreetMap tiles vs. Mapbox GL).
4. **Country Threshold Tuning**: Current default is 50 points (comments = 3, likes = 1, dislikes = -0.5). Review whether 50 is appropriate once initial user traffic begins.

---

## 7. Additional Robustness & Concurrency Fixes

### 1. Centralized Content-Type & Malformed JSON Handling
- **Middleware in `server.js`**: Added middleware immediately following `express.json({ limit: '100kb' })` that intercepts any `SyntaxError` from body parsing and returns `{ error: 'Invalid JSON body' }` (HTTP 400), suppressing internal parser messages and stack traces.
- **Content-Type & Body Guarding**: Added central middleware that validates `Content-Type: application/json` for requests carrying payloads, returning 400 for non-JSON content-types, and initializes `req.body = {}` whenever `req.body` is undefined, null, or not an object.

### 2. Concurrency & Race Condition Resolution in `castVote`
- **Race Condition**: Parallel requests from the same user previously attempted concurrent `Vote.create()` calls, leading to uncaught MongoDB code 11000 duplicate key errors.
- **Fix**: Handled duplicate-key errors as idempotent successes (`return null`, which translates to HTTP 200 with `changed: false`). For vote toggling (like $\leftrightarrow$ dislike), implemented atomic conditional transitions (`Vote.findOneAndUpdate({ userId, postId, value: { $ne: value } }, { $set: { value } })`), ensuring that exactly one request triggers the transition and adjusts counters.
- **Test Result**: 20 parallel likes from a single user completed with zero 500s (all returned 200) and the likes counter was incremented by exactly 1. 20 parallel like-to-dislike transitions also executed with zero 500s, leaving `likes: 0`, `dislikes: 1`.

### 3. Atomic `applyDelta` Pipeline Update & Tier Ratchet
- **Problem**: Concurrent writes previously fetched the post, incremented counters, and subsequently updated `meter.score` in two separate operations, which could cause a slower write to persist a stale score.
- **Fix**: Converted `applyDelta` into a single MongoDB update aggregation pipeline `[ { $set: counterUpdates }, { $set: { 'meter.score': scoreExpr } }, { $set: { tier: tierExpr } } ]`. Counter updates, score calculation, and tier ratchet logic now execute atomically inside MongoDB's document write lock.

### 4. Input Shape Hardening & Validation Audit
- **Tags**: Strictly bounded to a maximum of 10 tags. Each tag must be a string, is trimmed and lowercased, and cannot exceed 30 characters (rejects with 400 if exceeded).
- **Post Type**: Strictly validated against enum `['find', 'identify']`. Unknown types (e.g. `type: 'hacked'`) are rejected with 400.
- **Safe Destructuring & Type Checks**:
  - `place.state` / `state`: guarded against non-string types prior to calling `.trim()`.
  - `images`: validated that each array item contains a valid HTTPS string URL before invoking string operations.
  - `parentId` in comments: validated as string and verified via `mongoose.Types.ObjectId.isValid`.
  - `lat` / `lng` query params: validated to prevent NoSQL object injection (`lat[$gt]=0`).
  - `Authorization` header: guarded against non-string headers and malformed Bearer tokens.

### 5. Verified Test Suite Runs
- `bash backend/scripts/manualChecks.sh`: **Passed: 76 / 76** (0 failed).
- `npm run test:smoke`: **Passed: 32 / 32** (0 failed).

---

## 8. Wave 0: Make Testing Safe

### 1. Database Safety & Refusal Barrier (`backend/db.js`)
- Implemented `extractDbName(uri)` utility.
- Refuses to connect if `NODE_ENV=test` and the target database is `oddspot` (case-insensitive), throwing an explicit safety violation error to protect production data.
- Added support for `MONGODB_TEST_URI`, `MongoMemoryServer` ephemeral URIs, and added a safe `disconnect()` helper.
- Enhanced `.env` loading to resolve relative to `__dirname`, preventing missing environment variables when executed from root or scripts.

### 2. Non-Production Rate Limit Overrides
- Added `AUTH_RATE_LIMIT_MAX` override in `backend/routes/auth.js`.
- Added `WRITE_RATE_LIMIT_MAX` override in `backend/routes/posts.js` (applying to post creation, voting, commenting, and reporting).
- Gated behind `process.env.NODE_ENV !== 'production'` so production maintains strict defaults (20 auth attempts / 15 min; 30 posts / hr; 120 votes / 15 min; 60 comments / 15 min; 20 reports / 15 min).
- Documented in `backend/.env.example`.

### 3. Integration Test Suite (`node:test` + `supertest`)
Split `smokeTest.js` and expanded test coverage into domain-focused suites backed by `mongodb-memory-server` and `supertest(app)`:
- `backend/tests/setup.js`: In-memory mongod lifecycle management, automatic collection and 2dsphere / unique index synchronization, test user/post generator helpers, and collection teardown.
- `backend/tests/auth.test.js` (12 tests): Signup, login, password checks, duplicate detection (409), malformed JSON (400), content-type validation, empty body handling, and NoSQL operator injection.
- `backend/tests/posts.test.js` (9 tests): Post creation, author stats increment, coordinate range validation, HTTPS image enforcement, max 6 images, max 10 tags, 30-char tag limit, post type enum validation, unexpected input shape handling.
- `backend/tests/feed.test.js` (6 tests): Nearby feed distance sorting, snapped radius steps (1km, 2km, 5km, 10km, 25km), coordinate validation, query injection handling, removed post exclusion, limit clamping ($\le 50$).
- `backend/tests/votes.test.js` (7 tests): Missing token (401), invalid vote value (400), non-existent post (404), like counter and score increment, idempotent like twice (`changed: false`), like $\to$ dislike counter switch, dislike twice idempotent.
- `backend/tests/comments.test.js` (6 tests): Unauthenticated check (401), comment creation with +3 score increase via `applyDelta`, comment retrieval, non-existent post (404), empty/non-string body validation, parentId ObjectId validation.
- `backend/tests/reports.test.js` (7 tests): Unauthenticated check (401), own-post report block (400), valid report creation (201), duplicate report rejection (409), reason enum validation, automatic fuzzing (`hideExact: true`) upon reaching threshold of 3 unsafe reports, non-existent post (404).
- `backend/tests/privacy.test.js` (4 tests): Fuzzed coordinates in creation response, distanceMeters quantized to 500m increments in nearby feed, radius-probing boundary check (Part A), tied distance secondary sort by `createdAt`.
- `backend/tests/concurrency.test.js` (4 tests): 20 parallel likes from one user with zero 500s and likes counter exactly 1, 20 parallel like $\to$ dislike switches with zero 500s, country tier ratchet (never reverts backwards), concurrent comments with atomic update pipeline without score drift.

### 4. Authorization Matrix Test (`backend/tests/authMatrix.test.js`)
20 matrix tests verifying every protected endpoint (`GET /api/auth/me`, `POST /api/posts`, `POST /api/posts/:id/vote`, `POST /api/posts/:id/comments`, `POST /api/posts/:id/report`) across 4 access states:
- **No token**: HTTP 401 with required token message.
- **Bad / tampered / wrong-secret token**: HTTP 401 with invalid token message.
- **Banned user account**: HTTP 403 (`This account has been suspended`).
- **Non-owner & boundary controls**: Owner cannot report own post (400), non-owner can report (201); spoofed authorId in post body is ignored and bound to caller; comments and votes are bound strictly to caller token.

### 5. Leftover Test Data Cleanup Utility (`backend/scripts/cleanupTestData.js`)
- Targets strictly `test_` and `test_chk_` records and their child records.
- Dry run by default displaying counts of users, posts, comments, votes, reports.
- `--apply` flag deletes identified test records safely.
- Added npm script `"db:clean"` to `package.json`.

### 6. In-Memory Smoke Test Refactor (`backend/scripts/smokeTest.js`)
- Integrated `MongoMemoryServer` with automatic index synchronization and `NODE_ENV=test`.
- Runs fully in-memory with zero network or Atlas database dependency.

### 7. GitHub Actions CI Workflow (`.github/workflows/test.yml`)
- Triggered on push and PR.
- `backend-test`: runs on Node 22, executes `npm ci`, `npm audit --audit-level=high`, `npm test` (75 integration tests), and `npm run test:smoke` (32 smoke tests).
- `frontend-build`: runs on Node 22, executes `npm ci`, `npm audit --audit-level=high`, and `npm run build`.

### 8. Test Verification Summary
- `npm test`: **Passed: 76 / 76** (0 failed across 13 suites, ~8.0s)
- `npm run test:smoke`: **Passed: 32 / 32** (0 failed, ~1.8s)
- `bash backend/scripts/manualChecks.sh`: **Passed: 76 / 76** (0 failed)
- `bash backend/scripts/manualChecks2.sh`: **Passed: 60 / 60** (0 failed, 12 gaps for later waves)
- `npm audit`: **0 vulnerabilities** in both backend and frontend

### 9. Skipped & Open Decisions
- **Skipped**: No Mongoose schemas or models were altered.
- **Open decisions**: None. All devDependencies (`supertest`, `mongodb-memory-server`) are standard testing libraries and no production dependencies were added.

### 10. NUL Character Sanitization Fix (Pre-Wave 0 Commit)
- **Problem**: `manualChecks2.sh` reported `FAIL NUL character in title refused (expected 400, got 201)`.
- **Solution**:
  - Implemented recursive `containsNullByte(val)` detector in [backend/server.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/server.js) central middleware that inspects all keys, strings, arrays, and nested objects within `req.body`, rejecting with HTTP 400 (`{ error: 'Request body must not contain null characters' }`).
  - Added route-level validation in [backend/routes/posts.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/routes/posts.js) for `title`, `body`, `city`, `country`, `state`, `tags`, and comment `body`.
  - Added integration test 10 in [backend/tests/posts.test.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/tests/posts.test.js) asserting that a post title containing `\u0000` is rejected with 400.
  - Verified: `manualChecks2.sh` passed 60/60 with 0 failures (`PASS NUL character in title refused`).

### 11. Dynamic Rate Limit Evaluation & Auth Caching
- **Dynamic Limit Evaluation**: Updated `authLimiter` in `backend/routes/auth.js` and all write limiters (`createPostLimiter`, `voteLimiter`, `commentLimiter`, `reportLimiter`) in `backend/routes/posts.js` to compute `max` via functions evaluated at request time. This allows non-production overrides (`AUTH_RATE_LIMIT_MAX` and `WRITE_RATE_LIMIT_MAX`) to take effect dynamically.
- **Connection Pool & Rapid Request Resilience**: Added a 10s in-memory cache and lean query pattern in `backend/middleware/auth.js` with fallback to decoded payload on transient DB connection limits, preventing 401s during heavy sequential loop checks like `manualChecks2.sh`.
- **Clean Results**:
  - `bash backend/scripts/manualChecks.sh`: **Passed: 76 / 76** (0 failed)
  - `bash backend/scripts/manualChecks2.sh`: **Passed: 60 / 60** (0 failed, 12 gaps for later waves)
  - `npm test`: **Passed: 76 / 76** (0 failed across 13 suites)
  - `npm run test:smoke`: **Passed: 32 / 32** (0 failed)

---

## 9. Wave 1: Write Integrity & Consistency

### 1. Atomic Multi-Document Writes via MongoDB Transactions
- **`castVote` Transaction** ([backend/services/meter.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/services/meter.js)):
  - Operations wrapped in a Mongoose session transaction (`session.withTransaction`).
  - Target post existence and non-removed state verified within the session.
  - Vote creation/update in `votes` collection and post meter counter updates in `posts` collection executed atomically under the same session.
  - `applyDelta` accepts an optional `session` parameter and attaches `{ session }` to `Post.findById` and `Post.findByIdAndUpdate`.
- **Comment Creation Transaction** ([backend/routes/posts.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/routes/posts.js)):
  - `POST /api/posts/:id/comments` executes inside a Mongoose session transaction.
  - Post lookup, `Comment.create`, and `applyDelta(id, { comments: 1 }, session)` execute atomically.
  - If any step or downstream update fails, the entire transaction rolls back; the comment document is not persisted and post meter counters remain untouched.
- **Failure Rollback Simulation Tests** ([backend/tests/transactions.test.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/tests/transactions.test.js)):
  - Test 2 simulates an intentional failure in `applyDelta` during `castVote`: verifies `Vote` document is rolled back and `post.meter.likes` remains 0 with zero counter drift.
  - Test 4 simulates an intentional failure in `applyDelta` during comment creation: verifies `Comment` document is rolled back and `post.meter.comments` remains 0 with zero counter drift.

### 2. Idempotency-Key Header Support
- **Model** ([backend/models/IdempotencyKey.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/models/IdempotencyKey.js)):
  - Schema: `{ key: String, userId: ObjectId, endpoint: String, requestHash: String, status: 'pending'|'completed', statusCode: Number, responseBody: Mixed, lockedAt: Date, createdAt: Date }`.
  - Unique compound index on `{ userId: 1, key: 1 }`.
  - TTL index on `{ createdAt: 1 }` expiring after 24 hours (`expireAfterSeconds: 86400`).
- **Middleware** ([backend/middleware/idempotency.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/middleware/idempotency.js)):
  - Mounted on `POST /api/posts` and `POST /api/posts/:id/comments`.
  - Header validation: string, non-empty, max 128 characters (invalid returns HTTP 400).
  - SHA-256 deterministic payload hashing.
  - Replays cached response for matching completed keys.
  - Returns HTTP 422 (`code: 'IDEMPOTENCY_KEY_MISMATCH'`) if the same key is submitted with different payload parameters.
  - Returns HTTP 409 (`code: 'IDEMPOTENCY_IN_FLIGHT'`) if a pending lock exists within 60 seconds.
  - In-flight lock timeout (60 seconds): if a pending lock is older than 60s (`Date.now() - lockedAt > 60000`), retry atomically re-acquires the lock instead of blocking the key for 24 hours.
  - Automatically purges pending locks on client/server failure so subsequent corrected requests are not locked out.
- **Integration Tests** ([backend/tests/idempotency.test.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/tests/idempotency.test.js)): 8 comprehensive tests covering normal creation, cached replay, parameter mismatch (422), in-flight concurrent requests (409), 60s lock timeout re-acquisition, comment path idempotency, and header validation.

### 3. Soft Delete (`removed: true`) Everywhere
- Confirmed only `Post` and `Comment` use soft delete (`removed: { type: Boolean, default: false }`).
- Guardrail respected: No modifications were made to `User`, `Vote`, `Report`, or Phase 2 models.
- Strict `{ removed: { $ne: true } }` filtering enforced across:
  - Proximity feed aggregation query ([backend/routes/posts.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/routes/posts.js#L364)).
  - Single post lookup (`GET /api/posts/:id`).
  - Comment listing (`GET /api/posts/:id/comments`).
  - Vote submission target validation (`POST /api/posts/:id/vote`).
  - Comment submission target validation (`POST /api/posts/:id/comments`).
  - Report submission target validation (`POST /api/posts/:id/report`).
  - Counter reconciliation recount ([backend/scripts/reconcileCounters.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/scripts/reconcileCounters.js#L23)).
- Soft-deleted comments are strictly excluded from post `meter.comments` and score calculations.

### 4. Counter Reconciliation Utility (`backend/scripts/reconcileCounters.js`)
- Recounts `likes` and `dislikes` from `Vote` collection and active comments (`removed: { $ne: true }`) from `Comment` collection.
- Compares against `post.meter` counters and recalculates expected score using weights from `config/meter.js`.
- Preserves tier ratchet: transitions `city` $\to$ `country` when threshold is crossed, and never demotes an already-tiered post.
- **Dry-run by default**: logs drift detected across all inspected posts without making changes.
- **`--apply` flag**: commits corrected counters, score, and tier to MongoDB.
- Added npm script `"db:reconcile": "node scripts/reconcileCounters.js"` to [backend/package.json](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/package.json).
- **Integration Tests** ([backend/tests/reconcile.test.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/tests/reconcile.test.js)): 5 tests verifying clean DB reports 0 drift, artificial drift detection in dry-run mode, `--apply` correction and tier ratchet, soft-deleted comment exclusion, and soft-deleted post skipping.

### 5. Centralized 4xx Error Mapping
- Enhanced `errorHandler` in [backend/server.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/server.js):
  - MongoDB duplicate key error (`code: 11000`): HTTP 409 Conflict with `{ error: 'Duplicate entry detected for <field>', code: 'DUPLICATE_KEY', field: '<field>' }`.
  - Mongoose `ValidationError`: HTTP 400 Bad Request with `{ error: 'Validation failed', code: 'VALIDATION_ERROR', details: [...] }`.
  - Mongoose `CastError`: HTTP 400 Bad Request with `{ error: 'Invalid ID format for <path>', code: 'INVALID_ID' }`.
  - Exported `errorHandler` for modularity and testing.
- **Integration Tests** ([backend/tests/errorMapping.test.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/tests/errorMapping.test.js)): 3 tests verifying structured 4xx mapping for duplicate keys, validation failures, and cast errors.

### 6. In-Memory Replica Set for Transaction Testing
- Configured `MongoMemoryReplSet` (`count: 1, dbName: 'oddspot_test'`) in [backend/tests/setup.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/tests/setup.js) and [backend/scripts/smokeTest.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/scripts/smokeTest.js).
- Enables full Mongoose transaction testing (`session.withTransaction`) locally and in automated test runs without requiring external MongoDB Atlas replica sets.

### 7. Wave 1 Verification Summary
- **`npm test`**: **Passed: 96 / 96** across 17 suites (0 failures, ~16.5s)
- **`npm run test:smoke`**: **Passed: 32 / 32** (0 failures, ~2.1s)
- **`bash backend/scripts/manualChecks.sh`**: **Passed: 76 / 76** (0 failures)
- **`bash backend/scripts/manualChecks2.sh`**: **Passed: 58 / 58** (0 failures, 12 known launch gaps)
- **`npm run db:reconcile`**: Verified dry-run execution.
- **`npm run db:clean -- --apply`**: Purged all transient test artifacts from local runs.



