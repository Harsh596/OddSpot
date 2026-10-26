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
- [ ] **P1: Core Geolocation & Snapped Radius Feeds**
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
