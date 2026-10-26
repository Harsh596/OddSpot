# Oddspot Project Context

## Overview
Oddspot is a location-based forum where people post weird things they find in the real world, and others nearby can go visit them.
Operating on branch: `antigravity/test-2` (Master Build Brief - Run: test 2).

---

## 1. Guardrails (Verbatim)
- **Git**: Work only on branch `antigravity/test-2` with local commits and tags. Never push, force-push, rebase, or touch other branches.
- **Environment**: Never read, log, or modify real values in `backend/.env`. Only edit `.env.example` files.
- **Database Safety**: Never drop or delete existing database collections. Tests may only create and delete `test_*` or `test_2_*` records.
- **Schema & Dependencies**: Make only pre-approved schema changes; log any new dependency with justification. Stop and ask: don't change Mongoose models or add collections without explicit approval.
- **Testing Integrity**: Never weaken an existing test to make it pass.
- **Audit Logging**: Append to `WORKLOG.md`: changes, touched files, test runs, and decisions.
- **No Paid/Keyed Services**: Don't add services that need keys. If something needs a key, skip it and log it.
- **Simplicity**: When unsure, take the safest simple option, note it in `WORKLOG.md`, and continue.

---

## 2. All 12 Pre-Approved Architectural Decisions

### Decision 1: IdempotencyKey Model & 24h TTL
- Dedicated `IdempotencyKey` collection tracking client request state on critical write endpoints (`POST /api/posts`, `POST /api/posts/:id/comments`).
- Compound unique index on `{ userId: 1, key: 1 }` and 24-hour TTL index on `createdAt` (`expireAfterSeconds: 86400`).
- 60-second in-flight lock timeout allowing stalled/hung requests to be re-acquired rather than locked out for 24 hours.
- Returns cached response on exact payload replay; returns 422 `IDEMPOTENCY_KEY_MISMATCH` if payload parameters change; returns 409 `IDEMPOTENCY_IN_FLIGHT` on concurrent execution.

### Decision 2: Soft Delete (`removed: true`) Everywhere
- Post and Comment models include `removed: { type: Boolean, default: false }`.
- All queries, feeds, comments, vote lookups, and counter reconciliations strictly enforce `{ removed: { $ne: true } }`.
- Soft-deleted comments and posts are excluded from score recalculation and tier ratcheting.
- Guardrail: User, Vote, Report, and Phase 2 models are not soft-deleted.

### Decision 3: MongoMemoryReplSet for Automated Testing
- Uses 1-node `MongoMemoryReplSet` (`count: 1, dbName: 'oddspot_test'`) in test setup and smoke tests.
- Allows native multi-document MongoDB transactions (`session.withTransaction`) in CI and local test suites without requiring external Atlas replica sets.

### Decision 4: User Model & Case-Insensitive Uniqueness
- Added indexed shadow field `usernameLower: { type: String, required: true, unique: true, lowercase: true, trim: true }`.
- `pre('validate')` hook automatically synchronizes `usernameLower`.
- Reserved usernames blocked case-insensitively on signup: `['admin', 'root', 'support', 'oddspot', 'moderator', 'mod', 'system', 'null', 'undefined']`.
- Strict ASCII username regex: `/^[a-zA-Z0-9_]+$/`.
- Emails normalized (trimmed, lowercase) with unique index.

### Decision 5: Password Requirements & Embedded Blocklist
- Password byte length validated between 8 and 72 bytes via `Buffer.byteLength(password, 'utf8')`, preventing silent bcrypt truncation.
- Rejects NUL characters (`\0` / `\u0000`).
- Checked against an embedded top common passwords blocklist with O(1) memory lookup without adding external dependencies.

### Decision 6: Hashed Rotating Refresh Tokens & Reuse Detection
- Dedicated `RefreshToken` collection storing SHA-256 hashed tokens (`tokenHash`), lineage `familyId`, `userId`, `revoked` flag, and TTL expiration index on `expiresAt`.
- Atomic token rotation on `POST /api/auth/refresh`.
- If a revoked token is reused, the entire token family (`familyId`) is revoked immediately (`code: 'TOKEN_REUSE_DETECTED'`).
- `POST /api/auth/logout` revokes current session; `POST /api/auth/logout-all` invalidates all user refresh tokens and bumps `passwordChangedAt`.

### Decision 7: JWT Access Tokens & Dynamic DB Role Check
- Access tokens have a 15-minute lifetime (`expiresIn: '15m'`).
- Payload contains strictly `{ id, username }`. The `role` claim is explicitly excluded from JWT payload to prevent stale authorization leaks.
- Role and ban status checked against DB on protected requests with at most 30-second cache (`CACHE_TTL_MS = 30000`).
- Tokens issued prior to `passwordChangedAt` are rejected.

### Decision 8: Pluggable Mailer & Enumeration-Safe Endpoints
- Pluggable mailer service captures emails in memory during tests and outputs to console in dev; requires zero external API keys.
- `POST /api/auth/forgot-password` and `POST /api/auth/resend-verification` return identical generic responses regardless of user existence.
- Verification and reset tokens stored exclusively as SHA-256 hashes with short expiry (15m reset, 24h verification).

### Decision 9: Secure Account Deletion & Contribution Tombstoning
- `DELETE /api/auth/me` requires `currentPassword` verified via bcrypt.
- Executes inside a transaction: reassigns user posts and comments to system tombstone ID `000000000000000000000000` (`TOMBSTONE_USER_ID`), revokes all refresh tokens, evicts cache, and deletes the user document.

### Decision 10: Equalized Login Timing & Per-Account Lockout
- `POST /api/auth/login` unconditionally executes `bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)` before evaluating lockout or account ban status.
- Prevents response timing analysis from revealing account existence.
- Per-account lockout locks after 5 consecutive failed attempts for 15 minutes (`lockUntil`).
- Lockout status never returns 429 (prevents account enumeration); returns identical 401 error.

### Decision 11: Zod Route Validation & Contract Boundary Hardening
- One Zod schema per route in `validators/` with `.strict()` mode to reject unexpected fields with 400.
- Scalar checks reject NoSQL operator injection objects (`{ $gt: '' }`) where scalars are expected.
- Strips zero-width and control characters from text inputs. Rejects strings containing only zero-width/control characters.
- Strict per-route payload size limits (e.g. 2KB login, 20KB post, 10KB comment, 100KB default).

### Decision 12: Dual-Compatible Error Envelope & API Versioning
- Error responses follow dual-compatible format:
  ```json
  {
    "error": "<message>",
    "code": "<CODE>",
    "message": "<message>",
    "details": [...]
  }
  ```
- All routes mounted under `/api/v1` and aliased to `/api`.
- OpenAPI 3.1 specification generated at `backend/docs/openapi.json` and served at `GET /api/openapi.json`.

---

## 3. Pre-Approved Schema Changes

1. **`User` Model**:
   - `usernameLower`: `{ type: String, required: true, unique: true, lowercase: true, trim: true }`
   - `emailVerified`: `{ type: Boolean, default: false }`
   - `emailVerificationTokenHash`: `{ type: String }`
   - `emailVerificationExpires`: `{ type: Date }`
   - `passwordResetTokenHash`: `{ type: String }`
   - `passwordResetExpires`: `{ type: Date }`
   - `failedLoginAttempts`: `{ type: Number, default: 0 }`
   - `lockUntil`: `{ type: Date }`
   - `passwordChangedAt`: `{ type: Date }`

2. **`RefreshToken` Model** (New Collection):
   - `userId`: `{ type: ObjectId, ref: 'User', required: true, index: true }`
   - `tokenHash`: `{ type: String, required: true, unique: true }`
   - `familyId`: `{ type: String, required: true, index: true }`
   - `revoked`: `{ type: Boolean, default: false }`
   - `expiresAt`: `{ type: Date, required: true, index: { expireAfterSeconds: 0 } }`

3. **`IdempotencyKey` Model** (New Collection):
   - `key`: `{ type: String, required: true }`
   - `userId`: `{ type: ObjectId, ref: 'User', required: true }`
   - `endpoint`: `{ type: String, required: true }`
   - `requestHash`: `{ type: String, required: true }`
   - `status`: `{ type: String, enum: ['pending', 'completed'], default: 'pending' }`
   - `statusCode`: `{ type: Number }`
   - `responseBody`: `{ type: mongoose.Schema.Types.Mixed }`
   - `lockedAt`: `{ type: Date, default: Date.now }`
   - `createdAt`: `{ type: Date, default: Date.now, index: { expireAfterSeconds: 86400 } }`
   - Compound index: `{ userId: 1, key: 1 }` (unique)

4. **`Post` & `Comment` Models**:
   - `removed`: `{ type: Boolean, default: false, index: true }`
