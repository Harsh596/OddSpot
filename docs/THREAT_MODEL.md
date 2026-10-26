# Oddspot Threat Model & OWASP API Security Top 10 Audit

**Target:** Oddspot API (Phases P0–P5)  
**Run:** test 2 (Branch: `antigravity/test-2`)  
**Standard:** OWASP API Security Top 10 (2023 Edition)  
**Date:** October 2026  
**Status:** Comprehensive Red-Team Review 1 (R1)

---

## 1. Executive Summary & Architecture Overview

Oddspot is a location-sensitive community exploration platform enabling users to post, discover, vote on, and comment on unique real-world discoveries. Due to its location-based nature and community interactions, security priorities include:
1. **User Identity & Access Security:** Preventing unauthorized account takeover, session hijacking, credential stuffing, and privilege escalation.
2. **Object-Level & Functional Authorization:** Protecting posts, comments, and administrative capabilities against BOLA/BFLA.
3. **Location Privacy & Anti-Trilateration:** Ensuring exact GPS coordinates are never leaked when authors enable `hideExact` or when posts are reported as sensitive.
4. **Data Integrity & Concurrency:** Preventing race conditions in voting, comments, and meter score calculation.
5. **Input Validation & Injection Resistance:** Shielding the backend from NoSQL operator injection, prototype pollution, mass assignment, and buffer manipulation.

---

## 2. Threat Analysis: OWASP API Security Top 10:2023 Mapping

### API1:2023 — Broken Object Level Authorization (BOLA / IDOR)
- **OWASP Risk Description:** Attackers manipulate resource identifiers in API requests to access or modify resources belonging to other users.
- **Oddspot Attack Vectors:**
  - An authenticated user attempts to update another user's post via `PATCH /api/v1/posts/:id`.
  - An authenticated user attempts to delete another user's post via `DELETE /api/v1/posts/:id`.
  - An authenticated user attempts to modify or delete another user's comment via `PATCH /api/v1/comments/:id`, `DELETE /api/v1/comments/:id`, or nested `/api/v1/posts/:id/comments/:commentId`.
  - An author attempts to vote on their own post via `POST /api/v1/posts/:id/vote` to inflate their own meter score.
  - An author attempts to report their own post via `POST /api/v1/posts/:id/report` to trigger automatic fuzzing.
- **Affected Files & References:**
  - `backend/routes/posts.js`: Lines 340–344 (Post edit author check), Lines 395–402 (Post deletion author/staff check), Lines 453–458 (Self-voting author check), Lines 752–757 (Self-reporting author check), Lines 666–670 (Nested comment edit check), Lines 701–708 (Nested comment deletion check).
  - `backend/routes/comments.js`: Lines 28–32 (Comment edit check), Lines 60–67 (Comment deletion check).
- **Remediation & Current Defense:**
  - Every resource mutation explicitly compares `resource.authorId.toString() === req.user.id.toString()`.
  - Staff overrides (`moderator`, `admin`) are permitted only on deletion endpoints and trigger audit logs.
  - Unauthorized access attempts strictly return `403 FORBIDDEN`.
  - Self-voting is rejected with `403 FORBIDDEN`; self-reporting is rejected with `400 VALIDATION_FAILED`.
- **Severity:** HIGH  
- **Remediation Status:** REMEDIATED (Verified in `backend/test/redteam1.test.js`)

---

### API2:2023 — Broken Authentication
- **OWASP Risk Description:** Flaws in authentication mechanisms allow attackers to compromise passwords, keys, or session tokens, or assume other users' identities.
- **Oddspot Attack Vectors:**
  - Token signing with `alg: "none"` to bypass cryptographic verification.
  - Forged Key ID (`kid`) in JWT headers to trick token verification into using an attacker-controlled key.
  - Brute-force credential stuffing against `POST /api/auth/login`.
  - Concurrent replay of rotated refresh tokens to maintain persistent access.
  - Continued session use after password change or account suspension.
- **Affected Files & References:**
  - `backend/config/jwt.js`: Lines 4–9 (Secret length validation >= 32 chars), Lines 11–24 (Keyring validation).
  - `backend/services/token.js`: Lines 32–48 (`verifyAccessToken` algorithm enforcement, `algorithms: ['HS256']`, strict `kid` check), Lines 76–115 (`rotateRefreshToken` atomic replacement and family revocation).
  - `backend/middleware/auth.js`: Lines 9–37 (`requireAuth` token verification), Lines 58–62 (Banned status check), Lines 65–74 (`tokenVersion` check), Lines 77–85 (`passwordChangedAt` invalidation).
  - `backend/routes/auth.js`: Lines 110–135 (Equalized login timing with `DUMMY_HASH`, per-account lockout after 5 failures).
- **Remediation & Current Defense:**
  - `verifyAccessToken` explicitly forbids `alg: 'none'` and enforces `algorithms: ['HS256']`.
  - If a `kid` header is present, it must strictly exist in the server keyring; unknown `kid` headers throw an error and return 401.
  - Refresh tokens are hashed (SHA-256) in the database and atomically rotated via `findOneAndUpdate`. Token reuse immediately revokes all tokens in the `familyId` and increments `tokenVersion`.
  - Login timing is equalized with dummy bcrypt comparisons to prevent account enumeration, with 15-minute lockouts after 5 consecutive failures.
- **Severity:** CRITICAL  
- **Remediation Status:** REMEDIATED (Verified in `backend/test/wave2.test.js` & `backend/test/redteam1.test.js`)

---

### API3:2023 — Broken Object Property Level Authorization (Mass Assignment & Excessive Data Exposure)
- **OWASP Risk Description:** Lack of validation on request properties allows callers to modify object properties they should not be allowed to modify (Mass Assignment), or API responses expose sensitive object properties (Excessive Data Exposure).
- **Oddspot Attack Vectors:**
  - Attacker sets `role: 'admin'`, `trust: 100`, `banned: false`, or `tokenVersion: 99` during signup.
  - Attacker sets `meter`, `tier`, `authorId`, `removed`, or `solved` during post creation or update.
  - Attacker modifies immutable fields (`latitude`, `longitude`, `location`, `place`, `hideExact`) during `PATCH /posts/:id`.
  - Public profile endpoint (`GET /api/v1/users/:username`) leaks email, password hash, role, or ban status.
  - Post endpoints leak exact coordinates of posts marked `hideExact: true`.
- **Affected Files & References:**
  - `backend/validators/auth.validators.js`: Lines 15–35 (`signupSchema` strips unexpected fields).
  - `backend/validators/posts.validators.js`: Lines 110–160 (`createPostSchema` with `.strict()`), Lines 405–440 (`updatePostSchema` forbidding location and internal properties).
  - `backend/routes/users.js`: Lines 18–35 (Strict public projection for profile queries).
  - `backend/routes/posts.js`: Lines 33–55 (`sanitizePost` coordinate fuzzing and exclusion).
- **Remediation & Current Defense:**
  - Zod schemas use `.strict()` mode across all write routes, rejecting unexpected properties with `400 VALIDATION_FAILED`.
  - `authorId` is always bound strictly from the authenticated JWT session, never accepted from request body.
  - Public user profiles expose only `{ id, username, avatarUrl, bio, homePlace, stats, badges, createdAt }`.
  - Hidden posts fuzz coordinates and quantize distances to 500m increments before responding.
- **Severity:** HIGH  
- **Remediation Status:** REMEDIATED (Verified in `backend/test/phase5.test.js` & `backend/test/redteam1.test.js`)

---

### API4:2023 — Unrestricted Resource Consumption
- **OWASP Risk Description:** APIs without proper limits on request size, rate, or compute resources can be overwhelmed, leading to Denial of Service (DoS) or unexpected operational costs.
- **Oddspot Attack Vectors:**
  - Attacker sends massive payloads (> 100 KB) or deeply nested JSON structures (4000+ levels) to exhaust memory or parser stacks.
  - Attacker floods nearby feed queries with huge radii or negative pagination bounds to force full collection scans.
  - Attacker spams authentication routes to exhaust bcrypt hashing threads.
- **Affected Files & References:**
  - `backend/middleware/bodyLimit.js`: Lines 8–24 (Enforces per-route JSON body limits: 2KB auth, 20-50KB posts, 10KB comments, 100KB default).
  - `backend/config/rateLimits.js`: Lines 10–35 (Centralized rate limiters: `authLimiter`, `writeLimiter`, `commentLimiter`, `voteLimiter`).
  - `backend/routes/posts.js`: Lines 120–180 (Capped pagination limit <= 50, snapped distance radius max 50km).
  - `backend/db.js`: Lines 25–45 (Global `maxTimeMS(5000)` timeout plugin).
- **Remediation & Current Defense:**
  - `express.json` limits are enforced per-route.
  - Feed queries snap distance to pre-calculated buckets and cap `limit` at 50 posts.
  - Global MongoDB queries have a 5000ms execution timeout preventing unindexed queries from hanging the server.
- **Severity:** MEDIUM-HIGH  
- **Remediation Status:** REMEDIATED (Verified in `backend/scripts/manualChecks.sh` and `manualChecks2.sh`)

---

### API5:2023 — Broken Function Level Authorization (BFLA / RBAC)
- **OWASP Risk Description:** Endpoints that should be restricted to privileged administrative or moderation roles are accessible to regular users due to missing authorization checks.
- **Oddspot Attack Vectors:**
  - Regular members deleting other users' posts or comments by invoking moderation capabilities.
  - Regular members accessing or modifying audit logs.
- **Affected Files & References:**
  - `backend/middleware/auth.js`: Lines 99–120 (`requireRole(...allowedRoles)` middleware).
  - `backend/routes/posts.js`: Lines 382–428 (Moderator post soft-delete with mandatory audit logging).
  - `backend/routes/comments.js`: Lines 47–92 (Moderator comment soft-delete with mandatory audit logging).
  - `backend/services/audit.js`: Lines 10–45 (Audit log recording service).
- **Remediation & Current Defense:**
  - RBAC checks pull user roles strictly from the database, never from JWT claims.
  - Role verification middleware (`requireRole('moderator', 'admin')`) guards administrative endpoints.
  - Every administrative action generates an immutable `AuditLog` entry tracking `actorId`, `action`, `targetType`, `targetId`, and `reason`.
- **Severity:** HIGH  
- **Remediation Status:** REMEDIATED (Verified in `backend/test/phase5.test.js`)

---

### API6:2023 — Unrestricted Access to Sensitive Business Flows
- **OWASP Risk Description:** APIs expose business workflows that can be automated or abused by attackers without proper throttling, idempotency, or concurrency guards.
- **Oddspot Attack Vectors:**
  - Concurrent voting race conditions causing vote count and score drift in `post.meter`.
  - Duplicate reporting by a single user or coordinated sybil attacks to trigger automated post fuzzing (`hideExact: true`).
  - Rapid double-submission of comments or posts causing duplicate entries.
- **Affected Files & References:**
  - `backend/services/meter.js`: Lines 24–96 (`applyDelta` atomic aggregation pipeline), Lines 102–179 (`castVote` inside `withTransaction`).
  - `backend/middleware/idempotency.js`: Lines 15–90 (Idempotency key lock engine and response replay cache).
  - `backend/routes/posts.js`: Lines 759–788 (Duplicate report suppression via compound unique index).
  - `backend/scripts/reconcileCounters.js`: Lines 14–131 (Counter reconciliation audit utility).
- **Remediation & Current Defense:**
  - Voting operations execute inside MongoDB multi-document transactions with atomic aggregation updates, guaranteeing zero drift under concurrent execution.
  - Idempotency key engine enforces payload locking (409) and response replay (200) on critical write paths.
  - Reports enforce `{ reporterId: 1, targetType: 1, targetId: 1 }` unique constraint, blocking duplicate reports.
- **Severity:** HIGH  
- **Remediation Status:** REMEDIATED (Verified in `backend/test/redteam1.test.js`)

---

### API7:2023 — Server-Side Request Forgery (SSRF)
- **OWASP Risk Description:** The API fetches remote resources based on user-supplied URLs without properly validating the destination, allowing attackers to access internal network services or cloud metadata.
- **Oddspot Attack Vectors:**
  - Attacker submits cloud metadata IP (`http://169.254.169.254/latest/meta-data/`) or loopback (`http://127.0.0.1/admin`) in post image URLs.
  - Attacker uses `file://`, `data:`, or `javascript:` URI schemes.
- **Affected Files & References:**
  - `backend/validators/posts.validators.js`: Lines 13–25 (`isSecureImageUrl` function), Lines 28–70 (`imageSchema`).
- **Remediation & Current Defense:**
  - Image URLs are strictly validated to require the `https:` scheme in production.
  - `javascript:`, `data:`, and `file:` protocols are unconditionally rejected with `400 VALIDATION_FAILED`.
  - The backend stores and serves verified HTTPS image URLs without fetching or proxying remote image bodies, eliminating server-side network SSRF vectors.
- **Severity:** MEDIUM  
- **Remediation Status:** REMEDIATED (Verified in `backend/scripts/manualChecks.sh`)

---

### API8:2023 — Security Misconfiguration
- **OWASP Risk Description:** Missing security hardening, overly permissive CORS policies, unhandled error leaks, or default credentials leave the API vulnerable to reconnaissance and exploitation.
- **Oddspot Attack Vectors:**
  - Permissive CORS (`Access-Control-Allow-Origin: *` or echoing untrusted origins).
  - Stack traces or Mongoose database internals leaked in 500 error responses.
  - Information disclosure via `X-Powered-By` server headers.
  - Sensitive cached responses on public caches or shared proxies.
- **Affected Files & References:**
  - `backend/app.js`: Lines 30–50 (CORS origin validation), Lines 52–65 (Helmet security headers), Lines 68–78 (`Cache-Control: no-store` on authenticated routes).
  - `backend/middleware/errorHandler.js`: Lines 10–60 (Standardized dual-compatible error responses, stack trace suppression).
- **Remediation & Current Defense:**
  - CORS strictly validates against allowed origins (`ORIGIN` environment variable) and rejects wildcard origins on credentials-bearing endpoints.
  - `X-Powered-By` is stripped; `X-Content-Type-Options: nosniff` is enforced.
  - All authenticated responses send `Cache-Control: no-store, no-cache, must-revalidate` and `Pragma: no-cache`.
  - All API errors follow the uniform dual-compatible error envelope (`error`, `code`, `message`, `details`) with 0 stack trace leakage.
- **Severity:** MEDIUM-HIGH  
- **Remediation Status:** REMEDIATED (Verified in `backend/scripts/manualChecks.sh`)

---

### API9:2023 — Improper Inventory Management
- **OWASP Risk Description:** Lack of API documentation, unversioned endpoints, or deprecated API endpoints that remain active with outdated security controls.
- **Oddspot Attack Vectors:**
  - Attackers invoking unmaintained legacy routes (`/api/*`) to bypass security controls implemented on versioned routes (`/api/v1/*`).
  - Lack of API contract documentation allowing undocumented endpoints to escape automated security testing.
- **Affected Files & References:**
  - `backend/app.js`: Lines 120–145 (Mounting versioned routes at `/api/v1` with legacy compatibility aliasing).
  - `backend/openapi/spec.js`: OpenAPI 3.1.0 document detailing all operational endpoints, schemas, parameters, and authentication requirements.
  - `backend/routes/posts.js`: Lines 388–393 (`DELETE /posts/:id` restricted to `/api/v1/posts/:id` with 405 Method Not Allowed on legacy path).
- **Remediation & Current Defense:**
  - Formal OpenAPI 3.1 contract served at `/api/openapi.json` and compiled to `docs/openapi.json`.
  - Routes explicitly mounted under `/api/v1` namespace.
  - Deprecated and unversioned endpoints have guardrails preventing security regression.
- **Severity:** LOW-MEDIUM  
- **Remediation Status:** REMEDIATED (Verified in `backend/test/openapiContract.test.js`)

---

### API10:2023 — Unsafe Consumption of APIs & Injections
- **OWASP Risk Description:** Trusting inputs without sanitization allows SQL/NoSQL injection, Prototype Pollution, or command injection to alter execution logic.
- **Oddspot Attack Vectors:**
  - MongoDB operator injection (`{ "$gt": "" }`, `{ "$ne": null }`) passed via JSON bodies or query strings to bypass authentication or extract data.
  - Prototype pollution attacks (`__proto__`, `constructor.prototype`) attempting to modify global JavaScript Object properties.
  - NUL byte injection (`\0`) or control character manipulation to bypass string length checks.
- **Affected Files & References:**
  - `backend/db.js`: Lines 18–35 (`mongoose.set('sanitizeFilter', true)` and `trustQueryOperators` plugin).
  - `backend/utils/normalize.js`: Lines 10–55 (Unicode NFKC normalization, NUL byte rejection, control/zero-width character stripping).
  - `backend/validators/common.js`: Lines 20–80 (Strict scalar type validation rejecting objects where primitives are expected).
- **Remediation & Current Defense:**
  - Mongoose `sanitizeFilter` wraps untrusted user objects to block MongoDB operator injection.
  - All textual inputs undergo Unicode NFKC normalization and NUL byte rejection.
  - Object prototype remains clean against `__proto__` and constructor manipulation attempts.
- **Severity:** CRITICAL  
- **Remediation Status:** REMEDIATED (Verified in `backend/test/redteam1.test.js`)

---

## 3. Red-Team Pass 1 Verification Summary

| OWASP API Category | Primary Mitigations in Oddspot | Exploit Test Suite | Status |
|---|---|---|---|
| **API1: BOLA / IDOR** | Strict `authorId` ownership check; 403 on non-author mutation; self-vote 403 | `redteam1.test.js` (Test 1) | **REMEDIATED** |
| **API2: Broken Auth** | HS256 strict alg, kid keyring check, rotating refresh tokens with reuse detection | `redteam1.test.js` (Tests 3 & 4) | **REMEDIATED** |
| **API3: Mass Assignment** | Zod `.strict()` & `.strip()`, scalar type guards, public profile safe projection | `redteam1.test.js` (Test 2) | **REMEDIATED** |
| **API4: Resource Limits** | Per-route byte limits, pagination caps, query timeouts, rate limiting | `manualChecks.sh` / `manualChecks2.sh` | **REMEDIATED** |
| **API5: BFLA / RBAC** | DB-backed `requireRole` middleware, immutable `AuditLog` collection | `phase5.test.js` | **REMEDIATED** |
| **API6: Business Flows** | Atomic transaction voting, Idempotency-Key locks, unique report indexes | `redteam1.test.js` (Test 5) | **REMEDIATED** |
| **API7: SSRF** | HTTPS scheme enforcement, rejection of data/file/javascript protocols | `manualChecks.sh` | **REMEDIATED** |
| **API8: Misconfiguration** | Strict CORS whitelist, helmet headers, dual-compatible error envelopes | `manualChecks.sh` | **REMEDIATED** |
| **API9: Inventory** | `/api/v1` route versioning, OpenAPI 3.1.0 specification, contract test suite | `openapiContract.test.js` | **REMEDIATED** |
| **API10: Injection** | Mongoose `sanitizeFilter`, Unicode NFKC normalization, scalar type guards | `redteam1.test.js` (Test 2) | **REMEDIATED** |
