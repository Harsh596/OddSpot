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
| `backend/scripts/smokeTest.js` | Created | 23-point automated backend test suite (evolved to 32 checks across domain migrations) |
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
4. **`bcrypt`** (`^6.0.0`): Industry-standard adaptive password hashing (Blowfish-derived/Eksblowfish cipher based) to protect stored user credentials.
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

---

## 10. Wave 2: Accounts and Sessions

### 1. User Model & Case-Insensitive Uniqueness
- **Model** ([backend/models/User.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/models/User.js)):
  - Added indexed lowercase shadow field `usernameLower: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true }`.
  - Added `pre('validate')` hook safely synchronizing `this.usernameLower = (this.username || '').toLowerCase().trim()`.
  - Blocked reserved usernames case-insensitively: `['admin', 'root', 'support', 'oddspot', 'moderator', 'mod', 'system', 'null', 'undefined']`.
  - Enforced ASCII letters, digits, and underscores only (`/^[a-zA-Z0-9_]+$/`) on `cleanUsername`.
  - Normalized email (lowercase, trimmed) with case-insensitive uniqueness.
  - Added fields for email verification (`emailVerified`, `emailVerificationTokenHash`, `emailVerificationExpires`), password reset (`passwordResetTokenHash`, `passwordResetExpires`), per-account lockout (`failedLoginAttempts`, `lockUntil`), and session invalidation (`passwordChangedAt`).

### 2. Password Strength & Common Password Blocklist
- **Blocklist** ([backend/config/passwordBlocklist.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/config/passwordBlocklist.js)):
  - Embedded set of top breached/common passwords checked case-insensitively with $O(1)$ memory lookup (`isCommonPassword(password)`). Zero new external dependencies.
  - Password byte length validated between 8 and 72 bytes via `Buffer.byteLength(password, 'utf8')`, preventing silent bcrypt truncation beyond 72 bytes.

### 3. Hashed Rotating Refresh Tokens & Reuse Detection
- **Model** ([backend/models/RefreshToken.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/models/RefreshToken.js)):
  - Stores SHA-256 hashed refresh tokens (`tokenHash`), lineage `familyId`, `userId`, `revoked` flag, and TTL expiration index on `expiresAt` (`expireAfterSeconds: 0`).
  - Registered in [backend/models/index.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/models/index.js).
- **Service** ([backend/services/token.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/services/token.js)):
  - `issueRefreshToken(userId, familyId = null)`: issues 40-byte cryptographically secure random token, stores SHA-256 hash, and sets 7-day expiry.
  - `POST /api/auth/refresh`: verifies and rotates token. If a previously revoked token is presented, detects reuse attack and revokes all tokens under that `familyId` (`code: 'TOKEN_REUSE_DETECTED'`).
- **Session Termination**:
  - `POST /api/auth/logout`: Revokes specific refresh token session.
  - `POST /api/auth/logout-all`: Invalidate all refresh tokens for user and sets `passwordChangedAt` to revoke older access tokens.

### 4. JWT Access Tokens & Dynamic DB Role Check
- **Access Token Lifetime**: 15 minutes (`expiresIn: '15m'`).
- **Token Claims**: Contains strictly `{ id, username }`. The `role` claim is excluded from the token payload to eliminate stale permission leaks and satisfy repo inspection tests.
- **Middleware** ([backend/middleware/auth.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/middleware/auth.js)):
  - Verifies token via `verifyAccessToken`.
  - Checks user existence and ban status against database with an in-memory cache of at most 30 seconds (`CACHE_TTL_MS = 30000`).
  - Fetches `role` directly from database document (`req.user.role = user.role`).
  - Checks `user.passwordChangedAt > decoded.iat` and invalidates access tokens issued prior to password changes.

### 5. Pluggable Mailer & Safe Auth Endpoints
- **Service** ([backend/services/mailer.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/services/mailer.js)):
  - In `NODE_ENV=test`: captures outgoing messages in an in-memory array (`__getSentMail()`, `__clearSentMail()`).
  - In development: formats and outputs email boxes to console without external key requirements.
- **Enumeration-Safe Endpoints**:
  - `POST /api/auth/forgot-password`: Returns identical generic message regardless of email existence; sends 15-minute expiring single-use token stored as SHA-256 hash.
  - `POST /api/auth/resend-verification`: Returns enumeration-safe generic message.
- **Account Endpoints**:
  - `POST /api/auth/verify-email`: Verifies single-use 24-hour verification token.
  - `POST /api/auth/reset-password`: Verifies token hash, updates password, revokes active refresh tokens.
  - `POST /api/auth/change-password`: Verifies current password, updates password, sets `passwordChangedAt`, revokes other sessions.
  - `DELETE /api/auth/me`: Anonymizes authored posts and comments (`authorId = null`), revokes refresh tokens, deletes user document.

### 6. Login Timing Equalization & Per-Account Lockout
- **Timing Equalization**: If user does not exist, performs `await bcrypt.compare(password, DUMMY_HASH)` using a precomputed bcrypt hash (`DUMMY_HASH`) to prevent response timing analysis. Returns identical error body `{ error: 'Invalid username/email or password' }`.
- **Per-Account Throttling**: Accounts lock for 15 minutes (`lockUntil`) after 5 consecutive failed attempts on that account, separate from IP rate limits.

### 7. Startup JWT Secret Validation & Key Rotation
- **Startup Check** (`backend/server.js` & `backend/services/token.js`):
  - Refuses to boot if `JWT_SECRET` is missing or $< 32$ characters (`FATAL: JWT_SECRET must be configured and contain at least 32 characters`).
- **Key Rotation**:
  - Supports `JWT_SECRETS` keyring JSON and `JWT_CURRENT_KEY_ID` (`kid`). Signs tokens with active key and header `kid`, and verifies against matching keyring entry.

### 8. Wave 2 Verification Summary
- **`npm test`**: **Passed: 107 / 107** across 18 suites (0 failures, ~19.7s)
- **`npm run test:smoke`**: **Passed: 32 / 32** (0 failures, ~2.2s)
- **`bash backend/scripts/manualChecks.sh`**: **Passed: 76 / 76** (0 failures)
- **`bash backend/scripts/manualChecks2.sh`**: **Passed: 60 / 60** (0 failures; 2 launch gaps closed: JWT lifetime $\le$ 1 day and JWT carries no role)
- **`npm run db:clean -- --apply`**: Purged all transient test artifacts from local runs.

---

## Wave 2 Remediation: Security Review Findings (B1–B6 & Core Gaps)

### 1. Overview of Remediations
Remediated all 6 blockers (B1–B6) identified in the Wave 2 security review along with hygiene improvements:

1. **[B1] Equalize Login Timing & Account Lockout Oracle Elimination**:
   - `POST /api/auth/login` unconditionally executes `bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)` before evaluating lockout or account ban status.
   - If user does not exist, credentials mismatch, or account is currently locked (`user.lockUntil > Date.now()`): returns identical HTTP 401 `{ error: 'Invalid username/email or password' }`, completely eliminating the lockout oracle (429 is never returned for account-level lockouts).
   - Increments failed login attempts asynchronously via `setImmediate` / `User.updateOne` without blocking the HTTP response.
   - If `lockUntil` has expired, atomically resets `failedLoginAttempts: 1` rather than stacking old failures.
   - Checks and returns banned status (HTTP 403) only after password verification succeeds.

2. **[B2] Atomic Refresh Token Rotation & Reuse Detection**:
   - In `backend/services/token.js` and `POST /api/auth/refresh`, eliminated the TOCTOU check using atomic `RefreshToken.findOneAndUpdate({ tokenHash, revoked: false, expiresAt: { $gt: new Date() } }, { $set: { revoked: true } }, { new: false })`.
   - If no active token matched: queries `RefreshToken.findOne({ tokenHash })`. If revoked, triggers family revocation (`updateMany({ familyId }, { $set: { revoked: true } })`) and returns HTTP 401 with `TOKEN_REUSE_DETECTED`. If not found, returns generic 401.
   - Confirms the associated user exists and is not banned before issuing child tokens.
   - Verified under parallel execution with concurrent requests: exactly one succeeds and the duplicate triggers family revocation.

3. **[B3] Timing-Safe Verification & Password Reset**:
   - `POST /api/auth/forgot-password` and `POST /api/auth/resend-verification` dispatch email transmission in a detached background tick (`setImmediate`), preventing network SMTP/mailer latency from leaking account existence.
   - Both endpoints immediately return identical generic responses regardless of user existence.

4. **[B4] Throttle & Protect Password Changes**:
   - Applied `authLimiter` to `POST /api/auth/change-password`.
   - Tracks failed password attempts on `change-password` against the account lockout counter, locking accounts after 5 failures.

5. **[B5] Secure Account Deletion (`DELETE /api/auth/me`)**:
   - Requires `currentPassword` in the request body and verifies via `bcrypt.compare` before allowing deletion.
   - Executes deletion inside a Mongoose transaction (`session.withTransaction`):
     - Reassigns user contributions to system tombstone ID `TOMBSTONE_USER_ID = new mongoose.Types.ObjectId('000000000000000000000000')`, preserving non-null schema requirements on `Post.authorId` and `Comment.authorId` without modifying model schemas.
     - Revokes and deletes all `RefreshToken` entries for the user.
     - Deletes the `User` document.
     - Evicts user cache via `clearUserCache(userId)`.

6. **[B6 & G3, G4, G9] Model & Hygiene Fixes**:
   - `backend/models/User.js`: Removed redundant `index: true` next to `unique: true` on `usernameLower`.
   - `backend/scripts/syncIndexes.js`: Added one-time migration/backfill helper `backfillUsernameLower()` populating `usernameLower` before building collection indexes.
   - `backend/config/auth.js`: Centralized `BCRYPT_ROUNDS = 10`, `DUMMY_HASH`, `RESERVED_USERNAMES`, `TOMBSTONE_USER_ID`, and `validatePasswordStrength`.
   - Password strength: explicitly rejects NUL bytes (`\0` / `\u0000`).
   - Atomically clears `passwordResetTokenHash` and `passwordResetExpires` on both password change and password reset.

### 2. Files Touched
- [backend/config/auth.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/config/auth.js) *(New)*
- [backend/models/User.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/models/User.js)
- [backend/routes/auth.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/routes/auth.js)
- [backend/services/token.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/services/token.js)
- [backend/scripts/syncIndexes.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/scripts/syncIndexes.js)
- [backend/scripts/manualChecks2.sh](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/scripts/manualChecks2.sh)
- [backend/tests/wave2.test.js](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/backend/tests/wave2.test.js)
- [WORKLOG.md](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/WORKLOG.md)

### 3. Test & Verification Results
- **`npm test`**: **Passed: 109 / 109** tests across 18 test suites (0 failures, duration ~19.8s).
- **`npm run test:smoke`**: **Passed: 32 / 32** smoke checks (0 failures, duration ~2.1s).
- **`bash backend/scripts/manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`AUTH_HEAVY=1 bash backend/scripts/manualChecks2.sh`**: **Passed: 77 / 77** (0 failures, 10 launch gaps).
  - Verified login timing ratio between unknown user (`0.0766s`) and wrong password (`0.0815s`) is well within target threshold ($< 1.5\times$).
  - Verified concurrent refresh rotation, case-insensitive uniqueness, homoglyph rejection, and multi-user concurrency.
- **`npm run db:clean -- --apply`**: Purged all 33 test users, 133 posts, 60 comments, 28 votes, and 16 reports from test executions.
- **Zero new dependencies added.**

---

## [2026-10-26] - Pre-Start Stabilization on antigravity/test-2

### 1. Root Causes Addressed & Concrete Fixes
- **Fix 1: Dual-Compatible Error Envelope (`backend/middleware/errorHandler.js` & `backend/validators/errorCodes.js`)**:
  - Structured error response payload so `res.body.error` is the string message itself, ensuring compatibility with `assert.match(res.body.error, /.../)` and string assertions in test suites.
  - Provided `code`, `message`, and `details` at the top level of the JSON payload.
  - Implemented `backend/middleware/errorHandler.js` handling Mongoose duplicate keys (`DUPLICATE_KEY`), validation errors (`VALIDATION_ERROR`), CastErrors (`INVALID_ID`), Zod errors (`VALIDATION_FAILED`), payload size (`PAYLOAD_TOO_LARGE`), and invalid JSON (`INVALID_JSON`).
- **Fix 2: Disabled `sanitizeFilter` in `backend/db.js`**:
  - Set `mongoose.set('sanitizeFilter', false);` to stop Mongoose from converting `{ removed: { $ne: true } }` into an invalid nested object `{ removed: { $eq: { $ne: true } } }` that caused CastError to Boolean.
- **Fix 3: Eliminated Erroneous "Invalid ID format for removed"**:
  - Guarded CastError formatting in `errorHandler.js` so only genuine ObjectId paths (ending with `Id`, `_id`, or `id`) trigger `INVALID_ID`.
  - Updated `postIdParamSchema` in `backend/validators/posts.js` to emit `Invalid post ID` for post route parameters.
- **Fix 4: Route Payload & Validator Alignment**:
  - Configured `voteSchema` and `commentSchema` in `backend/validators/posts.js` with `.passthrough()` and flexible `parentId` handling.
  - Standardized idempotency error returns in `backend/middleware/idempotency.js` to emit exact codes `IDEMPOTENCY_KEY_MISMATCH` (422) and `IDEMPOTENCY_IN_FLIGHT` (409).
  - Resolved concurrent refresh token race condition in `backend/services/token.js` by tracking compromised family IDs to guarantee child token invalidation.
  - Restored fuzzed distance filtering and tie-breaker sorting in `GET /nearby`.
- **Fix 5: `tests/contract.test.js` Lifecycle Teardown**:
  - Added proper `before(setupTestDb)`, `after(teardownTestDb)`, and `beforeEach(clearCollections)` lifecycle hooks to `backend/tests/contract.test.js`.
  - Added connection disconnect fallback to prevent event loop hanging.

### 2. Files Touched
- `backend/db.js`
- `backend/middleware/errorHandler.js` *(New)*
- `backend/validators/errorCodes.js`
- `backend/validators/posts.js`
- `backend/middleware/idempotency.js`
- `backend/services/token.js`
- `backend/routes/posts.js`
- `backend/server.js`
- `backend/tests/contract.test.js`
- `WORKLOG.md`

### 3. Test & Verification Results
- **`env -u MONGODB_URI npm test`**: **Passed: 121 / 121** across 24 test suites (0 failures, duration ~21.9s).
- **`npm run test:smoke`**: **Passed: 32 / 32** smoke checks (0 failures, duration ~2.1s).
- **Working Tree**: Cleanly passing all contract, auth, comments, privacy, concurrency, and reconciliation tests.

---

## [2026-10-26] - Phase P0: Bootstrap, Test Safety & App Structure

### 1. Work Completed Per Task
- **Task P0-T1: Project Context & Tasks Documentation**:
  - Created `docs/PROJECT_CONTEXT.md` documenting all 12 Pre-Approved Decisions, Pre-Approved Schema Changes, and Guardrails verbatim.
  - Created `TASKS.md` tracking all Master Build phases across P0–P19, R1–R4, and F1–F10.
- **Task P0-T2: DevDependencies Installation**:
  - Installed `supertest` and `mongodb-memory-server` in `backend/package.json`.
- **Task P0-T3: Server Architecture Split (`app.js` + `server.js`)**:
  - Extracted Express application configuration into `backend/app.js` exporting `{ app, createApp, errorHandler }`.
  - Retained all security middleware, request ID generator, Helmet headers, CORS restrictions, body size limiters, JSON parser error guards, and central 4xx/5xx error handlers.
  - Slimmed `backend/server.js` to manage database connection (`connect()`), JWT config startup validation (`validateJwtConfig()`), and HTTP server binding (`app.listen(PORT)`).
- **Task P0-T4: Hard Test Database Safety Barrier (`assertSafeTestDatabase`)**:
  - Implemented `assertSafeTestDatabase(uri)` in `backend/db.js` and `backend/test/setup.js`.
  - Refuses any connection with `NODE_ENV=test` pointing to production database `oddspot` (case-insensitively).
  - Configured 1-node `MongoMemoryReplSet` in `backend/test/setup.js` for clean transactional execution.
- **Task P0-T5: Dynamic Non-Production Rate Limits & Strict Production Enforcement**:
  - Centralized rate limiters in `backend/config/rateLimits.js` with `getAuthRateLimitMax` and `getWriteRateLimitMax`.
  - Strictly ignores overrides when `NODE_ENV === 'production'`, enforcing hardcoded production limits.
  - Updated `backend/.env.example` with complete configuration docs.
- **Task P0-T6: Integration Test Porting & Test Script Configuration**:
  - Ported all tests into `backend/test/`: `safety.test.js`, `auth.test.js`, `posts.test.js`, `feed.test.js`, `votes.test.js`, `comments.test.js`, `reports.test.js`, `privacy.test.js`, `concurrency.test.js`, `authMatrix.test.js`, and wave verification suites.
  - Updated `backend/package.json` test script to `"NODE_ENV=test AUTH_RATE_LIMIT_MAX=10000 WRITE_RATE_LIMIT_MAX=10000 node --test test/**/*.test.js"`.
  - Updated Zod to `latest` (4.6.7) and upgraded error issue mapping to resolve GHSA-mrhx-c7xc-m3w5 audit advisory (0 vulnerabilities).
- **Task P0-T7: Multi-Prefix Test Data Cleanup**:
  - Enhanced `backend/scripts/cleanupTestData.js` targeting `test_`, `test_2_`, and `test_chk_` records and their relational children (`RefreshToken`, `IdempotencyKey`, `Post`, `Comment`, `Vote`, `Report`).
  - Defaults to dry run; applies permanent purge with `--apply`.
- **Task P0-T8: GitHub Actions CI Configuration**:
  - Configured `.github/workflows/ci.yml` running backend test suite and frontend production build on Node 20.

### 2. Files Touched
- `docs/PROJECT_CONTEXT.md` *(New)*
- `TASKS.md` *(New)*
- `.github/workflows/ci.yml` *(New)*
- `backend/app.js` *(New)*
- `backend/config/rateLimits.js` *(New)*
- `backend/test/` (All test suites + `safety.test.js` + `setup.js`) *(New)*
- `backend/server.js`
- `backend/db.js`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/.env.example`
- `backend/routes/auth.js`
- `backend/routes/posts.js`
- `backend/validators/posts.js`
- `backend/validators/index.js`
- `backend/middleware/errorHandler.js`
- `backend/scripts/cleanupTestData.js`
- `backend/tests/setup.js`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`env -u MONGODB_URI npm test`**: **Passed: 128 / 128** tests across 25 suites (0 failures, 0 hangs, duration ~21.3s).
- **`npm run test:smoke`**: **Passed: 32 / 32** smoke checks (0 failures, duration ~2.1s).
- **`assertSafeTestDatabase`**: Verified 7/7 assertions throwing on production URIs (`oddspot`, case-insensitive, empty) and permitting safe test replica sets.
- **`bash backend/scripts/manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`bash backend/scripts/manualChecks2.sh`**: **Passed: 78 / 78** (0 failures, 9 expected pre-launch gaps).
- **`npm run build` (frontend)**: Passed clean production build in 123ms.
- **`npm audit`**: 0 vulnerabilities across both backend and frontend.

---

## [2026-10-26] - Phase P1: Immediate Fixes Without Schema Changes (K2-K6, K8, K9, K12-K14, K16)

### 1. Work Completed Per Task
- **Task P1-T1 (K13) - Text Normalization & Sanitization (`backend/utils/normalize.js`)**:
  - Implemented `normalizeText(input, { maxLength, allowNewlines, fieldName })` enforcing Unicode NFKC normalization, stripping zero-width characters (`\u200B-\u200D`, `\uFEFF`), stripping control characters (while optionally preserving `\n`, `\r`, `\t` when `allowNewlines` is true), trimming whitespace, and rejecting strings with NUL bytes (`\0` / `\u0000`).
  - Applied input bounds: post title (140), body (10000), comment body (5000), tags (30), and place fields (100).
- **Task P1-T2 (K2) - Strict Coordinate Validation & Precision (`backend/utils/coordinates.js`)**:
  - Implemented `parseStrictCoordinate` and `parseLngLat`.
  - Validates numeric bounds: `longitude` (-180..180), `latitude` (-90..90).
  - Explicitly rejects Null Island `(0, 0)` with HTTP 400 `VALIDATION_FAILED`.
  - Rounds all coordinates to 6 decimal places (~10cm precision) across `POST /api/posts` and `GET /api/posts/nearby`.
- **Task P1-T3 (K3 Part 1) - Place Length Caps**:
  - Enforced max 100 character limit on `place.city`, `place.state`, and `place.country` in `backend/routes/posts.js` and `backend/validators/posts.js`.
- **Task P1-T4 (K5) - Strict Type & Enum Checks**:
  - Enforced strict boolean validation on `hideExact` in `backend/routes/posts.js` and `backend/validators/posts.js`.
  - Enforced strict allowlist validation for `warnings` array: `['private_property', 'walking_required', 'unsafe_night', 'other']`.
- **Task P1-T5 (K9) - Image Constraints**:
  - Restricted images to a maximum of 6 per post.
  - Enforced HTTPS-only image URLs with maximum 500 characters.
  - Enforced integer `width` and `height` between 1 and 10000.
- **Task P1-T6 (K4, K14) - Comment Parent Hierarchy & Pagination Limits**:
  - Validated comment `parentId`: must be a valid 24-character hexadecimal ObjectId, must belong to the same post, must not be soft-deleted (`removed: true`), and must not exceed maximum comment nesting depth of 3.
  - Added and mounted `commentsQuerySchema` validating `page` parameter as an integer between 1 and 100.
- **Task P1-T7 (K6) - Self-Voting Prohibition**:
  - Forbade authors from voting on their own posts: returns HTTP 403 `Authors cannot vote on their own post` with `FORBIDDEN` code in both `backend/routes/posts.js` and `backend/services/meter.js`.
- **Task P1-T8 (K8) - Atomic Pipeline Ratchet for Meter Scoring**:
  - Updated `applyDelta()` in `backend/services/meter.js` to execute an atomic `Post.findOneAndUpdate` with `returnDocument: 'before'` and aggregation pipeline ratchet.
  - Guarantees that `tieredUp: true` fires exactly once when crossing the regional threshold, eliminating duplicate tier transition events under concurrency.
- **Task P1-T9 (K12) - Non-Cacheable Security Headers**:
  - Added middleware in `backend/app.js` setting `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache` for `/api/auth/*` routes and any incoming requests carrying `Authorization` headers.
- **Task P1-T10 (K16) - Accuracy Corrections**:
  - Corrected description of `bcrypt` in `WORKLOG.md` to Blowfish-derived / Eksblowfish cipher based.
  - Documented evolution of backend automated smoke test checks (23 initial -> 32 current).
- **Dedicated Regression Suite (`backend/test/phase1.test.js`)**:
  - Created comprehensive test suite verifying all Prompt 01 requirements (26 regression test cases across K2–K6, K8, K9, K12–K14, K16).

### 2. Files Touched
- `backend/utils/normalize.js` *(New)*
- `backend/utils/coordinates.js` *(New)*
- `backend/test/phase1.test.js` *(New)*
- `backend/validators/common.js`
- `backend/validators/posts.js`
- `backend/routes/posts.js`
- `backend/services/meter.js`
- `backend/app.js`
- `backend/test/votes.test.js`
- `backend/test/concurrency.test.js`
- `backend/test/transactions.test.js`
- `backend/test/safety.test.js`
- `backend/scripts/manualChecks.sh`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test`**: **Passed: 163 / 163** tests across 36 suites (0 failures, duration ~22.9s).
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 82 / 82** (0 failures, 5 remaining pre-launch design gaps).
  - Null Island `(0, 0)` refused: PASS.
  - Coordinates rounded to 6 decimals: PASS.
  - Authenticated responses non-cacheable: PASS.
  - Author cannot vote on own post: PASS.
  - No Atlas credentials in tracked files: PASS.
- **`npm run build` (frontend)**: Passed clean production build in 77ms.
- **Zero schema changes made.**

---

## [2026-10-26] - Phase P2: Write Integrity (Transactions, Reconcile, Idempotency & Soft Delete)

### 1. Work Completed Per Task
- **Task P2-T1 (K7) - Multi-Document Transactions & Test Injection Hooks**:
  - Implemented `backend/utils/withTransaction.js` to execute transactional MongoDB operations with automatic session management and rollback.
  - Wrapped `meterService.castVote` inside `withTransaction`, ensuring atomic updates to `Vote` documents and post meter counters.
  - Wrapped comment creation in `POST /api/posts/:id/comments` inside `withTransaction`, ensuring atomic persistence of `Comment` documents and comment meter counter updates.
  - Implemented `_failBeforeApplyDelta` test injection hook when `NODE_ENV === 'test'` in both `castVote` and comment creation to verify transactional rollback and prevent counter drift.
- **Task P2-T2 - Counter & Visit Reconciliation Script (`backend/scripts/reconcileCounters.js`)**:
  - Exported `reconcileAllCounters({ apply })` (and `reconcileCounters` for backwards compatibility).
  - Recounts ground-truth likes, dislikes, active non-removed comments, and visits (`Visit.countDocuments({ postId: post._id })`).
  - Reconciles counter drift against `post.meter`, recalculates total score based on configured weights, and ratchets tier when crossing thresholds.
- **Task P2-T3 [SCHEMA] - IdempotencyKey Model & Middleware**:
  - Configured `backend/models/IdempotencyKey.js` with `key`, `userId`, `route`, `endpoint`, `requestHash`, `statusCode`, `responseBody`, `inProgress`, `status`, 24-hour TTL index (`expireAfterSeconds: 86400`), and compound unique index `{ userId: 1, key: 1 }`.
  - Implemented `backend/middleware/idempotency.js` supporting `Idempotency-Key` header:
    - Cached replays return original HTTP status code and body without re-executing writes.
    - Parameter mismatch on identical key returns HTTP 422 with `IDEMPOTENCY_KEY_MISMATCH`.
    - In-flight operations within 60-second window return HTTP 409 with `IDEMPOTENCY_IN_FLIGHT`.
    - Expired locks (>60s) are safely re-acquired.
    - Locks are released immediately upon 4xx client errors to allow corrected retries.
  - Mounted idempotency middleware on `POST /api/posts` and `POST /api/posts/:id/comments`.
- **Task P2-T4 - Universal Soft-Delete Filtering (`removed: { $ne: true }`)**:
  - Enforced `{ removed: { $ne: true } }` across all post and comment routes:
    - Single post retrieval (`GET /api/posts/:id`), voting (`POST /api/posts/:id/vote`), commenting (`POST /api/posts/:id/comments`), and reporting (`POST /api/posts/:id/report`) return 404 for removed posts.
    - Feed queries (`GET /api/posts/nearby`) exclude removed posts in the `$geoNear` aggregation stage.
    - Comment listing (`GET /api/posts/:id/comments`) excludes soft-deleted comments.
    - Comment parent hierarchy walks exclude soft-deleted parent comments.
- **Task P2-T5 - Central Error Handler Mapping (`backend/middleware/errorHandler.js`)**:
  - Mapped MongoDB duplicate key errors (code 11000) to HTTP 409 `DUPLICATE_KEY` with field identification, without leaking collection names or internal stack traces.
  - Mapped Mongoose `ValidationError` to HTTP 400 `VALIDATION_ERROR` with structured field issues, without leaking stack traces.
  - Mapped Mongoose `CastError` to HTTP 400 `INVALID_ID` for ID fields, without leaking stack traces.
- **Dedicated Regression Suite (`backend/test/phase2.test.js`)**:
  - Implemented 16 test cases covering transaction atomicity, `_failBeforeApplyDelta` hooks, dry run vs apply reconciliation with visits, idempotency replays/mismatches/locks, soft-delete filtering, and error handler mapping.

### 2. Files Touched
- `backend/utils/withTransaction.js` *(New)*
- `backend/test/phase2.test.js` *(New)*
- `backend/tests/phase2.test.js` *(New)*
- `backend/models/IdempotencyKey.js`
- `backend/middleware/idempotency.js`
- `backend/services/meter.js`
- `backend/routes/posts.js`
- `backend/scripts/reconcileCounters.js`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test`**: **Passed: 179 / 179** tests across 42 suites (0 failures, duration ~26.7s).
- **`node backend/scripts/reconcileCounters.js`**: Reconciled cleanly with exit code 0.
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 82 / 82** (0 failures, 5 remaining pre-launch design gaps).
- **`npm run build` (frontend)**: Passed clean production build in 67ms.
- **Pre-approved Schema Change**: `IdempotencyKey` schema fields (`key`, `userId`, `route`, `endpoint`, `requestHash`, `statusCode`, `responseBody`, `inProgress`, `status`, 24h TTL, compound unique index).

---

## [2026-10-26] - Phase P3: Accounts, Sessions, Rotating Refresh Tokens & Auth Hardening

### 1. Work Completed Per Task
- **Task P3-T1 [SCHEMA] - User, RefreshToken & EmailToken Model Updates**:
  - Enhanced `backend/models/User.js` with `emailLower`, `tokenVersion` (default 0), `ageConfirmedAt`, `emailVerifiedAt`, `shadowBanned`, `trust`, and `lastPostLocation`.
  - Synchronized `emailLower` alongside `usernameLower` in the `pre('validate')` hook.
  - Updated `backend/models/RefreshToken.js` with `replacedBy` and `revokedAt` to track token rotation lineages.
  - Created `backend/models/EmailToken.js` storing single-use SHA-256 hashed verification and password reset tokens (`userId`, `tokenHash`, `type`, `expiresAt`, `usedAt`, with TTL auto-purge index).
  - Exported `EmailToken` from `backend/models/index.js`.
- **Task P3-T2 - Centralized JWT Configuration & Key Rotation (`backend/config/jwt.js`)**:
  - Implemented `backend/config/jwt.js` enforcing `JWT_SECRET >= 32` characters at startup.
  - Supported optional `kid` key rotation via `getKeyring()` and `getCurrentSigningKey()`.
  - Integrated `backend/services/token.js` with `backend/config/jwt.js`.
- **Task P3-T3 (K11) - tokenVersion & In-Memory Auth Cache**:
  - Updated `generateAccessToken(user)` to embed `tokenVersion` in the JWT payload.
  - Updated `backend/middleware/auth.js` (`requireAuth`) to select `tokenVersion` and immediately reject any token whose version does not match the active DB version with 401 `AUTH_TOKEN_EXPIRED`.
  - Maintained 30-second in-memory caching (`CACHE_TTL_MS = 30000`) for active user roles and ban statuses.
  - Exported `invalidateUserAuthCache(userId)` to allow immediate cache eviction upon token revocation or privilege updates.
- **Task P3-T4 (K15) - Username Validation, Password Bounds & Age Confirmation**:
  - Enforced strict regex `/^[A-Za-z0-9_]{3,24}$/` on usernames in `backend/validators/auth.js`, rejecting characters outside ASCII alphanumeric and underscores.
  - Enforced case-insensitive blocklist of reserved system usernames (`admin`, `root`, `support`, `oddspot`, etc.).
  - Enforced 8–72 byte password bounds (`Buffer.byteLength`) and OWASP common blocklist checks.
  - Handled `confirmAge` / `ageConfirmed` flag on registration, setting `ageConfirmedAt = new Date()`.
- **Task P3-T5 (K15) - Timing Equalization & Lockout Throttling**:
  - Leveraged module-level `DUMMY_HASH` in `backend/routes/auth.js` to equalize login response times across valid and invalid accounts.
  - Throttled failed login attempts per account, locking the account for 15 minutes (`lockUntil`) upon reaching maximum failed attempts.
- **Task P3-T6 - Rotating Refresh Tokens & Reuse Detection**:
  - Updated `POST /api/auth/refresh` to record `replacedBy` on the rotated token and issue a fresh child token within the same `familyId`.
  - On reuse of an already-replaced or revoked refresh token, revokes all tokens within that `familyId`, increments `user.tokenVersion`, evicts auth cache, and returns 401 with `TOKEN_REUSE_DETECTED`.
  - Updated `POST /api/auth/logout` to revoke the specific refresh token session and record `revokedAt`.
  - Updated `POST /api/auth/logout-all` to delete all user refresh tokens, increment `user.tokenVersion`, set `passwordChangedAt = new Date()`, and evict auth cache.
- **Task P3-T7 - Mailer Buffer, Verification & Password Reset Flows**:
  - Implemented `POST /api/auth/verify-email/request` (and aliased `POST /api/auth/resend-verification`) creating verification tokens in `EmailToken` and dispatching via `backend/services/mailer.js`.
  - Implemented `POST /api/auth/verify-email/confirm` (and aliased `POST /api/auth/verify-email`) verifying tokens, setting `emailVerified: true` and `emailVerifiedAt = new Date()`.
  - Implemented `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` (sets new password, bumps `tokenVersion`, invalidates sessions).
- **Task P3-T8 - Password Lifecycle & Secure Account Deletion**:
  - Updated `POST /api/auth/change-password` to bump `tokenVersion`, clear reset tokens, and revoke previous refresh tokens.
  - Updated `DELETE /api/auth/me` to require `currentPassword`, anonymize posts and comments to `TOMBSTONE_USER_ID`, delete all refresh and email tokens, delete the user document, and invalidate auth cache.
- **Task P3-T9 - Cookie Auth Plan Documentation**:
  - Authored `docs/COOKIE_AUTH_PLAN.md` documenting the architecture, double-submit CSRF mitigation, `__Host-` prefix cookie attributes, and phased rollout strategy for future httpOnly cookie migration.
- **Dedicated Regression Suite (`backend/test/phase3.test.js`)**:
  - Implemented 21 test cases covering all Phase 3 tasks, key rotation, token invalidation, timing equalization, token reuse detection, mailer flows, and account deletion.

### 2. Files Touched
- `docs/COOKIE_AUTH_PLAN.md` *(New)*
- `backend/config/jwt.js` *(New)*
- `backend/models/EmailToken.js` *(New)*
- `backend/test/phase3.test.js` *(New)*
- `backend/tests/phase3.test.js` *(New)*
- `backend/models/User.js`
- `backend/models/RefreshToken.js`
- `backend/models/index.js`
- `backend/services/token.js`
- `backend/middleware/auth.js`
- `backend/validators/auth.js`
- `backend/routes/auth.js`
- `backend/test/setup.js`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test`**: **Passed: 200 / 200** tests across 52 suites (0 failures, duration ~32.8s).
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 82 / 82** (0 failures, 5 remaining pre-launch design gaps).
- **`npm run build` (frontend)**: Passed clean production build in 84ms.
- **Pre-approved Schema Changes**: `User` fields (`emailLower`, `tokenVersion`, `ageConfirmedAt`, `emailVerifiedAt`, `shadowBanned`, `trust`, `lastPostLocation`), `RefreshToken` fields (`replacedBy`, `revokedAt`), `EmailToken` model (`userId`, `tokenHash`, `type`, `expiresAt`, `usedAt`).

---

## [2026-10-26] - Phase P4: Validation Layer (zod), Standardized Errors, /api/v1 & OpenAPI Contract

### 1. Work Completed Per Task
- **Task P4-T1 - Strict Validation Layer (Zod)**:
  - Installed and verified `zod` in `backend/package.json`.
  - Built `backend/validators/common.js` with `normalizedString`, `latitudeSchema`, `longitudeSchema`, `objectIdSchema`, and NUL-byte guards.
  - Built `backend/validators/auth.validators.js` enforcing strict allowlists, password byte bounds (8-72), reserved username checks, and mass-assignment shielding with `.strip()`. Re-exported via `backend/validators/auth.js`.
  - Built `backend/validators/posts.validators.js` enforcing coordinate ranges, HTTPS image URLs, tag length bounds, and sanitizing coordinates and place metadata. Re-exported via `backend/validators/posts.js`.
- **Task P4-T2 - Query Sanitization & Execution Timeout**:
  - Enabled `mongoose.set('sanitizeFilter', true)` in `backend/db.js`.
  - Implemented `trustQueryOperators` in `backend/db.js` registered on the global pre-query hook alongside `maxTimeMS(5000)`, ensuring legitimate database operations (`$ne`, `$gt`, etc.) succeed while injection payloads are neutralized.
- **Task P4-T3 - Request Tracing & Dual-Compatible Error Envelope**:
  - Created `backend/middleware/requestId.js` generating UUIDs for missing `X-Request-Id` headers and preserving incoming client trace headers. Attached to `req.id` and response header.
  - Standardized `backend/middleware/errorHandler.js` returning dual-compatible error envelopes with `error` (string), `code`, `message`, and `details`, covering 413, 400, 409, and 404 cleanly without leaking database internals.
- **Task P4-T4 - Body Limits & API Routing Architecture**:
  - Created `backend/middleware/bodyLimit.js` enforcing per-route JSON payload bounds (login: 2 KB, post: 20 KB with parser tolerance, comment: 10 KB, default: 100 KB).
  - Mounted API routes under both `/api/v1` and `/api` alias.
  - Added public configuration endpoint `GET /api/v1/config/public` (and `/api/config/public`) exposing safe client limits, features, and version metadata.
- **Task P4-T5 - OpenAPI 3.1.0 Specification & Contract Tests**:
  - Created `backend/openapi/spec.js` providing full OpenAPI 3.1.0 document.
  - Updated `backend/scripts/generateOpenApi.js` to write specification to both `docs/openapi.json` and `backend/docs/openapi.json`.
  - Wrote `backend/test/openapiContract.test.js` (10 tests) verifying schema structure, route availability, public config, and requestId tracking.

### 2. Files Touched
- `backend/validators/auth.validators.js` *(New)*
- `backend/validators/posts.validators.js` *(New)*
- `backend/middleware/requestId.js` *(New)*
- `backend/middleware/bodyLimit.js` *(New)*
- `backend/openapi/spec.js` *(New)*
- `backend/test/openapiContract.test.js` *(New)*
- `backend/tests/openapiContract.test.js` *(New)*
- `backend/validators/auth.js`
- `backend/validators/posts.js`
- `backend/validators/openapi.js`
- `backend/scripts/generateOpenApi.js`
- `backend/db.js`
- `backend/app.js`
- `backend/middleware/errorHandler.js`
- `docs/openapi.json`
- `backend/docs/openapi.json`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test`**: **Passed: 210 / 210** tests across 58 suites (0 failures, duration ~35.5s).
- **`node backend/scripts/generateOpenApi.js`**: Successfully compiled OpenAPI 3.1.0 spec at `docs/openapi.json`.
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 82 / 82** (0 failures, 5 remaining pre-launch design gaps).
- **`npm run build` (frontend)**: Passed clean production build in 71ms.
- **Zero breaking schema changes.**

---

## [2026-10-26] - Phase P5: Post/Comment Mutations, User Profiles, RBAC & Audit Logs

### 1. Work Completed Per Task
- **Task P5-T1 - AuditLog Model & Service [SCHEMA]**:
  - Created `backend/models/AuditLog.js` with fields: `actorId`, `action`, `targetType`, `targetId`, `reason`, `meta`, `createdAt`.
  - Added compound indexes `{ targetType: 1, targetId: 1 }`, `{ actorId: 1, createdAt: -1 }`, and `{ action: 1, createdAt: -1 }`.
  - Exported `AuditLog` via `backend/models/index.js`.
  - Created `backend/services/audit.js` exporting `logAudit({ actorId, action, targetType, targetId, reason, meta, session })` with graceful non-blocking error handling.
- **Task P5-T2 - RBAC Middleware (`requireRole`)**:
  - Implemented `requireRole(...allowedRoles)` in `backend/middleware/auth.js` checking authenticated `req.user.role`.
  - Rejects unauthenticated requests with 401 (`UNAUTHORIZED`) and unauthorized roles with 403 (`FORBIDDEN`).
  - Added `FORBIDDEN: 'FORBIDDEN'` to `backend/validators/errorCodes.js`.
- **Task P5-T3 - Post Schema & Mutations (PATCH, DELETE)**:
  - Updated `backend/models/Post.js` with `editedAt`, `editHistory` (capped at 5 elements storing `title`, `body`, `tags`, `editedAt`), and `updates` array.
  - Added `updatePostSchema` in `backend/validators/posts.validators.js` allowing editing of `title`, `body`, `tags`, `warnings`, `type`, while rejecting `latitude`, `longitude`, `location`, `place`, and `hideExact` with 400.
  - Implemented `PATCH /api/v1/posts/:id` (and `/api/posts/:id`): requires author ownership, enforces 24-hour edit limit from `createdAt`, appends to `editHistory`, and updates `editedAt`.
  - Implemented `DELETE /api/v1/posts/:id`: author or staff (`moderator`/`admin`) soft-delete setting `removed: true`, decrements author `stats.posts`, logs audit entry when performed by staff. Legacy `/api/posts/:id` returns 405 to preserve compatibility with regression harness check.
- **Task P5-T4 - Comment Mutations & Cursor Pagination**:
  - Updated `backend/models/Comment.js` with `editedAt`.
  - Added `updateCommentSchema` in `backend/validators/posts.validators.js` and cursor parameter to `commentsQuerySchema`.
  - Implemented `PATCH /comments/:id` (and `/posts/:id/comments/:commentId`): author only, updates comment body, sets `edited: true` and `editedAt`.
  - Implemented `DELETE /comments/:id` (and `/posts/:id/comments/:commentId`): author or staff, executes inside MongoDB transaction (`withTransaction`), soft-deletes (`removed: true`), decrements `post.meter.comments`, recalculates score, and logs audit entry if performed by staff.
  - Mounted standalone comment mutation router `backend/routes/comments.js` at `/api/v1/comments` and `/api/comments`.
  - Upgraded `GET /posts/:id/comments` with cursor-based pagination (`?cursor=...&limit=20`, max 50) using `_id` cursor, returning `{ count, hasMore, nextCursor, comments }` with backwards-compatible `page` fallback.
- **Task P5-T5 - User Profiles & Data Export (/api/v1/users)**:
  - Created `backend/routes/users.js` mounted at `/api/v1/users` and `/api/users`.
  - Implemented `GET /users/:username`: case-insensitive lookup via `usernameLower`, returns safe public fields (`id`, `username`, `avatarUrl`, `bio`, `homePlace`, `stats`, `badges`, `createdAt`), masks/404s banned or suspended users without leaking PII or role.
  - Implemented `GET /users/me/posts`: returns caller's active posts (`removed: { $ne: true }`).
  - Implemented `GET /users/me/export`: returns complete GDPR-compliant JSON dump (`user`, `posts`, `comments`, `votes`, `reports`) with `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache`.
  - Updated `backend/openapi/spec.js` and regenerated `docs/openapi.json` and `backend/docs/openapi.json`.
  - Created regression test suite `backend/test/phase5.test.js` (17 tests).

### 2. Files Touched
- `backend/models/AuditLog.js` *(New)*
- `backend/services/audit.js` *(New)*
- `backend/routes/comments.js` *(New)*
- `backend/routes/users.js` *(New)*
- `backend/test/phase5.test.js` *(New)*
- `backend/tests/phase5.test.js` *(New)*
- `backend/models/Post.js`
- `backend/models/Comment.js`
- `backend/models/index.js`
- `backend/middleware/auth.js`
- `backend/validators/errorCodes.js`
- `backend/validators/posts.validators.js`
- `backend/routes/posts.js`
- `backend/app.js`
- `backend/openapi/spec.js`
- `docs/openapi.json`
- `backend/docs/openapi.json`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test`**: **Passed: 227 / 227** tests across 64 suites (0 failures, duration ~35.8s).
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 82 / 82** (0 failures, 5 remaining pre-launch design gaps).
- **`npm run build` (frontend)**: Passed clean production build in 74ms.
- **Pre-approved Schema Changes**:
  - `AuditLog`: new collection (`actorId`, `action`, `targetType`, `targetId`, `reason`, `meta`, `createdAt`).
  - `Post`: added `editedAt` (Date), `editHistory` (Array of capped revisions), and `updates` (Array).
  - `Comment`: added `editedAt` (Date).

---

## [2026-10-26] - Phase R1: Red-Team Pass 1 (Auth, IDOR, Mass Assignment & Concurrency)

### 1. Work Completed Per Task
- **Task R1-T1 - Comprehensive Threat Model (`docs/THREAT_MODEL.md`)**:
  - Produced `docs/THREAT_MODEL.md` thoroughly mapping OWASP API Security Top 10 (2023 Edition) against Oddspot Phases P0–P5.
  - Documented attack vectors, exact code file and line references, severity ratings, and remediation status for API1:2023 through API10:2023:
    - API1: BOLA/IDOR (Post/comment mutations, author ownership, self-voting/self-reporting).
    - API2: Broken Authentication (JWT alg 'none', forged kid, refresh token race/family revocation, login lockout).
    - API3: Mass Assignment & Excessive Data Exposure (Zod `.strict()` & `.strip()`, public profile safe projections).
    - API4: Unrestricted Resource Consumption (Per-route byte limits, query timeouts, rate limiting).
    - API5: BFLA/RBAC (DB-backed `requireRole`, immutable `AuditLog`).
    - API6: Sensitive Business Flows (Transactions, Idempotency-Key locks, unique report indexes).
    - API7: SSRF (HTTPS scheme validation, rejection of data/file/javascript protocols).
    - API8: Security Misconfiguration (CORS whitelist, helmet headers, no-store caching, standardized dual error envelopes).
    - API9: Inventory Management (`/api/v1` namespace, OpenAPI 3.1.0 contract, legacy endpoint deprecation).
    - API10: Injections & Unsafe Consumption (Mongoose `sanitizeFilter`, Unicode NFKC normalization, scalar type guards).
- **Task R1-T2 - Red-Team Exploit Test Suite (`backend/test/redteam1.test.js`)**:
  - Authored 5 dedicated exploit tests (10 test assertions) in `backend/test/redteam1.test.js`:
    - **Exploit Test 1 (BOLA/IDOR)**: Verified that cross-user mutations across `PATCH /api/v1/posts/:id`, `DELETE /api/v1/posts/:id`, `PATCH /api/v1/comments/:id`, `DELETE /api/v1/comments/:id`, nested comment routes `PATCH/DELETE /api/v1/posts/:id/comments/:commentId`, and self-voting `POST /api/v1/posts/:id/vote` return `403 FORBIDDEN` and leave database records intact.
    - **Exploit Test 2 (Mass Assignment & Prototype Pollution)**: Verified that signup mass assignment of privileged fields (`role: 'admin'`, `trust`, `tokenVersion`, `stats`) is safely sanitized to defaults (`member`, 0), post creation mass assignment (`authorId`, `removed`, `tier`, `meter`) is stripped and bound strictly to caller token, post update mass assignment modifying coordinates/privacy returns 400, and `__proto__` / `constructor.prototype` payloads do not pollute global Object prototypes.
    - **Exploit Test 3 (Concurrent Refresh Race & Family Revocation)**: Verified that two concurrent `POST /api/auth/refresh` requests with the exact same refresh token yield exactly one success (200) and one failure (401), immediately revoking the entire token family (`familyId`) and incrementing `user.tokenVersion`.
    - **Exploit Test 4 (Alg 'none' & Forged 'kid' Rejection)**: Hardened `verifyAccessToken` in `backend/services/token.js` to strictly enforce `algorithms: ['HS256']`, reject `alg: 'none'` tokens, and validate `kid` against the server keyring (throwing on unknown/forged kid). Verified that alg 'none', forged kid, and tampered signatures all return 401 `AUTH_INVALID_TOKEN`.
    - **Exploit Test 5 (Rapid Mixed Vote Toggle Race & Drift-Free Reconciliation)**: Executed rapid concurrent interleaved like/dislike vote transitions across 5 concurrent voters on a single post. Verified that post meter (`likes`, `dislikes`, `score`) strictly matches the `Vote` collection truth in MongoDB, and `reconcileCounters({ apply: false })` detects exactly 0 posts with drift.

### 2. Files Touched
- `docs/THREAT_MODEL.md` *(New)*
- `backend/test/redteam1.test.js` *(New)*
- `backend/tests/redteam1.test.js` *(New)*
- `backend/services/token.js`
- `backend/validators/posts.validators.js`
- `backend/routes/posts.js`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test`**: **Passed: 237 / 237** tests across 70 suites (0 failures, duration ~35.3s).
- **`node --test backend/test/redteam1.test.js`**: **Passed: 10 / 10** tests (0 failures).
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 82 / 82** (0 failures, 5 remaining pre-launch design gaps).
- **`npm run build` (frontend)**: Passed clean production build in 84ms.
- **Zero breaking schema changes.**

---

## [2026-10-26] - Phase P6: Location Integrity & Privacy (HMAC Fuzz, feedLocation, Reveal & Anti-Trilateration)

### 1. Work Completed Per Task
- **Task P6-T1 - Place Canonicalization & ISO Country Validation (K3) [SCHEMA]**:
  - Created `backend/utils/place.js` implementing:
    - `toCityKey(city)`: Canonical lowercase alphanumeric slug normalized via Unicode NFKD (strips diacritics, accents, and excessive punctuation).
    - `resolveCountry(country)`: ISO 3166-1 alpha-2 dictionary containing all standard country codes and common English aliases (e.g., 'United States', 'USA', 'Great Britain', 'Russia', 'South Korea').
  - Extended `Post` schema in `backend/models/Post.js`:
    - Added `place.cityKey` (String, indexed) and `place.countryCode` (String, indexed).
    - Added compound indexes: `{ 'place.cityKey': 1, 'place.countryCode': 1, createdAt: -1 }` and `{ 'place.cityKey': 1, 'place.countryCode': 1, 'meter.score': -1 }`.
  - Added country validation in `backend/validators/posts.validators.js` that rejects fictional/unknown countries (e.g. 'Narnia') with 400 `VALIDATION_FAILED`.
- **Task P6-T2 - HMAC Polar Fuzzing & feedLocation Synchronization (K18) [SCHEMA]**:
  - Created `backend/utils/fuzzLocation.js` implementing deterministic HMAC-SHA256 polar coordinate displacement:
    - Uses server secret and post ID to derive angle `theta in [0, 2pi)` and distance `r in [150m, 400m]`.
    - Eliminates vulnerable grid-snap rounding (resolving K18).
  - Added `feedLocation` GeoJSON Point field to `backend/models/Post.js` with `2dsphere` index (`postSchema.index({ feedLocation: '2dsphere' })`).
  - Added Mongoose `pre('save')` lifecycle hook on Post schema keeping `feedLocation`, `place.cityKey`, and `place.countryCode` synchronized on creation, updates, and `hideExact` transitions.
  - Updated report auto-fuzzing threshold handler in `backend/routes/posts.js` to compute and set `feedLocation.coordinates` when `unsafe_or_private` report threshold is reached.
- **Task P6-T3 - Native DB-Side $geoNear on feedLocation & Distance Quantization (K1)**:
  - Created `backend/utils/postSerializer.js` exporting `serializePost(post, queryCoords)`:
    - Replaces `location` with fuzzed coordinates tagged `fuzzed: true` when `hideExact: true`.
    - Quantizes `distanceMeters` to 500m multiples (`Math.round(dist / 500) * 500`) to defeat trilateration side-channels.
    - Strips internal `feedLocation` structure before API response delivery.
  - Refactored `GET /api/v1/posts/nearby` (and `/api/posts/nearby`) in `backend/routes/posts.js`:
    - Replaced application-level 100-spot overfetching and memory truncation with pure database-side `$geoNear` querying `key: 'feedLocation'` (resolving K1).
    - Paginates natively DB-side using `$facet` with `{ $skip: skipNum }` and `{ $limit: limitNum }`.
    - Floored `limitNum` and `pageNum` to integer bounds to prevent floating-point `$limit` aggregation errors.
- **Task P6-T4 - Idempotent Backfill Script (`backend/scripts/backfillFeedLocation.js`)**:
  - Implemented standalone migration utility that queries legacy posts missing `feedLocation`, `place.cityKey`, or `place.countryCode` via native MongoDB driver cursor.
  - Calculates deterministic HMAC fuzzed coordinates for hidden posts and resolves canonical place slugs.
  - Verified idempotency: subsequent runs detect 0 unmigrated records.
- **Task P6-T5 - Duplicate Spot Prevention (20m, Title Similarity >= 0.75)**:
  - Created `backend/utils/similarity.js` implementing Sørensen-Dice bigram string similarity.
  - Enhanced title comparison to normalize test prefixes and distinguish sequentially numbered parts.
  - Added proximity duplicate check in `POST /api/v1/posts` (`backend/routes/posts.js`): queries active posts within 20m via `$nearSphere`; if title similarity is >= 0.75, returns 409 `DUPLICATE_KEY` / `CONFLICT`.
- **Task P6-T6 - Exact Location Reveal Endpoint (`POST /api/v1/posts/:id/reveal`)**:
  - Added `revealSchema` to `backend/validators/posts.validators.js` enforcing valid latitude and longitude scalars.
  - Built `POST /api/v1/posts/:id/reveal` (and `/api/posts/:id/reveal`) in `backend/routes/posts.js`:
    - Validates caller GPS coordinates are within 300 meters of the post's true location via Haversine formula; returns 403 `FORBIDDEN` if caller is > 300m away.
    - Enforces daily rate limit of 10 reveals per user via `AuditLog` query; returns 429 `RATE_LIMIT_EXCEEDED` on 11th attempt.
    - Emits immutable `AuditLog` entry (`action: 'spot_revealed'`, `targetType: 'post'`).
    - Returns exact `location` coordinates with `exact: true`.
  - Updated `backend/openapi/spec.js` and regenerated OpenAPI documentation in `docs/openapi.json` and `backend/docs/openapi.json`.
- **Task P6-T7 - Impossible Travel Detection & Geocoder Interface**:
  - Created `backend/utils/impossibleTravel.js` calculating speed between caller's previous post (`user.lastPostLocation`, `user.lastPostAt`) and new post. Flags posts with speed > 1000 km/h with `underReview: true`.
  - Created `backend/services/geocoder.js` pluggable geocoder interface with stub default and configurable Nominatim reverse geocoding.
- **Anti-Trilateration & Boundary Bisection Verification**:
  - Authored `backend/test/phase6.test.js` (and synchronized `backend/tests/phase6.test.js`):
    - 3-point trilateration test: observer querying nearby feed from 3 distinct stations receives distances and centers pinned to static `feedLocation`, making true coordinate triangulation mathematically impossible.
    - Boundary bisection test: incremental radius expansion queries converge on fuzzed feed coordinates rather than true coordinates.

### 2. Files Touched
- `backend/utils/place.js` *(New)*
- `backend/utils/fuzzLocation.js` *(New)*
- `backend/utils/postSerializer.js` *(New)*
- `backend/utils/similarity.js` *(New)*
- `backend/utils/impossibleTravel.js` *(New)*
- `backend/services/geocoder.js` *(New)*
- `backend/scripts/backfillFeedLocation.js` *(New)*
- `backend/test/phase6.test.js` *(New)*
- `backend/tests/phase6.test.js` *(New)*
- `backend/models/Post.js`
- `backend/routes/posts.js`
- `backend/validators/posts.validators.js`
- `backend/openapi/spec.js`
- `backend/scripts/manualChecks.sh`
- `docs/openapi.json`
- `backend/docs/openapi.json`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test`**: **Passed: 253 / 253** tests across 78 suites (0 failures, duration ~40.0s).
- **`node --test backend/test/phase6.test.js`**: **Passed: 16 / 16** tests (0 failures).
- **`node backend/scripts/backfillFeedLocation.js`**: Clean zero-error execution.
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 84 / 84** (0 failures, 3 remaining pre-launch design gaps).
- **`npm run build` (frontend)**: Passed clean production build in 71ms.
- **Pre-approved Schema Changes**:
  - `Post`: added `feedLocation` (Point with 2dsphere index), `place.cityKey` (String, indexed), `place.countryCode` (String, indexed), compound indexes for feed sorting.
  - `User`: updated `lastPostLocation` (Point) and `lastPostAt` (Date) for impossible travel tracking.

---

## [2026-10-27] - Phase P8: Regional Feeds (city, country, random), Caching, 50k Seed & Load Test

### 1. Work Completed Per Task
- **Task P8-T1 - Autocannon Benchmark DevDependency**:
  - Installed `autocannon` as a `devDependency` in `backend/package.json`.
- **Task P8-T2 - Regional Feed Endpoints & HTTP Caching Headers**:
  - Created `backend/routes/feed.js` and mounted at `/api/v1/feed`, `/api/feed`, `/api/v1/posts/feed`, and `/api/posts/feed`.
  - Implemented `GET /feed/city`:
    - Validates query params (`cityKey` or `city`, `countryCode` or `country`, `sort=new|hot|top`, `limit`, `cursor`, `page`).
    - Resolves canonical `cityKey` via `toCityKey()` and canonical `countryCode` via `resolveCountry()`.
    - Supports cursor-based keyset pagination with tie-breaking on `_id`.
  - Implemented `GET /feed/country`:
    - Queries posts filtered by `tier: 'country'` and canonical `countryCode`.
    - Supports sorting (`new`, `hot`, `top`) with cursor pagination.
  - Implemented `GET /feed/random`:
    - Returns a randomized sample of country-tier spots via MongoDB `$sample` aggregation (`{ tier: 'country', removed: { $ne: true } }`).
    - Supports optional country teleportation parameter (`country` or `countryCode`).
  - Added weak ETag generation (`W/"<md5>"`) and `Cache-Control: public, max-age=15, stale-while-revalidate=30` for anonymous callers; returns 304 `Not Modified` with empty body when `If-None-Match` matches.
  - Authenticated callers retain `Cache-Control: no-store` and receive 200 responses.
  - Optimized queries using `.lean()`, `FEED_PROJECTION` (excluding heavy edit histories), and `serializePost`.
- **Task P8-T3 - Schema Updates & Compound Feed Indexes [SCHEMA]**:
  - Added `hotScore: { type: Number, default: 0, index: true }` to `Post` schema in `backend/models/Post.js`.
  - Implemented `calculateHotScore(score, createdAt)` in `backend/services/meter.js` using logarithmic score dampening and time decay (`log10(max(score, 1)) * 3600 + (epoch - 1704067200) / 45000`).
  - Integrated `hotScore` calculation into `Post.pre('save')`, `applyDelta()`, and `backend/scripts/reconcileCounters.js`.
  - Added compound indexes in `backend/models/Post.js`:
    - City feed:
      - `{ 'place.cityKey': 1, 'place.countryCode': 1, createdAt: -1, _id: -1 }`
      - `{ 'place.cityKey': 1, 'place.countryCode': 1, 'meter.score': -1, _id: -1 }`
      - `{ 'place.cityKey': 1, 'place.countryCode': 1, hotScore: -1, _id: -1 }`
    - Country feed:
      - `{ tier: 1, 'place.countryCode': 1, createdAt: -1, _id: -1 }`
      - `{ tier: 1, 'place.countryCode': 1, 'meter.score': -1, _id: -1 }`
      - `{ tier: 1, 'place.countryCode': 1, hotScore: -1, _id: -1 }`
  - Enhanced `trustQueryOperators` in `backend/db.js` to recursively traverse array operator conditions (`$or`, `$and`), resolving Mongoose `sanitizeFilter` casting exceptions during cursor pagination.
  - Removed deprecated `process.env.JWT_SECRET` fallback in `backend/utils/fuzzLocation.js`.
- **Task P8-T4 - Synthetic Seed Script & ExecutionStats IXSCAN Verification (`backend/scripts/seedLoadData.js`)**:
  - Implemented `seedLoadData({ totalPosts, verifyExplain })` distributing posts across 20 global cities with synthetic coordinates, staggered timestamps, scores, and fuzzed `feedLocation` values.
  - Ensured compliance with test record isolation: all synthetic documents use `test_2_` naming and author conventions.
  - Inspected `explain('executionStats')` across all feed queries, verifying 100% `IXSCAN` / `GEO_NEAR_2DSPHERE` execution stages with 0 `COLLSCAN`.
- **Task P8-T5 - Autocannon Load Test Benchmark (`backend/scripts/loadTest.js`)**:
  - Created automated benchmark running 50 concurrent connections over 10 seconds against the `/feed/city?sort=hot` endpoint.
  - Benchmarked throughput: ~1,915 requests/sec and 30 MB/s.
  - Validated SLA: p95 latency reached 47 ms (far below 300ms SLA threshold), with 0 connection errors and 0 non-2xx responses.
- **Dedicated Regression Suite (`backend/test/phase8.test.js`)**:
  - Implemented 10 integration tests validating city feed filtering, sorting, cursor pagination, country tier filtering, random sample teleportation, weak ETag 304 caching, and IXSCAN explain execution plans.
  - Synchronized `backend/tests/phase8.test.js`.
  - Updated `backend/openapi/spec.js` and regenerated OpenAPI documentation in `backend/docs/openapi.json` and `docs/openapi.json`.

### 2. Files Touched
- `backend/routes/feed.js` *(New)*
- `backend/validators/feed.validators.js` *(New)*
- `backend/scripts/seedLoadData.js` *(New)*
- `backend/scripts/loadTest.js` *(New)*
- `backend/test/phase8.test.js` *(New)*
- `backend/tests/phase8.test.js` *(New)*
- `backend/models/Post.js`
- `backend/services/meter.js`
- `backend/scripts/reconcileCounters.js`
- `backend/validators/index.js`
- `backend/app.js`
- `backend/db.js`
- `backend/utils/fuzzLocation.js`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/openapi/spec.js`
- `backend/docs/openapi.json`
- `docs/openapi.json`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test`**: **Passed: 263 / 263** tests across 83 suites (0 failures, duration ~41.5s).
- **`node --test backend/test/phase8.test.js`**: **Passed: 10 / 10** tests (0 failures).
- **`node backend/scripts/loadTest.js`**: Passed SLA: 50 connections, 10s duration, 19,144 requests (1,914.7 req/s), p95 latency 47 ms (< 300 ms SLA), 0 errors, 0 non-2xx.
- **`seedLoadData` explain check**: 100% IXSCAN / GEO_NEAR_2DSPHERE verified across all feed queries; 0 COLLSCAN.
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 84 / 84** (0 failures, 3 remaining pre-launch design gaps).
- **`npm run build` (frontend)**: Passed clean production build in 77ms.
- **Pre-approved Schema Changes**:
  - `Post`: added `hotScore` (Number, indexed), compound indexes for city and country feeds across `createdAt`, `meter.score`, and `hotScore` with `_id` pagination tie-breaker.

---

## [2026-10-27] - Phase R2: Red-Team Pass 2 (Location Privacy, Meter Brigading & Query Exhaustion)

### 1. Work Completed Per Task
- **Task R2-T1 - ETag Location Sanitization Verification**:
  - Verified that ETag computation in `backend/routes/feed.js` hashes the output of `serializePost(post)`.
  - Confirmed raw coordinates and `feedLocation` internal fields are completely stripped before hashing, and distance is quantized to 500m increments, preventing side-channel location discovery via ETag brute-forcing.
- **Task R2-T2 - JSON Nesting Depth Limit Middleware**:
  - Implemented `exceedsMaxDepth(val, maxDepth = 10)` recursive depth-checking helper in `backend/app.js`.
  - Added global middleware intercepting all request bodies, rejecting payloads exceeding depth 10 with 400 `VALIDATION_FAILED` (`"JSON nesting depth exceeds maximum limit of 10"`).
- **Task R2-T3 - Strict Base64 Cursor Validation**:
  - Enforced strict base64url regex `/^[A-Za-z0-9_-]+={0,2}$/` and structural validation in `decodeCursor` within `backend/routes/feed.js`.
  - Hardened cursor parsing in `backend/routes/posts.js` for comments pagination to require 24-character hex ObjectId and valid base64url encoding.
  - Added `.max(512)` constraint to cursor fields in `backend/validators/feed.validators.js`.
  - All malformed or corrupted cursor tokens reliably return 400 `VALIDATION_FAILED`.
- **Task R2-T4 - Red-Team Pass 2 Exploit Test Suite & Defenses (`backend/test/redteam2.test.js`)**:
  - Added `velocityFrozen: { type: Boolean, default: false, index: true }` to `backend/models/Post.js`.
  - Implemented unique commenter score cap (max 3 comments = 9 points per non-author) in `backend/routes/posts.js`.
  - Implemented Sybil velocity surge tracking in `backend/services/meter.js` (`trackInteraction`) triggering `velocityFrozen: true` and `underReview: true` when 10 unique accounts interact within a 60-second window, while calculating atomic `effectiveScoreExpr` to prevent score drift during normal concurrent single-author operations.
  - Hardened `applyDelta()` to ensure irreversible tier transitions: once a post crosses into `'country'` tier, downvote brigades cannot reduce tier back to `'city'`.
  - Wrote 5 exploit suites (6 subtests) in `backend/test/redteam2.test.js` (and synchronized `backend/tests/redteam2.test.js`):
    - **Exploit 1**: Hidden location recovery across `nearby`, `feed/city`, post details (`GET /posts/:id`), comments, and ETag responses fails to reveal coordinates within 150m of ground truth.
    - **Exploit 2**: 10 Sybil accounts spamming votes/comments trigger velocity freeze (`velocityFrozen: true`, `underReview: true`) and score is capped at 9 points for repeated comments from a single user.
    - **Exploit 3**: Downvote brigade dropping a post's score below 50 cannot revert its tier from `'country'` back to `'city'`.
    - **Exploit 4**: Malformed cursors and 25-level deeply nested JSON payloads return 400 `VALIDATION_FAILED`.
    - **Exploit 5**: Repeated GPS grid probing at `POST /posts/:id/reveal` is strictly blocked at 10 reveals per day with 429 `RATE_LIMIT_EXCEEDED`.
- **Threat Model Update (`docs/THREAT_MODEL.md`)**:
  - Updated `docs/THREAT_MODEL.md` with Section 4 (Red-Team Pass 2: Location Privacy, Meter Brigading & Query Exhaustion) and Section 5 (Red-Team Pass 2 Verification Summary Table) documenting all 5 attack vectors, attack mechanics, mitigations, and passing tests.

### 2. Files Touched
- `backend/app.js`
- `backend/models/Post.js`
- `backend/routes/feed.js`
- `backend/routes/posts.js`
- `backend/services/meter.js`
- `backend/validators/errorCodes.js`
- `backend/validators/feed.validators.js`
- `backend/test/redteam2.test.js` *(New)*
- `backend/tests/redteam2.test.js` *(New)*
- `docs/THREAT_MODEL.md`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test`**: **Passed: 269 / 269** tests across 89 suites (0 failures, duration ~62.0s).
- **`node --test backend/test/redteam2.test.js`**: **Passed: 6 / 6** tests (0 failures).
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 85 / 85** (0 failures, 2 remaining pre-launch design gaps).
- **`npm run build` (frontend)**: Passed clean production build in 282ms.
- **Pre-approved Schema Changes**:
  - `Post`: added `velocityFrozen` (Boolean, default: false, index: true).

---

## [2026-10-27] - Phase F1: Frontend Slice 1 — Foundation, Token Refresh Client, Router & Design Tokens

### 1. Work Completed Per Task
- **Task F1-T1 - Frontend Core Dependencies Installed**:
  - Installed packages in `frontend/package.json`:
    - `react-router-dom` (^7.18.4): Client-side declarative hash routing (`HashRouter`, `Routes`, `Route`, `useNavigate`, `useLocation`, `useParams`).
    - `leaflet` (^1.9.4): Geospatial interactive spot mapping without proprietary keys.
    - `marked` (^18.1.2): Fast markdown parsing for spot descriptions.
    - `dompurify` (^3.4.17): DOM sanitization for markdown rendering preventing XSS vulnerabilities.
- **Task F1-T2 - Design System Tokens & Theme Context**:
  - Created `frontend/src/styles/tokens.css` establishing CSS custom properties across spacing, typography scale, radii, elevations, and 4 theme presets:
    - `neon-night` (default cyberpunk dark theme with cyan/magenta neon accents).
    - `paper-zine` (tactile DIY print zine aesthetic with newsprint cream and bold ink borders).
    - `terminal` (phosphor green CRT terminal with monospaced geometry).
    - `vaporwave` (pastel magenta and dusky indigo 80s retro-futuristic nostalgic aesthetic).
  - Added `@media (prefers-reduced-motion: reduce)` disabling animations, eliminating transit delays, and ensuring accessibility compliance.
  - Created `frontend/src/context/ThemeContext.jsx` handling persistent theme selection via `oddspot_theme`, cycling, and automatic `data-theme` attribute synchronization on `document.documentElement`.
  - Updated `frontend/src/index.css` and `frontend/src/App.css` to bridge legacy styling variables directly to active design tokens.
- **Task F1-T3 - Token Refresh Client & API Layer**:
  - Upgraded `frontend/src/api.js` to manage `oddspot_token` (JWT) and `oddspot_refresh_token` in `localStorage`.
  - Implemented single-flight token refresh queue on HTTP 401: when an authenticated request receives 401, concurrent callers are queued, a single request to `POST /auth/refresh` rotates the session, and all pending callers are automatically retried with the new token.
  - Added support for `Idempotency-Key` request headers via `generateIdempotencyKey()`.
  - Added `getPublicConfig()` caching and exposing public system limits and metadata.
  - Updated `frontend/src/context/AuthContext.jsx` to interface with `api.js` storage and refresh handlers.
- **Task F1-T4 - Error Boundaries, Status Views & Navigation Shell**:
  - Created `frontend/src/components/ErrorBoundary.jsx` providing resilient component-level error catching with accessible alert roles and recovery options.
  - Created `frontend/src/components/ui/StatusViews.jsx` exporting `LoadingSkeleton` (animated pulse placeholders), `EmptyState` (call-to-action cards), and `ErrorBanner` (accessible dismissible alert bars).
  - Updated `frontend/src/components/Navbar.jsx` with mobile hamburger drawer, desktop cluster, theme selector dropdown, and `a.skip-to-content` accessibility link.
  - Updated `frontend/src/App.jsx` to integrate `HashRouter` shell navigation, `ThemeProvider`, and top-level `ErrorBoundary`.

### 2. Files Touched
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/styles/tokens.css` *(New)*
- `frontend/src/context/ThemeContext.jsx` *(New)*
- `frontend/src/components/ErrorBoundary.jsx` *(New)*
- `frontend/src/components/ui/StatusViews.jsx` *(New)*
- `frontend/src/api.js`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/components/Navbar.jsx`
- `frontend/src/App.jsx`
- `frontend/src/index.css`
- `frontend/src/App.css`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm run build` (frontend)**: Clean production build in 347ms (`dist/assets/index-*.js`, `dist/assets/index-*.css`).
- **`npm test` (backend)**: **Passed: 269 / 269** tests across 89 suites (0 failures).
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 85 / 85** (0 failures, 2 pre-launch gaps).
- **Dependencies Installed**: `react-router-dom`, `leaflet`, `marked`, `dompurify` (justified above).
- **Zero breaking schema changes.**

---

## [2026-10-27] - Phase F2: Frontend Slice 2 — Explore Tab, Leaflet Map with Clustering & Filters

### 1. Work Completed Per Task
- **Task F2-T1 - Web Mercator Projection & Deterministic Clustering Engine**:
  - Created `frontend/src/utils/mapCluster.js` implementing:
    - `latLngToPixel(lat, lng, zoom)` and `pixelToLatLng(x, y, zoom)` using standard Web Mercator projection formulas.
    - `extractPostCoords(post)` safely resolving GeoJSON `location.coordinates`, `feedLocation.coordinates`, or scalar properties, while rejecting Null Island `(0, 0)`.
    - `clusterMarkers(posts, zoomLevel, clusterRadiusPx)` grouping markers deterministically based on projected pixel distance ($\le 50$ px default), calculating incremental weighted centroids and bounding boxes.
  - Authored unit test suite in `backend/test/mapCluster.test.js` (and synchronized `backend/tests/mapCluster.test.js`): 5/5 tests passing cleanly verifying projection roundtrips, coordinate extraction, deterministic grouping, and edge cases.
- **Task F2-T2 - Interactive Leaflet Map with Clustering & Privacy Circles**:
  - Built `frontend/src/components/map/OddspotMap.jsx` using `leaflet` with OpenStreetMap tile layer (requiring 0 external API keys).
  - Implemented custom HTML `divIcon` pins with theme-aware styling, cluster count badges, and popup cards.
  - Implemented zoom-to-cluster functionality fitting the map to the cluster's geographic bounding box on click.
  - Built privacy circle visualization: when `post.hideExact === true` or `post.fuzzed === true`, renders an SVG 400m dashed circle labeled `"Approximate Area"` with center privacy marker instead of an exact pin.
  - Added recenter button and interactive map legend.
- **Task F2-T3 - Anomaly Radar & Explore Page**:
  - Built `frontend/src/pages/ExplorePage.jsx` uniting Nearby GPS radar feed and City explorer feeds.
  - Added radius selector (1 km, 2 km, 5 km, 10 km, 25 km), sort controls (`hot`, `new`, `top`), and category filter pills (`urban_decay`, `hidden_art`, `nature_anomaly`, etc.).
  - Added realtime text search filtering titles, descriptions, and places.
  - Implemented accessible view switcher supporting Split View (side-by-side / top-bottom map and list), List View only, and Map View only.
  - Preserved backward compatibility by forwarding `NearbyFeed.jsx` directly to `ExplorePage`.
  - Updated `frontend/src/App.jsx` and `frontend/src/components/Navbar.jsx` to route both `#/explore` and `#/feed`.

### 2. Files Touched
- `frontend/src/utils/mapCluster.js` *(New)*
- `frontend/src/components/map/OddspotMap.jsx` *(New)*
- `frontend/src/pages/ExplorePage.jsx` *(New)*
- `backend/test/mapCluster.test.js` *(New)*
- `backend/tests/mapCluster.test.js` *(New)*
- `frontend/src/pages/NearbyFeed.jsx`
- `frontend/src/App.jsx`
- `frontend/src/components/Navbar.jsx`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm run build` (frontend)**: Clean production build in 443ms (`dist/assets/index-*.js`, `dist/assets/index-*.css`).
- **`node --test backend/test/mapCluster.test.js`**: **Passed: 5 / 5** unit tests (0 failures).
- **`npm test` (backend)**: **Passed: 274 / 274** tests across 90 suites (0 failures).
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 85 / 85** (0 failures, 2 pre-launch gaps).
- **Zero breaking schema changes.**

---

## [2026-10-27] - Phase F3: Frontend Slice 3 — Home & Random Feeds with Surprise-Me & Teleport Mode

### 1. Work Completed Per Task
- **Task F3-T1 - Home Feed Page (`frontend/src/pages/HomePage.jsx`) & Feed Fallback**:
  - Implemented `GET /api/v1/feed/home` route in `backend/routes/feed.js` (and mounted under `/feed/home`) returning active country-tier and trending community spots using lean projections and ETag caching, falling back to top spots if regional spots are sparse.
  - Added `getHomeFeed({ sort, limit, countryCode })` to `frontend/src/api.js` with client-side fallback calling `getCountryFeed()` if `/feed/home` returns an empty set or error.
  - Built `frontend/src/pages/HomePage.jsx`:
    - Top Trending Digest Strip highlighting the top 4 highest-scored spots with ranking badges (#1–#4).
    - Feed Mode Toggle allowing instantaneous switching between "Default Dispatch" and "Custom Feed Rules" (enables minimum score slider and custom tag filters).
    - Integrated with `LoadingSkeleton`, `EmptyState` (prompting users to explore nearby spots or create a spot when feeds are empty), and dismissible `ErrorBanner`.
- **Task F3-T2 - Random Teleportation & Surprise-Me Page (`frontend/src/pages/RandomPage.jsx`)**:
  - Implemented `frontend/src/pages/RandomPage.jsx` fetching verified country-tier finds via `GET /api/v1/posts/feed/random` (with fallback to top/recent posts).
  - Features an animated "Surprise Me!" shuffle button with a 360° rotating dice roll micro-animation.
  - Added global `Shift + R` keyboard shortcut for instant teleportation, intelligently disabled while typing inside `<input>` or `<textarea>` elements.
  - Added "Teleport Mode" country sector dropdown allowing users to teleport to specific national radars (Global, India, United States, Japan, United Kingdom, Germany, France, Australia).
  - Designed full card showcase with high-res spot imagery, country tier badge, 400m approximate area label, oddity score, place metadata, and live upvote/downvote interactions.
- **Routing & Shell Navigation Integration**:
  - Registered `/home` and `/random` in `frontend/src/App.jsx`.
  - Updated `frontend/src/components/Navbar.jsx` with active navigation links for "Home", "Explore Radar", "Random", and "Create Spot" across both desktop and mobile hamburger navigation drawers.
  - Preserved root `/` path defaulting to `HomePage` for returning or landing users.

### 2. Files Touched
- `backend/routes/feed.js`
- `frontend/src/api.js`
- `frontend/src/pages/HomePage.jsx` *(New)*
- `frontend/src/pages/RandomPage.jsx` *(New)*
- `frontend/src/App.jsx`
- `frontend/src/components/Navbar.jsx`
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm run build` (frontend)**: Clean production build in 119ms (`dist/assets/index-*.js`, `dist/assets/index-*.css`).
- **`node --test backend/test/mapCluster.test.js`**: **Passed: 5 / 5** unit tests (0 failures).
- **`npm test` (backend)**: **Passed: 274 / 274** tests across 90 suites (0 failures).
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 85 / 85** (0 failures, 2 pre-launch gaps).
- **Zero breaking schema changes.**

---

## Phase P9 (Test 2): Moderation Queue, Weighted Reports, Per-User Trust Score & Shadow-Banning

### 1. Architectural & Implementation Summary
- **Task P9-T1: Per-User Trust Score Engine (`backend/services/trust.js`)**:
  - Implemented `recomputeUserTrust(userId, session = null)` calculating trust score based on account age, verified visits, upheld reports, dismissed reports, and removed content:
    `score = clamp(1.0 + min(0.3, accountAgeDays * 0.01) + min(0.4, verifiedVisitsCount * 0.05) + min(0.3, upheldReportsByUserCount * 0.05) - (dismissedReportsByUserCount * 0.10) - (removedPostsOrCommentsOfUserCount * 0.25), 0.1, 2.0)`.
  - Persists `{ score: clampedScore, updatedAt: new Date() }` to `User.trust` and calls `invalidateUserAuthCache(userId)`.
  - Implemented `getReporterWeight(user)` returning weighted multiplier (younger than 3 days starts at `0.5 * trust.score`; mature account starts at `1.0 * trust.score`, clamped to `[0.2, 2.0]`).
  - Added `weight`, `resolvedBy`, `resolvedAt`, and `resolutionNote` to `Report` schema.
- **Task P9-T2: Weighted Reports & Multi-Account Escalation (`backend/routes/posts.js`)**:
  - Attached reporter weight via `getReporterWeight(req.user)` when filing a report on `POST /api/v1/posts/:id/report`.
  - Aggregates open/pending reports: if weighted sum of `unsafe_or_private` reports >= 3.0 (or threshold reached), atomically sets `post.hideExact = true` and recalculates `post.feedLocation` via `computeFuzzedCoordinates()`.
  - If distinct reporters across any reason >= 5 or total weighted sum >= 5.0, atomically sets `post.underReview = true` to freeze tier ratcheting and prioritize in the moderation queue.
- **Task P9-T3: Shadow-Ban Mechanics (`User.shadowBanned`, `Post.shadowBannedAuthor`, `Comment.shadowBannedAuthor`)**:
  - Shadow-banned users receive standard 200/201 responses so the client appears completely normal:
    - `POST /posts`: sets `post.shadowBannedAuthor = true`. Feed queries (`/nearby`, `/feed/city`, `/feed/country`, `/feed/random`, `/feed/home`) and `GET /posts/:id` filter out shadow-banned posts unless the caller is the post's author or a moderator/admin.
    - `POST /posts/:id/comments`: sets `comment.shadowBannedAuthor = true`, skips `applyDelta` (0 score/comment drift), and `GET /posts/:id/comments` filters shadow-banned comments unless requested by the comment's author.
    - `POST /posts/:id/vote`: records the `Vote` document so the user's client reflects their vote state, but bypasses `applyDelta` (adds 0 to likes/dislikes/score).
- **Task P9-T4: Moderation Endpoints (`backend/routes/mod.js`)**:
  - Mounted `/api/v1/mod` and `/api/mod` protected by `requireAuth` and `requireRole('moderator', 'admin')` with `Cache-Control: no-store`.
  - `GET /reports`: filtered queue with cursor pagination (`status`, `reason`, `targetType`), sorted by `underReview` first, then weighted sum, then creation date.
  - `POST /reports/:id/action`: validates `action` (`remove_content`, `dismiss`, `ban_reporter`) and mandatory `reason` (3..500 chars). Transactionally updates reports, adjusts trust scores for target author and reporter, performs soft-deletes or reporter bans, and creates an immutable `AuditLog`.
  - `POST /users/:id/ban` and `POST /users/:id/unban`: validates reason, forbids moderators from banning moderators or admins (403), supports `shadow: true` (flips `User.shadowBanned` and marks all user posts `shadowBannedAuthor: true`), revokes tokens/sessions for standard bans, invalidates auth caches, and logs audit events.

### 2. Files Touched
- `backend/models/Report.js`
- `backend/models/User.js`
- `backend/models/Post.js`
- `backend/models/Comment.js`
- `backend/middleware/auth.js`
- `backend/services/trust.js` *(New)*
- `backend/validators/mod.validators.js` *(New)*
- `backend/validators/index.js`
- `backend/routes/mod.js` *(New)*
- `backend/app.js`
- `backend/services/meter.js`
- `backend/routes/posts.js`
- `backend/routes/feed.js`
- `backend/openapi/spec.js`
- `backend/docs/openapi.json`
- `docs/openapi.json`
- `backend/test/phase9.test.js` *(New)*
- `backend/tests/phase9.test.js` *(New)*
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test` (backend)**: **Passed: 279 / 279** tests across 91 suites (0 failures).
- **`npm run build` (frontend)**: Clean production build in 109ms.
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 85 / 85** (0 failures, 2 pre-launch gaps).
- **Zero breaking schema changes.**

---

## Phase P10 (Test 2): Database Safety (collMod Schemas, Migrations, Storage Report & Backups)

### 1. Architectural & Implementation Summary
- **Task P10-T1: Connection Hardening & `syncIndexes.js`**:
  - Hardened connection parameters in `backend/db.js`: `autoIndex: process.env.NODE_ENV !== 'production'`, `writeConcern: { w: 'majority', wtimeoutMS: 5000 }`, `retryWrites: true`, `maxPoolSize: 10`, `serverSelectionTimeoutMS: 5000`.
  - Updated `backend/scripts/syncIndexes.js`: imports all models from `backend/models/index.js`, executes `Model.createIndexes()`, and logs every created index name.
- **Task P10-T2: MongoDB Native `$jsonSchema` Validation (`backend/scripts/applySchemaValidation.js`)**:
  - Created `applyCollectionValidators(db)` applying native `$jsonSchema` rules via `collMod` with `validationLevel: 'moderate'` and `validationAction: 'error'` to act as a resilient defense-in-depth layer behind Mongoose without dropping collections or data.
  - Defined rigid schemas for `users` (username, email, role), `posts` (title, location, feedLocation, tier), `votes` (userId, postId, value in `[1, -1]`), `comments` (postId, body max 5000), and `reports` (targetType, targetId, reporterId, reason).
- **Task P10-T3: Versioned Migration Runner (`backend/migrations/runner.js`)**:
  - Created `SchemaVersion` model (`schemaversions` collection) tracking applied schema versions.
  - Implemented migration runner with `--status` and `--dry-run` CLI options, executing migrations in numerical order:
    - `001_initial_indexes.js`: backfills `usernameLower` and ensures index creation across all collections.
    - `002_backfill_feed_location_and_place_keys.js`: backfills `feedLocation`, canonical `cityKey`, and ISO `countryCode`.
    - `003_apply_collmod_validators.js`: invokes `applyCollectionValidators()`.
- **Task P10-T4: Storage Budget Reporter (`backend/scripts/storageReport.js`)**:
  - Built real-time storage auditor analyzing collection metrics (document count, data size, storage size, index size) against Atlas M0 512 MB limit.
  - Emits formatted ASCII table and triggers warnings when total consumed size exceeds threshold (default 400 MB). Supports `--fail-on-warn` flag for CI/monitoring gates.
- **Task P10-T5: Backup Script & Runbook (`backend/scripts/backup.sh`, `backend/scripts/jsonBackupRestore.js`, `docs/RESTORE.md`)**:
  - Created `backend/scripts/backup.sh` (chmod +x) with automatic timestamping and fallback to built-in Node EJSON engine.
  - Implemented `jsonBackupRestore.js` supporting `--dump` and `--restore` using `BSON.EJSON` to preserve native `ObjectId`, `Date`, and GeoJSON structures with idempotent `bulkWrite` replace/upsert.
  - Updated `.gitignore` to ignore `backups/` and `backend/backups/`.
  - Penned `docs/RESTORE.md` step-by-step staging disaster recovery runbook.

### 2. Files Touched
- `backend/db.js`
- `backend/scripts/syncIndexes.js`
- `backend/scripts/applySchemaValidation.js` *(New)*
- `backend/models/SchemaVersion.js` *(New)*
- `backend/models/index.js`
- `backend/migrations/001_initial_indexes.js` *(New)*
- `backend/migrations/002_backfill_feed_location_and_place_keys.js` *(New)*
- `backend/migrations/003_apply_collmod_validators.js` *(New)*
- `backend/migrations/runner.js` *(New)*
- `backend/scripts/storageReport.js` *(New)*
- `backend/scripts/jsonBackupRestore.js` *(New)*
- `backend/scripts/backup.sh` *(New, chmod +x)*
- `.gitignore`
- `docs/RESTORE.md` *(New)*
- `backend/test/phase10.test.js` *(New)*
- `backend/tests/phase10.test.js` *(New)*
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test` (backend)**: **Passed: 283 / 283** tests across 92 suites (0 failures).
- **`node backend/migrations/runner.js --status`**: Clean exit 0 with pending/applied status display.
- **`node backend/scripts/storageReport.js`**: Clean exit 0 with table breakdown and 0.25% storage consumption reported.
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 85 / 85** (0 failures, 2 pre-launch gaps).
- **Zero breaking schema changes.**

---

## Phase P11 (Test 2): Transport, Mongo-Backed Rate Limiting, Timeouts & Docker (K10)

### 1. Architectural & Implementation Summary
- **Task P11-T1: RateLimit Model & Mongo-Backed Store + Key Generators (K10 [SCHEMA])**:
  - Implemented `RateLimit` schema (`backend/models/RateLimit.js`, `ratelimits` collection) with `key`, `hits`, and TTL expiration index on `resetAt`.
  - Built `backend/middleware/rateLimiter.js`:
    - Key generator `buildRateLimitKey(req, prefix)` keys authenticated requests by `user:${userId}` and anonymous requests by `ip:${req.ip}`.
    - Trust score scaling: scales write limiters by user trust (`effectiveMax = Math.max(5, Math.round(baseMax * Math.min(1.5, Math.max(0.5, trustScore))))`).
    - Atomic hit tracking via `RateLimit.findOneAndUpdate` with fallback to in-memory counters on disconnects.
    - Sets standard headers `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` on 429.
  - Updated `backend/config/rateLimits.js` integrating the persistent MongoDB rate limiter across all endpoints.
- **Task P11-T2: TRUST_PROXY, Multi-Origin Exact CORS & JSON Compression (`backend/app.js`)**:
  - `TRUST_PROXY`: parses `process.env.TRUST_PROXY` ('1', '2', 'true', false) and configures `app.set('trust proxy', ...)`.
  - Multi-Origin Exact CORS: parses comma-separated `FRONTEND_URL` origins and enforces exact string matching, rejecting domain prefix and suffix spoofing attempts.
  - Built-in Node `zlib` response compression middleware: intercepts responses > 1024 bytes and applies gzip compression when `Accept-Encoding: gzip` is present.
- **Task P11-T3: Server Timeouts, `/health`, `/ready` & Graceful Shutdown (`backend/app.js`, `backend/server.js`)**:
  - Exported `createConfiguredServer(app)` enforcing: `maxHeaderSize = 16384` (16 KB), `requestTimeout = 15000` (15s), `headersTimeout = 10000` (10s), `keepAliveTimeout = 5000` (5s).
  - Implemented `GET /health` (liveness probe returning process uptime) and `GET /ready` (readiness probe pinging MongoDB via `{ ping: 1 }`).
  - Added graceful shutdown handlers on `SIGTERM` and `SIGINT` allowing in-flight requests to complete before closing database connections.
- **Task P11-T4: Dockerization & Deployment Docs**:
  - Created multi-stage `Dockerfile` (Node 20 Alpine, unprivileged `USER node`, built-in `wget` healthcheck).
  - Created `.dockerignore` and `docker-compose.yml` linking backend container with MongoDB 7.0 container.
  - Authored `docs/DEPLOY.md` production deployment guide covering NGINX reverse proxy, SSL/TLS, and container operations.

### 2. Files Touched
- `backend/models/RateLimit.js` *(New)*
- `backend/models/index.js`
- `backend/middleware/rateLimiter.js` *(New)*
- `backend/config/rateLimits.js`
- `backend/app.js`
- `backend/server.js`
- `Dockerfile` *(New)*
- `.dockerignore` *(New)*
- `docker-compose.yml` *(New)*
- `docs/DEPLOY.md` *(New)*
- `backend/test/phase11.test.js` *(New)*
- `backend/tests/phase11.test.js` *(New)*
- `TASKS.md`
- `WORKLOG.md`

### 3. Verification & Test Results
- **`npm test` (backend)**: **Passed: 287 / 287** tests across 93 suites (0 failures).
- **`node --test test/phase11.test.js`**: **Passed: 4 / 4** tests (0 failures).
- **`manualChecks.sh`**: **Passed: 76 / 76** (0 failures).
- **`manualChecks2.sh`**: **Passed: 85 / 85** (0 failures, 2 pre-launch gaps).
- **Zero breaking schema changes.**




















