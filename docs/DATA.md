# Oddspot Database & Data Architecture Specification

This document provides the authoritative data dictionary, collection schemas, index strategies, time-to-live (TTL) policies, and counter mutation matrix for the Oddspot platform.

---

## 1. Database Architecture & Storage Budget

Oddspot is backed by **MongoDB Atlas** (specifically tuned for deployment on free M0 clusters with a strict **512 MB storage limit**).

### 1.1 Storage Strategy & Operational Guardrails

1. **Zero Binary Storage**: The database stores **zero binary blobs**. All images are hosted on external CDNs or object storage (Cloudinary, Cloudflare R2, AWS S3). Database records store only validated HTTPS URLs, width, and height.
2. **Aggressive TTL Indexes**: Transient operational records (`notifications`, `refreshtokens`, `emailtokens`, `idempotencykeys`, `ratelimits`) automatically expire via background MongoDB TTL threads.
3. **Soft Alerts at 400 MB**: Automated monitoring (`backend/scripts/storageReport.js`) emits alerts when database size exceeds 400 MB (~78% of the M0 tier capacity).
4. **Denormalized Counters with Nightly Reconciliation**: Read-heavy metrics (`meter.score`, `memberCount`, `stats.posts`) are denormalized for sub-millisecond retrieval and reconciled nightly against source-of-truth ledgers.

---

## 2. Complete Collection Schema Dictionary

The system manages **17 collections**:

```
+---------------------------------------------------------------------------------+
|                               ODDSPOT COLLECTIONS                               |
+---------------------------------------------------------------------------------+
| 1. users          | 6. communities    | 11. refreshtokens   | 16. ratelimits    |
| 2. posts          | 7. memberships    | 12. emailtokens     | 17. schemaversions|
| 3. votes          | 8. visits         | 13. idempotencykeys |                   |
| 4. comments       | 9. reports        | 14. auditlogs       |                   |
| 5. postcommenters | 10. notifications | 15. joblocks        |                   |
+---------------------------------------------------------------------------------+
```

---

### 2.1 Collection: `users`
**Model:** `User` (`backend/models/User.js`)  
**Purpose:** Account identity, credentials, permission roles, user preferences, earned badges, and exploration stats.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `username` | `String` | Yes | — | Unique | Display username (3..24 chars) |
| `usernameLower` | `String` | Yes | — | Unique | Normalized lowercase username for lookups |
| `email` | `String` | Yes | — | Unique | User contact email |
| `emailLower` | `String` | Yes | — | Index | Normalized lowercase email |
| `passwordHash` | `String` | Yes | — | Hidden (`select: false`) | Bcrypt password hash (10 rounds) |
| `avatarUrl` | `String` | No | — | — | Validated HTTPS image URL |
| `bio` | `String` | No | — | — | Profile text (max 300 chars) |
| `homePlace` | `Object` | No | `{}` | — | `{ city, state, country }` |
| `role` | `String` | Yes | `'member'` | — | Enum: `'member'`, `'moderator'`, `'admin'` |
| `emailVerified` | `Boolean` | Yes | `false` | — | Whether email verification is complete |
| `emailVerifiedAt` | `Date` | No | `null` | — | Verification completion timestamp |
| `ageConfirmedAt` | `Date` | No | `null` | — | Age compliance confirmation timestamp |
| `tokenVersion` | `Number` | Yes | `0` | — | Incremented to invalidate all active JWTs |
| `failedLoginAttempts` | `Number` | Yes | `0` | — | Consecutive failed logins |
| `lockUntil` | `Date` | No | `null` | — | Lockout expiration timestamp |
| `passwordChangedAt` | `Date` | No | `null` | — | Password update timestamp |
| `shadowBanned` | `Boolean` | Yes | `false` | Index | Shadow-ban state (suppresses public visibility) |
| `trust` | `Mixed` | Yes | `0` | — | Calculated trust score |
| `theme` | `Mixed` | No | `{}` | — | Theme preferences (presets, custom hex colors) |
| `profileLayout` | `Mixed` | No | `{}` | — | Widget ordering (`badges`, `stats`, `tabs`) |
| `feedConfig` | `Object` | No | `{ mode: 'default' }` | — | Custom discovery rules (`mode`, `rules`) |
| `stats.posts` | `Number` | Yes | `0` | — | Denormalized count of published spots |
| `stats.visits` | `Number` | Yes | `0` | — | Denormalized count of verified visits |
| `badges` | `[String]` | Yes | `[]` | — | Earned badges (`'scout'`, `'first_visit'`, etc.) |
| `onboardingDone` | `Boolean` | Yes | `false` | — | Whether user completed initial scout tour |
| `banned` | `Boolean` | Yes | `false` | — | Administrative ban status |
| `createdAt` | `Date` | Yes | Auto | — | Mongoose timestamp |
| `updatedAt` | `Date` | Yes | Auto | — | Mongoose timestamp |

**Indexes:**
- `{ usernameLower: 1 }` (unique)
- `{ emailLower: 1 }` (unique)
- `{ shadowBanned: 1 }`

---

### 2.2 Collection: `posts`
**Model:** `Post` (`backend/models/Post.js`)  
**Purpose:** Physical landmarks, urban oddities, geo coordinates, Oddometer engagement meters, and tier status.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `authorId` | `ObjectId` | Yes | — | Index | Ref: `User` (or tombstone `00000...`) |
| `communityId` | `ObjectId` | No | — | Index | Ref: `Community` |
| `type` | `String` | Yes | `'find'` | — | Enum: `'find'`, `'identify'` |
| `title` | `String` | Yes | — | — | Spot title (1..140 chars) |
| `body` | `String` | No | `""` | — | Markdown field guide (max 10000 chars) |
| `images` | `[Image]` | No | `[]` | — | Array of `{ url, width, height }` (max 6) |
| `location` | `Point` | Yes | — | `2dsphere` | Exact GeoJSON coordinates `[lng, lat]` |
| `feedLocation` | `Point` | Yes | — | `2dsphere` | Fuzzed GeoJSON coordinates `[lng, lat]` |
| `hideExact` | `Boolean` | Yes | `false` | — | When true, API serves `feedLocation` to scouts |
| `place.city` | `String` | Yes | — | — | City name |
| `place.cityKey` | `String` | Yes | — | Index | Normalized slugified city key (`toCityKey`) |
| `place.state` | `String` | No | — | — | State or region name |
| `place.country` | `String` | Yes | — | — | Country name |
| `place.countryCode` | `String` | Yes | — | Index | ISO 2-letter country code |
| `tags` | `[String]` | No | `[]` | — | Exploration tags (e.g. `'neon'`, `'statue'`) |
| `warnings` | `[String]` | No | `[]` | — | Safety warnings (`'private_property'`, etc.) |
| `tier` | `String` | Yes | `'city'` | Index | Enum: `'city'`, `'state'`, `'country'` |
| `meter.score` | `Number` | Yes | `0` | Index | Calculated Oddometer score: $S = 1 \cdot L - 0.5 \cdot D + 3 \cdot C_{\text{unique}} + 4 \cdot V + 5 \cdot R$ |
| `meter.likes` | `Number` | Yes | `0` | — | Denormalized upvote count |
| `meter.dislikes` | `Number` | Yes | `0` | — | Denormalized downvote count |
| `meter.comments` | `Number` | Yes | `0` | — | Denormalized comment count |
| `meter.commenters` | `Number` | Yes | `0` | — | Denormalized unique non-author commenter count ($C_{\text{unique}}$) |
| `meter.visits` | `Number` | Yes | `0` | — | Denormalized verified visit count |
| `meter.reactions` | `Number` | Yes | `0` | — | Denormalized total reaction count |
| `lastEngagedAt` | `Date` | Yes | `Date.now` | — | Timestamp of most recent interaction |
| `spotStatus` | `String` | Yes | `'still_there'` | — | Enum: `'still_there'`, `'gone'`, `'changed'` |
| `solved` | `Boolean` | Yes | `false` | — | Marked true when an 'identify' spot is solved |
| `bestCommentId` | `ObjectId` | No | `null` | — | Ref: `Comment` (solver comment) |
| `hotScore` | `Number` | Yes | `0` | Index | Logarithmic decay hot rank score |
| `underReview` | `Boolean` | Yes | `false` | — | Auto-hidden from public feeds pending review |
| `velocityFrozen` | `Boolean` | Yes | `false` | Index | Anti-brigading lock (freezes meter score) |
| `shadowBannedAuthor` | `Boolean` | Yes | `false` | Index | Whether creator was shadow-banned |
| `removed` | `Boolean` | Yes | `false` | — | Soft-deleted flag |

**Compound & Geospatial Indexes:**
- `{ location: '2dsphere' }`
- `{ feedLocation: '2dsphere' }`
- `{ 'place.cityKey': 1, 'place.countryCode': 1, createdAt: -1, _id: -1 }` (City New feed)
- `{ 'place.cityKey': 1, 'place.countryCode': 1, 'meter.score': -1, _id: -1 }` (City Top feed)
- `{ 'place.cityKey': 1, 'place.countryCode': 1, hotScore: -1, _id: -1 }` (City Hot feed)
- `{ tier: 1, 'place.countryCode': 1, createdAt: -1, _id: -1 }` (Country New feed)
- `{ tier: 1, 'place.countryCode': 1, 'meter.score': -1, _id: -1 }` (Country Top feed)
- `{ tier: 1, 'place.countryCode': 1, hotScore: -1, _id: -1 }` (Country Hot feed)
- `{ communityId: 1, createdAt: -1 }`
- `{ authorId: 1, createdAt: -1 }`

---

### 2.3 Collection: `votes`
**Model:** `Vote` (`backend/models/Vote.js`)  
**Purpose:** Ledger of user votes ensuring strictly one vote per user per post.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `userId` | `ObjectId` | Yes | — | Index | Ref: `User` |
| `postId` | `ObjectId` | Yes | — | Index | Ref: `Post` |
| `value` | `Number` | Yes | — | — | `1` (like) or `-1` (dislike) |
| `createdAt` | `Date` | Yes | Auto | — | Vote creation timestamp |
| `updatedAt` | `Date` | Yes | Auto | — | Vote change timestamp |

**Indexes:**
- `{ userId: 1, postId: 1 }` (unique compound index)
- `{ postId: 1 }`

---

### 2.4 Collection: `comments`
**Model:** `Comment` (`backend/models/Comment.js`)  
**Purpose:** Hierarchical threaded discussion attached to spots.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `postId` | `ObjectId` | Yes | — | Index | Ref: `Post` |
| `authorId` | `ObjectId` | Yes | — | Index | Ref: `User` |
| `parentId` | `ObjectId` | No | `null` | Index | Ref: `Comment` (for depth $\le 3$ threading) |
| `body` | `String` | Yes | — | — | Markdown discussion text (max 5000 chars) |
| `edited` | `Boolean` | Yes | `false` | — | Whether comment was modified |
| `editedAt` | `Date` | No | `null` | — | Timestamp of modification |
| `shadowBannedAuthor` | `Boolean`| Yes | `false` | Index | Shadow-ban flag |
| `removed` | `Boolean` | Yes | `false` | — | Soft deletion flag |
| `createdAt` | `Date` | Yes | Auto | — | Timestamp |
| `updatedAt` | `Date` | Yes | Auto | — | Timestamp |

**Indexes:**
- `{ postId: 1, createdAt: 1 }`
- `{ parentId: 1 }`
- `{ shadowBannedAuthor: 1 }`

---

### 2.5 Collection: `postcommenters` (Distinct Commenter Ledger)
**Model:** `PostCommenter` (`backend/models/PostCommenter.js`)  
**Logical Structure & Compound Abstraction:**  
To prevent Sybil spam networks from inflating the Oddometer comment count by having a single account post 50 comments, the system tracks distinct commenters. Only the first non-removed comment by a non-author user contributes to `meter.commenters` (+1) and `meter.score` (+3). Subsequent comments by the same user do not inflate the score.

| Field | Type | Description |
|---|---|---|
| `postId` | `ObjectId` | The post receiving comments |
| `userId` | `ObjectId` | The distinct non-author commenter |
| `weightApplied` | `Number` | Account weight applied to score (e.g. 1.0) |
| `createdAt` | `Date` | Timestamp of first contribution |

**Indexes:**
- `{ postId: 1, userId: 1 }` (unique)

---

### 2.6 Collection: `communities`
**Model:** `Community` (`backend/models/Community.js`)  
**Purpose:** Local and topical chapters (e.g. "Seattle Oddities", "Abandoned Railways").

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `name` | `String` | Yes | — | Text | Community name (max 60 chars) |
| `slug` | `String` | Yes | — | Unique | URL-safe identifier (e.g. `'neon-hunting'`) |
| `description` | `String` | No | `""` | Text | Community bio (max 500 chars) |
| `iconUrl` | `String` | No | `null` | — | Validated HTTPS icon URL |
| `scope` | `String` | Yes | `'city'` | — | Enum: `'city'`, `'country'`, `'interest'` |
| `place` | `Object` | No | `{}` | Index | Local jurisdiction `{ city, state, country }` |
| `center` | `Point` | No | `null` | `2dsphere` | Optional geographic center |
| `rules` | `[String]` | No | `[]` | — | Chapter guidelines |
| `flairs` | `[String]` | No | `[]` | — | Post flairs |
| `memberCount` | `Number` | Yes | `0` | — | Denormalized count of joined scouts |
| `createdBy` | `ObjectId` | Yes | — | — | Creator user ID |

**Indexes:**
- `{ slug: 1 }` (unique)
- `{ 'place.city': 1, 'place.country': 1 }`
- `{ center: '2dsphere' }` (sparse index)
- `{ name: 'text', description: 'text' }`

---

### 2.7 Collection: `memberships`
**Model:** `Membership` (`backend/models/Membership.js`)  
**Purpose:** User subscriptions and roles within communities.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `userId` | `ObjectId` | Yes | — | Index | Ref: `User` |
| `communityId` | `ObjectId` | Yes | — | Index | Ref: `Community` |
| `role` | `String` | Yes | `'member'` | — | Enum: `'member'`, `'moderator'`, `'owner'` |
| `createdAt` | `Date` | Yes | Auto | — | Membership join date |

**Indexes:**
- `{ userId: 1, communityId: 1 }` (unique compound index)
- `{ communityId: 1 }`

---

### 2.8 Collection: `visits`
**Model:** `Visit` (`backend/models/Visit.js`)  
**Purpose:** Verified physical scout check-ins ($D \le 50\text{ meters}$) and spot status updates.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `postId` | `ObjectId` | Yes | — | Index | Ref: `Post` |
| `userId` | `ObjectId` | Yes | — | Index | Ref: `User` |
| `photoUrl` | `String` | No | `null` | — | Validated HTTPS proof photo URL |
| `note` | `String` | No | `""` | — | Field notes from visit (max 500 chars) |
| `location` | `Point` | Yes | — | — | Scout's GPS coordinates at check-in |
| `verified` | `Boolean` | Yes | `false` | — | True if GPS was within 50m radius |
| `spotStatus` | `String` | Yes | `'still_there'`| — | Condition: `'still_there'`, `'gone'`, `'changed'` |
| `createdAt` | `Date` | Yes | Auto | — | Visit timestamp |

**Indexes:**
- `{ postId: 1, userId: 1 }` (unique: one check-in per user per spot)
- `{ userId: 1, createdAt: -1 }` (personal scout visit history)

---

### 2.9 Collection: `reports`
**Model:** `Report` (`backend/models/Report.js`)  
**Purpose:** Community moderation flags and safety escalation queue.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `targetType` | `String` | Yes | — | Index | Enum: `'post'`, `'comment'`, `'user'` |
| `targetId` | `ObjectId` | Yes | — | Index | ID of target document |
| `reporterId` | `ObjectId` | Yes | — | Index | Ref: `User` |
| `reason` | `String` | Yes | — | — | Enum: `'unsafe_or_private'`, `'nsfw'`, `'spam'`, `'doxxing'`, `'misinformation'`, `'other'` |
| `details` | `String` | No | `""` | — | Explanatory note (max 500 chars) |
| `status` | `String` | Yes | `'open'` | Index | Enum: `'open'`, `'pending'`, `'resolved'`, `'actioned'`, `'dismissed'` |
| `weight` | `Number` | Yes | `1.0` | — | Dynamic weight based on reporter trust |
| `resolvedBy` | `ObjectId` | No | `null` | — | Ref: `User` (acting moderator) |
| `resolvedAt` | `Date` | No | `null` | — | Resolution timestamp |
| `resolutionNote`| `String` | No | `null` | — | Moderator explanation (max 500 chars) |

**Indexes:**
- `{ reporterId: 1, targetType: 1, targetId: 1 }` (unique: one report per reporter per target)
- `{ status: 1, createdAt: -1 }` (moderator review queue)

---

### 2.10 Collection: `notifications`
**Model:** `Notification` (`backend/models/Notification.js`)  
**Purpose:** User activity notifications with 1-hour time-bucket deduplication and **30-day automatic TTL expiration**.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `userId` | `ObjectId` | Yes | — | Index | Ref: `User` (recipient) |
| `actorId` | `ObjectId` | No | `null` | — | Ref: `User` (triggering user) |
| `type` | `String` | Yes | — | — | Enum: `'comment'`, `'reply'`, `'visit'`, `'tier_up'`, `'nearby_find'`, `'mention'` |
| `postId` | `ObjectId` | No | `null` | — | Ref: `Post` |
| `dedupeKey` | `String` | No | `null` | Unique (Partial) | Deduplication key (e.g. `comment:postId:actorId:hourlyBucket`) |
| `data` | `Mixed` | No | `{}` | — | Additional payload context |
| `read` | `Boolean` | Yes | `false` | Index | Read status flag |
| `createdAt` | `Date` | Yes | `Date.now` | **TTL Index** | **Automatically expires after 30 days (2,592,000s)** |

**Indexes:**
- `{ userId: 1, createdAt: -1, _id: -1 }`
- `{ userId: 1, read: 1 }`
- `{ dedupeKey: 1 }` (unique, `partialFilterExpression: { dedupeKey: { $type: "string" } }`)
- `{ createdAt: 1 }` (TTL: `expireAfterSeconds: 2592000`)

---

### 2.11 Collection: `refreshtokens`
**Model:** `RefreshToken` (`backend/models/RefreshToken.js`)  
**Purpose:** SHA-256 hashed rotating refresh token lineage records with **7-day sliding TTL expiration**.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `tokenHash` | `String` | Yes | — | Unique | SHA-256 digest of the raw 40-byte hex token |
| `userId` | `ObjectId` | Yes | — | Index | Ref: `User` |
| `familyId` | `String` | Yes | — | Index | UUID tracking the token rotation lineage |
| `expiresAt` | `Date` | Yes | — | **TTL Index** | **Automatically expires at `expiresAt` (`expireAfterSeconds: 0`)** |
| `replacedBy` | `String` | No | `null` | — | Pointer to successor token hash |
| `revoked` | `Boolean` | Yes | `false` | — | True if used or compromised |
| `revokedAt` | `Date` | No | `null` | — | Revocation timestamp |
| `createdAt` | `Date` | Yes | `Date.now` | — | Creation timestamp |

**Indexes:**
- `{ tokenHash: 1 }` (unique)
- `{ userId: 1 }`
- `{ familyId: 1 }`
- `{ expiresAt: 1 }` (TTL: `expireAfterSeconds: 0`)

---

### 2.12 Collection: `emailtokens`
**Model:** `EmailToken` (`backend/models/EmailToken.js`)  
**Purpose:** Single-use hashed email verification and password reset tokens with dynamic TTL expiration.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `userId` | `ObjectId` | Yes | — | Index | Ref: `User` |
| `tokenHash` | `String` | Yes | — | Unique | SHA-256 digest of random verification token |
| `type` | `String` | Yes | — | Index | Enum: `'verify_email'`, `'reset_password'` |
| `expiresAt` | `Date` | Yes | — | **TTL Index** | **Automatically expires at `expiresAt` (`expireAfterSeconds: 0`)** |
| `usedAt` | `Date` | No | `null` | — | Consumption timestamp |
| `createdAt` | `Date` | Yes | `Date.now` | — | Token creation timestamp |

**Indexes:**
- `{ tokenHash: 1 }` (unique)
- `{ userId: 1 }`
- `{ type: 1 }`
- `{ expiresAt: 1 }` (TTL: `expireAfterSeconds: 0`)

---

### 2.13 Collection: `idempotencykeys`
**Model:** `IdempotencyKey` (`backend/models/IdempotencyKey.js`)  
**Purpose:** Deduplication of mutating POST requests with **24-hour automatic TTL expiration**.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `key` | `String` | Yes | — | — | Client-provided `Idempotency-Key` header |
| `userId` | `ObjectId` | Yes | — | Index | Authenticated user ID |
| `endpoint` | `String` | Yes | — | — | Request path |
| `requestHash` | `String` | Yes | — | — | SHA-256 digest of route + serialized request body |
| `inProgress` | `Boolean` | Yes | `true` | — | True while initial request is processing |
| `status` | `String` | Yes | `'pending'` | — | Enum: `'pending'`, `'completed'` |
| `statusCode` | `Number` | No | — | — | Cached HTTP response status |
| `responseBody`| `Mixed` | No | — | — | Cached JSON response body |
| `createdAt` | `Date` | Yes | `Date.now` | **TTL Index** | **Automatically expires after 24 hours (86,400s)** |

**Indexes:**
- `{ userId: 1, key: 1 }` (unique compound index)
- `{ createdAt: 1 }` (TTL: `expireAfterSeconds: 86400`)

---

### 2.14 Collection: `auditlogs`
**Model:** `AuditLog` (`backend/models/AuditLog.js`)  
**Purpose:** Append-only regulatory audit ledger recording administrative, moderator, and security actions.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `actorId` | `ObjectId` | Yes | — | Index | User ID performing the action |
| `action` | `String` | Yes | — | Index | Action identifier (`'spot_revealed'`, `'post_banned'`, etc.) |
| `targetType` | `String` | Yes | — | Index | Enum: `'post'`, `'comment'`, `'user'`, `'report'` |
| `targetId` | `ObjectId` | Yes | — | Index | Target document ID |
| `reason` | `String` | No | — | — | Justification or note |
| `meta` | `Mixed` | No | `{}` | — | Additional audit metadata |
| `createdAt` | `Date` | Yes | `Date.now` | Index | Immutable event timestamp |

**Indexes:**
- `{ actorId: 1 }`
- `{ action: 1 }`
- `{ targetType: 1, targetId: 1, createdAt: -1 }`
- `{ createdAt: 1 }`

---

### 2.15 Collection: `joblocks`
**Model:** `JobLock` (`backend/models/JobLock.js`)  
**Purpose:** Distributed advisory locking mechanism ensuring single-flight execution of background crons across cluster nodes.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `name` | `String` | Yes | — | Unique | Job lock identifier (e.g. `'counter_reconcile'`) |
| `lockedUntil`| `Date` | No | `null` | Index | Expiration timestamp of current lease |
| `owner` | `String` | No | `null` | — | Node process identifier holding the lease |
| `updatedAt` | `Date` | Yes | `Date.now` | — | Last heartbeat timestamp |

**Indexes:**
- `{ name: 1 }` (unique)
- `{ lockedUntil: 1 }`

---

### 2.16 Collection: `ratelimits`
**Model:** `RateLimit` (`backend/models/RateLimit.js`)  
**Purpose:** Distributed atomic rate-limit counter buckets with dynamic sliding TTL index.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `key` | `String` | Yes | — | Unique | Bucket identifier (e.g. `rl:auth:login:127.0.0.1`) |
| `hits` | `Number` | Yes | `1` | — | Counter incremented atomically via `$inc` |
| `resetAt` | `Date` | Yes | — | **TTL Index** | **Automatically expires at `resetAt` (`expires: 0`)** |

**Indexes:**
- `{ key: 1 }` (unique)
- `{ resetAt: 1 }` (TTL: `expireAfterSeconds: 0`)

---

### 2.17 Collection: `schemaversions`
**Model:** `SchemaVersion` (`backend/models/SchemaVersion.js`)  
**Purpose:** Schema migration tracking ledger recording applied database migrations.

| Field | Type | Required | Default | Index | Description |
|---|---|---|---|---|---|
| `_id` | `ObjectId` | Yes | Auto | Unique PK | Primary key |
| `version` | `Number` | Yes | — | Unique | Monotonically increasing migration version |
| `name` | `String` | Yes | — | — | Descriptive migration name |
| `appliedAt` | `Date` | Yes | `Date.now` | — | Migration execution timestamp |

**Indexes:**
- `{ version: 1 }` (unique)

---

## 3. Global Counter Mutation Matrix

Denormalized counters provide instant feed generation without expensive `$lookup` queries. Every counter mutation is executed atomically:

| Counter Field | Target Collection | Mutation Operator | Triggering Endpoint | Backing Service / File | Failure & Reconcile Mechanism |
|---|---|---|---|---|---|
| `meter.likes` | `posts` | `$add: ['$meter.likes', 1]` | `POST /api/v1/posts/:id/vote` (value = 1) | `backend/services/meter.js` (`applyDelta`) | Nightly `reconcileCounters.js` recalculates from `Vote.countDocuments({ postId, value: 1 })`. |
| `meter.dislikes`| `posts` | `$add: ['$meter.dislikes', 1]` | `POST /api/v1/posts/:id/vote` (value = -1) | `backend/services/meter.js` (`applyDelta`) | Nightly `reconcileCounters.js` recalculates from `Vote.countDocuments({ postId, value: -1 })`. |
| `meter.comments`| `posts` | `$add: ['$meter.comments', 1 / -1]` | `POST /api/v1/posts/:id/comments`<br>`DELETE /api/v1/comments/:id` | `backend/routes/posts.js` | Nightly `reconcileCounters.js` aggregates `Comment.countDocuments({ postId, removed: false })`. |
| `meter.visits` | `posts` | `$add: ['$meter.visits', 1]` | `POST /api/v1/posts/:id/visit` | `backend/routes/posts.js` & `meter.js` | Nightly `reconcileCounters.js` aggregates `Visit.countDocuments({ postId, verified: true })`. |
| `meter.score` | `posts` | Dynamic Pipeline Calculation | All reaction/engagement events | `backend/services/meter.js` | Recomputed in-line during `applyDelta`. Frozen if `post.velocityFrozen: true`. |
| `hotScore` | `posts` | Logarithmic Decay Formula | Post creation, score updates, nightly sweep | `Post.pre('save')`, `backend/services/scheduler.js` | Recomputed during nightly sweep for active spots. |
| `stats.posts` | `users` | `$inc: { 'stats.posts': 1 / -1 }` | `POST /api/v1/posts`<br>`DELETE /api/v1/posts/:id` | `backend/routes/posts.js` | Recomputed from `Post.countDocuments({ authorId, removed: false })`. |
| `stats.visits` | `users` | `$inc: { 'stats.visits': 1 }` | `POST /api/v1/posts/:id/visit` | `backend/routes/posts.js` | Recomputed from `Visit.countDocuments({ userId, verified: true })`. |
| `memberCount` | `communities` | `$inc: { memberCount: 1 / -1 }` | `POST /api/v1/communities/:slug/join`<br>`POST /api/v1/communities/:slug/leave` | `backend/routes/communities.js` | Recomputed from `Membership.countDocuments({ communityId })`. |
| `tokenVersion` | `users` | `$inc: { tokenVersion: 1 }` | `POST /api/v1/auth/logout-all`<br>`POST /api/v1/auth/change-password`<br>Token reuse detection | `backend/services/token.js`<br>`backend/routes/auth.js` | Guaranteed monotonic increment; forces instant re-authentication across all clients. |
| `hits` | `ratelimits` | `$inc: { hits: 1 }` | All protected API requests | `backend/middleware/rateLimiter.js` | Dynamic rolling window; automatically expires via TTL index. |
