# Master Build Tasks: Oddspot (Run: test 2)

## Phase Tracking (P0–P19, R1–R4, F1–F10)

### Foundation & Backend Phases (P0–P19)
- [x] **P0: Bootstrap, Test Safety & App Structure**
  - [x] Task P0-T1: Ensure on branch `antigravity/test-2`. Create `docs/PROJECT_CONTEXT.md` and `TASKS.md`.
  - [x] Task P0-T2: Install devDependencies (`supertest`, `mongodb-memory-server`).
  - [x] Task P0-T3: Split `backend/server.js` into `backend/app.js` and `backend/server.js`.
  - [x] Task P0-T4: Implement `assertSafeTestDatabase(uri)` in `backend/db.js` and `backend/test/setup.js`.
  - [x] Task P0-T5: Centralize `AUTH_RATE_LIMIT_MAX` & `WRITE_RATE_LIMIT_MAX` in `backend/config/rateLimits.js`.
  - [x] Task P0-T6: Create test suites in `backend/test/` and update `backend/package.json` test script.
  - [x] Task P0-T7: Build `backend/scripts/cleanupTestData.js` supporting `test_` and `test_2_`.
  - [x] Task P0-T8: Configure GitHub Actions CI in `.github/workflows/ci.yml`.
- [x] **P1: Immediate Fixes Without Schema Changes (K2-K6, K8, K9, K12-K14, K16)**
  - [x] Task P1-T1 (K13): Create `backend/utils/normalize.js` exporting `normalizeText(input, { maxLength, allowNewlines, fieldName })`. Enforce Unicode NFKC, strip control/zero-width chars, reject NUL bytes, and trim. Applied to title (140), body (10000), comment body (5000), tags (30), and place fields (100).
  - [x] Task P1-T2 (K2): Create `backend/utils/coordinates.js` exporting `parseStrictCoordinate` and `parseLngLat`. Validate bounds (lng -180..180, lat -90..90), reject (0, 0) Null Island with 400, and round to 6 decimal places. Applied to `POST /api/posts` and `GET /api/posts/nearby`.
  - [x] Task P1-T3 (K3 Part 1): Enforce max 100 char limit on `place.city`, `place.state`, and `place.country` in `backend/routes/posts.js`.
  - [x] Task P1-T4 (K5): In `backend/routes/posts.js`, enforce strict boolean type check for `hideExact`. Validate `warnings` array strictly against `['private_property', 'walking_required', 'unsafe_night', 'other']`.
  - [x] Task P1-T5 (K9): Enforce image constraints: max 6 images, HTTPS URL max 500 chars, integer width/height between 1 and 10000.
  - [x] Task P1-T6 (K4, K14): Validate `parentId` on comments (valid ObjectId, belongs to same post, not removed, max depth <= 3). Validate comments query `page` param (integer between 1 and 100 via `commentsQuerySchema`).
  - [x] Task P1-T7 (K6): Forbid self-voting: return 403 if `req.user.id === post.authorId`.
  - [x] Task P1-T8 (K8): In `backend/services/meter.js` `applyDelta()`, use `findOneAndUpdate` with `returnDocument: 'before'` and an aggregation pipeline ratchet so `tieredUp` fires exactly once on threshold crossing.
  - [x] Task P1-T9 (K12): Add middleware in `backend/app.js` adding `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache` on `/api/auth/*` and requests with `Authorization` headers.
  - [x] Task P1-T10 (K16): Correct inaccuracies in `WORKLOG.md` regarding bcrypt (Blowfish-derived/Eksblowfish cipher, not SHA-512) and smoke test migration count evolution (23 -> 32).
  - [x] Dedicated regression test suite: `backend/test/phase1.test.js` covering all backlog fixes.
- [ ] **P2: Posts CRUD & EXIF Sanitization**
- [ ] **P3: Voting, Like/Dislike Frequencies & Anti-Brigading**
- [ ] **P4: Comments & Atomic Score Pipelines**
- [ ] **P5: Meter Scoring & Regional City->Country Escalation**
- [ ] **P6: Moderation & Automatic Content Fuzzing**
- [ ] **P7: Account Security, Banning & Role Enforcement**
- [ ] **P8: Refresh Token Rotation & Session Hardening**
- [ ] **P9: Password Lifecycle, Email Tokens & Tombstoning**
- [ ] **P10: Concurrency, Atomic Transitions & Race Eliminator**
- [ ] **P11: Soft Delete & State Consistency**
- [ ] **P12: Idempotency Key Engine & Replay Cache**
- [ ] **P13: Counter Drift Reconciliation Utility**
- [ ] **P14: Central Error Mapping & Error Codes Envelope**
- [ ] **P15: Zod Schema Boundaries & Scalar Type Injection Guards**
- [ ] **P16: Input Normalization & Payload Size Caps**
- [ ] **P17: OpenAPI Specification & API Routing**
- [ ] **P18: Test Safety, In-Memory Replica Set & Assertions**
- [ ] **P19: Automated Test Data Cleanup Utility**

### Review & Hardening Phases (R1–R4)
- [ ] **R1: Security Review & Audit Findings Remediations**
- [ ] **R2: API Contract & Penetration Testing**
- [ ] **R3: Database Performance & Index Optimization**
- [ ] **R4: Final Pre-Release Verification & Hardening**

### Frontend & Integration Phases (F1–F10)
- [ ] **F1: React + Vite Setup & Environment Configuration**
- [ ] **F2: Auth Context, JWT Storage & 401 Interceptors**
- [ ] **F3: Navigation Shell & Modular Layout**
- [ ] **F4: Nearby Feed Page & Distance Badges**
- [ ] **F5: Post Creation Form & GPS Autofill**
- [ ] **F6: Post Detail Page & Safe Plaintext Rendering**
- [ ] **F7: Voting Controls & Realtime Score Updates**
- [ ] **F8: Comment Threads & Meter Integration**
- [ ] **F9: Moderation Reporting Modal & Safety UI**
- [ ] **F10: Frontend Production Build & CI Integration**
