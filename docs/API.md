# Oddspot API Reference Specification

**Version:** 1.0.0  
**Base URL:** `/api/v1` (with `/api` maintained as a backward-compatible alias)  
**Standard:** RESTful JSON, ISO 8601 UTC timestamps, GeoJSON coordinates `[longitude, latitude]`  
**Content-Type:** `application/json` (strictly enforced for all write requests with bodies)

---

## Global Headers & Protocol Conventions

### Request Headers
| Header | Type | Description |
|---|---|---|
| `Authorization` | String | `Bearer <access_token>` for authenticated endpoints. |
| `Content-Type` | String | Must be `application/json` for POST, PUT, and PATCH bodies. |
| `Idempotency-Key`| String | Optional UUIDv4 or client key on `POST /api/v1/posts` and `POST /api/v1/posts/:id/comments` (24h TTL). |
| `X-Request-Id` | String | Optional client request identifier. Sanitized (CRLF/ANSI stripped) or generated as UUIDv4. |

### Response Headers
| Header | Description |
|---|---|
| `X-Request-Id` | Unique request tracking identifier. |
| `Cache-Control`| `no-store, no-cache, must-revalidate` on sensitive and authenticated routes. `public, max-age=15, stale-while-revalidate=30` on public feeds. |
| `ETag` | Weak ETag (`W/"..."`) computed over sanitized, coordinate-safe JSON representations. |

### Standard Error Response Format
All 4xx and 5xx errors return a uniform JSON error payload:
```json
{
  "error": "Short human-readable summary of the error",
  "code": "MACHINE_READABLE_ERROR_CODE",
  "message": "Detailed context or validation explanation",
  "details": [
    {
      "field": "title",
      "message": "Title must not exceed 140 characters"
    }
  ]
}
```

---

## 1. Authentication & Session Endpoints (`/api/v1/auth`)

### 1.1 Register Scout (`POST /api/v1/auth/signup`)
Creates a new scout account. Validates unique username (case-insensitive, ASCII only, no reserved words) and email.

- **Auth:** Public
- **Rate Limit:** Auth Limiter (5 requests / 15 minutes in production)
- **Request Body:**
  ```json
  {
    "username": "urban_scout",
    "email": "scout@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "7f8b9c0d1e2f3a4b...",
    "user": {
      "id": "6724a100f91a0c0012345678",
      "username": "urban_scout",
      "email": "scout@example.com",
      "role": "member",
      "emailVerified": false,
      "onboardingDone": false,
      "badges": []
    }
  }
  ```
- **Error Codes:** `VALIDATION_FAILED` (400), `AUTH_CONFLICT` (409)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/auth/signup \
    -H "Content-Type: application/json" \
    -d '{"username":"urban_scout","email":"scout@example.com","password":"StrongPassword123!"}'
  ```

---

### 1.2 Login (`POST /api/v1/auth/login`)
Authenticates via username or email with constant-time bcrypt verification and account lockout protection (15m lock after 5 failures).

- **Auth:** Public
- **Rate Limit:** Auth Limiter (5 requests / 15 minutes)
- **Request Body:**
  ```json
  {
    "identifier": "urban_scout",
    "password": "StrongPassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "4a5b6c7d8e9f0a1b...",
    "user": {
      "id": "6724a100f91a0c0012345678",
      "username": "urban_scout",
      "email": "scout@example.com",
      "role": "member",
      "emailVerified": true,
      "onboardingDone": true,
      "badges": ["scout"]
    }
  }
  ```
- **Error Codes:** `AUTH_INVALID_CREDENTIALS` (401), `AUTH_FORBIDDEN_BANNED` (403), `RATE_LIMITED` (429)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"urban_scout","password":"StrongPassword123!"}'
  ```

---

### 1.3 Rotate Refresh Token (`POST /api/v1/auth/refresh`)
Atomically issues a fresh access token and child refresh token while marking the previous token used. Automatic reuse detection revokes the entire token family.

- **Auth:** Public (requires active refresh token)
- **Request Body:**
  ```json
  {
    "refreshToken": "4a5b6c7d8e9f0a1b..."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "token": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "9a8b7c6d5e4f3a2b..."
  }
  ```
- **Error Codes:** `AUTH_INVALID_TOKEN` (401), `TOKEN_REUSE_DETECTED` (401), `AUTH_FORBIDDEN_BANNED` (403)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/auth/refresh \
    -H "Content-Type: application/json" \
    -d '{"refreshToken":"4a5b6c7d8e9f0a1b..."}'
  ```

---

### 1.4 Logout Session (`POST /api/v1/auth/logout`)
Revokes a specific refresh token session.

- **Auth:** Public
- **Request Body:**
  ```json
  {
    "refreshToken": "9a8b7c6d5e4f3a2b..."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Logged out successfully"
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/auth/logout \
    -H "Content-Type: application/json" \
    -d '{"refreshToken":"9a8b7c6d5e4f3a2b..."}'
  ```

---

### 1.5 Invalidate All Sessions (`POST /api/v1/auth/logout-all`)
Deletes all active refresh tokens for the user and increments `tokenVersion`, invalidating all issued access tokens.

- **Auth:** Bearer JWT
- **Response (200 OK):**
  ```json
  {
    "message": "All sessions logged out successfully"
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/auth/logout-all \
    -H "Authorization: Bearer $TOKEN"
  ```

---

### 1.6 Current User Session Profile (`GET /api/v1/auth/me`)
Returns the authenticated caller's profile and permission state.

- **Auth:** Bearer JWT
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": "6724a100f91a0c0012345678",
      "username": "urban_scout",
      "email": "scout@example.com",
      "role": "member",
      "emailVerified": true,
      "onboardingDone": true,
      "badges": ["scout", "first_visit"]
    }
  }
  ```
- **Curl Example:**
  ```bash
  curl https://api.oddspot.test/api/v1/auth/me \
    -H "Authorization: Bearer $TOKEN"
  ```

---

### 1.7 Change Password (`POST /api/v1/auth/change-password`)
Verifies current password, writes new bcrypt hash, increments `tokenVersion`, and invalidates prior sessions.

- **Auth:** Bearer JWT
- **Request Body:**
  ```json
  {
    "currentPassword": "OldPassword123!",
    "newPassword": "BrandNewPassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Password changed successfully",
    "token": "eyJhbGciOiJIUzI1Ni...",
    "refreshToken": "1a2b3c4d5e6f7a8b..."
  }
  ```
- **Error Codes:** `VALIDATION_FAILED` (400), `AUTH_INVALID_TOKEN` (401)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/auth/change-password \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"currentPassword":"OldPassword123!","newPassword":"BrandNewPassword123!"}'
  ```

---

### 1.8 Request Password Reset (`POST /api/v1/auth/forgot-password`)
Enumeration-safe, asynchronous password reset dispatch.

- **Auth:** Public
- **Rate Limit:** Auth Limiter
- **Request Body:**
  ```json
  {
    "email": "scout@example.com"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "If an account exists with that email, a password reset link has been sent."
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/auth/forgot-password \
    -H "Content-Type: application/json" \
    -d '{"email":"scout@example.com"}'
  ```

---

### 1.9 Confirm Password Reset (`POST /api/v1/auth/reset-password`)
Validates single-use expiring reset token (15m lifetime), updates password, and marks token used.

- **Auth:** Public
- **Request Body:**
  ```json
  {
    "token": "raw_hex_token_string",
    "newPassword": "FreshSecurePassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Password reset successfully. You may now log in."
  }
  ```
- **Error Codes:** `AUTH_INVALID_TOKEN` (400)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/auth/reset-password \
    -H "Content-Type: application/json" \
    -d '{"token":"...","newPassword":"FreshSecurePassword123!"}'
  ```

---

### 1.10 Verify Email (`POST /api/v1/auth/verify-email`)
Single-use confirmation of email verification token.

- **Auth:** Public
- **Request Body:**
  ```json
  {
    "token": "raw_hex_verification_token"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Email verified successfully"
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/auth/verify-email \
    -H "Content-Type: application/json" \
    -d '{"token":"..."}'
  ```

---

### 1.11 Delete Own Account (`DELETE /api/v1/auth/me`)
Transactional GDPR deletion: verifies current password, reassigns user posts/comments to `[deleted]` tombstone author, deletes user document, and revokes all tokens.

- **Auth:** Bearer JWT
- **Request Body:**
  ```json
  {
    "currentPassword": "MyPassword123!"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "message": "Account successfully deleted"
  }
  ```
- **Curl Example:**
  ```bash
  curl -X DELETE https://api.oddspot.test/api/v1/auth/me \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"currentPassword":"MyPassword123!"}'
  ```

---

## 2. Posts & Exploration Endpoints (`/api/v1/posts`)

### 2.1 Create Post Find (`POST /api/v1/posts`)
Publishes a new find. Automatically executes HMAC polar fuzzing if `hideExact: true`, computes `feedLocation`, generates mentions, and assigns the user's home place. Supports `Idempotency-Key`.

- **Auth:** Bearer JWT
- **Rate Limit:** Post Limiter (10 posts / hour)
- **Headers:** `Idempotency-Key` (Optional)
- **Request Body:**
  ```json
  {
    "title": "Abandoned Clocktower with Neon Faces",
    "body": "Discovered this strange clocktower behind the old warehouse.\n\n:::details Entry Tip\nUse side staircase\n:::\n\n>!Watch for rusty steps!<",
    "type": "find",
    "location": {
      "coordinates": [139.6917, 35.6895]
    },
    "place": {
      "city": "Tokyo",
      "country": "Japan"
    },
    "hideExact": true,
    "images": [
      { "url": "https://images.oddspot.test/clock1.jpg", "width": 1200, "height": 800 }
    ],
    "tags": ["clocktower", "neon", "abandoned"],
    "warnings": ["walking_required", "unsafe_night"]
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "id": "6724a200f91a0c0012345688",
    "title": "Abandoned Clocktower with Neon Faces",
    "body": "Discovered this strange clocktower behind the old warehouse...",
    "type": "find",
    "location": {
      "type": "Point",
      "coordinates": [139.6934, 35.6912]
    },
    "hideExact": true,
    "place": {
      "city": "Tokyo",
      "cityKey": "tokyo",
      "country": "Japan",
      "countryCode": "JP"
    },
    "tags": ["clocktower", "neon", "abandoned"],
    "warnings": ["walking_required", "unsafe_night"],
    "meter": {
      "score": 0,
      "likes": 0,
      "dislikes": 0,
      "comments": 0,
      "visits": 0,
      "reactions": 0,
      "label": "Oddometer",
      "countryThreshold": 50,
      "pointsToNextTier": 50
    },
    "tier": "city",
    "createdAt": "2026-10-27T06:00:00.000Z"
  }
  ```
- **Error Codes:** `VALIDATION_FAILED` (400), `CONFLICT` (409 duplicate within 20m), `IDEMPOTENCY_IN_FLIGHT` (409)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/posts \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"title":"Abandoned Clocktower","type":"find","location":{"coordinates":[139.6917,35.6895]},"place":{"city":"Tokyo","country":"Japan"},"hideExact":true}'
  ```

---

### 2.2 Proximity Radar Feed (`GET /api/v1/posts/nearby`)
Returns nearby discoveries sorted by distance. Snaps radius to `[1000, 2000, 5000, 10000, 25000]` meters. For `hideExact` spots, distance is rounded to 500m increments and coordinates are fuzzed.

- **Auth:** Optional Bearer JWT
- **Query Parameters:**
  - `lat` (Number, required): Latitude between -90 and 90
  - `lng` (Number, required): Longitude between -180 and 180
  - `maxDistance` (Number, optional): Snapped query radius in meters (default 5000)
  - `limit` (Number, optional): Max 50 items (default 20)
  - `page` (Number, optional): Page index (default 1)
- **Response (200 OK):**
  ```json
  {
    "posts": [
      {
        "id": "6724a200f91a0c0012345688",
        "title": "Abandoned Clocktower with Neon Faces",
        "distanceMeters": 1500,
        "hideExact": true,
        "location": {
          "type": "Point",
          "coordinates": [139.6934, 35.6912]
        },
        "meter": {
          "score": 12,
          "label": "Neighborhood Eyebrow-Raiser"
        }
      }
    ],
    "page": 1,
    "limit": 20
  }
  ```
- **Curl Example:**
  ```bash
  curl "https://api.oddspot.test/api/v1/posts/nearby?lat=35.6895&lng=139.6917&maxDistance=5000"
  ```

---

### 2.3 Single Post Detail (`GET /api/v1/posts/:id`)
Retrieves a single spot. If `hideExact: true`, location coordinates returned are fuzzed unless revealed by caller.

- **Auth:** Optional Bearer JWT
- **Response (200 OK):** Full Post serialized object.
- **Error Codes:** `NOT_FOUND` (404)
- **Curl Example:**
  ```bash
  curl https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688
  ```

---

### 2.4 Soft Delete Post (`DELETE /api/v1/posts/:id`)
Soft-deletes a post (`removed: true`). Permitted only for the post author, community owner/moderator (if post belongs to a community), or site staff (`moderator`, `admin`).

- **Auth:** Bearer JWT
- **Response (200 OK):**
  ```json
  {
    "message": "Post deleted successfully",
    "removed": true
  }
  ```
- **Error Codes:** `FORBIDDEN` (403), `NOT_FOUND` (404)
- **Curl Example:**
  ```bash
  curl -X DELETE https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688 \
    -H "Authorization: Bearer $TOKEN"
  ```

---

### 2.5 Cast Vote (`POST /api/v1/posts/:id/vote`)
Idempotently records like (`value: 1`), dislike (`value: -1`), or clears vote (`value: 0`). Updates post meter atomically. Author self-voting returns 403.

- **Auth:** Bearer JWT
- **Rate Limit:** Vote Limiter (60 votes / minute)
- **Request Body:**
  ```json
  {
    "value": 1
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "vote": 1,
    "changed": true,
    "score": 15,
    "meter": {
      "score": 15,
      "likes": 6,
      "dislikes": 0,
      "comments": 3
    }
  }
  ```
- **Error Codes:** `FORBIDDEN` (403 author voting), `NOT_FOUND` (404)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688/vote \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"value":1}'
  ```

---

### 2.6 Post Discussion Comment (`POST /api/v1/posts/:id/comments`)
Adds a comment (+3 to post meter). Non-author comments are capped at 3 per user for score contribution (9 pts max). Supports threaded replies (`parentId`) and mentions.

- **Auth:** Bearer JWT
- **Rate Limit:** Comment Limiter (30 comments / minute)
- **Headers:** `Idempotency-Key` (Optional)
- **Request Body:**
  ```json
  {
    "body": "Visited at sunset! @alice check this out.",
    "parentId": "6724a300f91a0c0012345699"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "comment": {
      "id": "6724a400f91a0c00123456aa",
      "postId": "6724a200f91a0c0012345688",
      "authorId": {
        "id": "6724a100f91a0c0012345678",
        "username": "urban_scout",
        "avatarUrl": "https://images.oddspot.test/avatar.jpg"
      },
      "body": "Visited at sunset! @alice check this out.",
      "depth": 1,
      "createdAt": "2026-10-27T06:05:00.000Z"
    }
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688/comments \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"body":"Great find!"}'
  ```

---

### 2.7 Get Comments (`GET /api/v1/posts/:id/comments`)
Retrieves cursor-paginated comments up to depth 3.

- **Auth:** Optional Bearer JWT
- **Query Parameters:** `cursor` (string), `limit` (int 1..50)
- **Response (200 OK):**
  ```json
  {
    "comments": [],
    "nextCursor": "6724a400f91a0c00123456aa",
    "hasMore": false
  }
  ```
- **Curl Example:**
  ```bash
  curl "https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688/comments?limit=20"
  ```

---

### 2.8 Report Post (`POST /api/v1/posts/:id/report`)
Files a weighted safety report. Triggers automatic coordinate fuzzing if weighted reports $\ge 3.0$ and flags `underReview: true` if $\ge 5.0$.

- **Auth:** Bearer JWT
- **Rate Limit:** Report Limiter (10 reports / hour)
- **Request Body:**
  ```json
  {
    "reason": "private_property",
    "details": "This is a private courtyard behind locked gates."
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "ok": true,
    "message": "Report submitted successfully for review",
    "reportId": "6724a500f91a0c00123456bb"
  }
  ```
- **Error Codes:** `VALIDATION_FAILED` (400 own post), `CONFLICT` (409 duplicate report)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688/report \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reason":"private_property","details":"Private residence"}'
  ```

---

### 2.9 Reveal on Arrival (`POST /api/v1/posts/:id/reveal`)
Unlocks exact coordinates in session state when caller is physically within 300m of the true location. Enforces daily cap of 10 reveals per user.

- **Auth:** Bearer JWT
- **Request Body:**
  ```json
  {
    "latitude": 35.6896,
    "longitude": 139.6918
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "unlocked": true,
    "exactLocation": {
      "coordinates": [139.6917, 35.6895]
    },
    "revealsRemainingToday": 9
  }
  ```
- **Error Codes:** `FORBIDDEN` (403 out of 300m range), `RATE_LIMITED` (429 daily cap exceeded)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688/reveal \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"latitude":35.6896,"longitude":139.6918}'
  ```

---

### 2.10 Record Verified GPS Visit (`POST /api/v1/posts/:id/visit`)
Records a physical visit. Caller coordinates must be within 50m of true post coordinates. Author cannot visit their own post.

- **Auth:** Bearer JWT
- **Request Body:**
  ```json
  {
    "latitude": 35.68951,
    "longitude": 139.69171,
    "photoUrl": "https://images.oddspot.test/proof.jpg",
    "note": "Clock is still ticking!",
    "spotStatus": "still_there"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "ok": true,
    "visit": {
      "verified": true,
      "spotStatus": "still_there",
      "photoUrl": "https://images.oddspot.test/proof.jpg"
    },
    "meter": {
      "score": 20,
      "visits": 1
    }
  }
  ```
- **Error Codes:** `FORBIDDEN` (403 author or out-of-range), `VALIDATION_FAILED` (400 SSRF photoUrl)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688/visit \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"latitude":35.68951,"longitude":139.69171,"spotStatus":"still_there"}'
  ```

---

### 2.11 Mark Identify Post Solved (`POST /api/v1/posts/:id/solve`)
Author selects best answer comment for mystery identify post.

- **Auth:** Bearer JWT (Post author only)
- **Request Body:**
  ```json
  {
    "commentId": "6724a400f91a0c00123456aa"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "solved": true,
    "bestCommentId": "6724a400f91a0c00123456aa"
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688/solve \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"commentId":"6724a400f91a0c00123456aa"}'
  ```

---

### 2.12 Append Author Field Update (`POST /api/v1/posts/:id/updates`)
Appends an author update note (max 10 updates per post).

- **Auth:** Bearer JWT (Post author only)
- **Request Body:**
  ```json
  {
    "body": "Update: Clock face neon has been repainted blue!"
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "ok": true,
    "updates": [
      {
        "body": "Update: Clock face neon has been repainted blue!",
        "createdAt": "2026-10-27T06:10:00.000Z"
      }
    ]
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/posts/6724a200f91a0c0012345688/updates \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"body":"Update: Still visible."}'
  ```

---

## 3. Feeds & Discovery Endpoints (`/api/v1/feed`)

### 3.1 Home Feed (`GET /api/v1/feed/home`)
Personalized feed composed of posts from user's joined communities, ranked by default hot algorithm or evaluated through custom whitelisted Feed Rules.

- **Auth:** Bearer JWT
- **Query Parameters:** `cursor` (string), `limit` (int 1..50), `sort` (`hot`, `new`, `top`)
- **Response (200 OK):**
  ```json
  {
    "posts": [],
    "mode": "rules",
    "nextCursor": null,
    "hasMore": false
  }
  ```
- **Curl Example:**
  ```bash
  curl https://api.oddspot.test/api/v1/feed/home \
    -H "Authorization: Bearer $TOKEN"
  ```

---

### 3.2 City Feed (`GET /api/v1/feed/city`)
Public city-wide feed matching canonical `cityKey` and `countryCode`. Includes HTTP weak ETag caching.

- **Auth:** Optional Bearer JWT
- **Query Parameters:**
  - `city` (string, required): e.g. `Tokyo`
  - `country` (string, required): e.g. `Japan` or `JP`
  - `cursor` (string, optional)
  - `limit` (int, default 20)
  - `sort` (`hot`, `new`, `top`)
- **Response (200 OK):**
  ```json
  {
    "posts": [],
    "place": { "city": "Tokyo", "cityKey": "tokyo", "countryCode": "JP" },
    "nextCursor": null,
    "hasMore": false
  }
  ```
- **Curl Example:**
  ```bash
  curl "https://api.oddspot.test/api/v1/feed/city?city=Tokyo&country=Japan"
  ```

---

### 3.3 Country Feed (`GET /api/v1/feed/country`)
Public feed of promoted `country` tier posts.

- **Auth:** Optional Bearer JWT
- **Query Parameters:**
  - `country` (string, required): e.g. `Japan`
  - `cursor` (string, optional)
  - `limit` (int, default 20)
  - `sort` (`hot`, `new`, `top`)
- **Response (200 OK):** Post collection payload.
- **Curl Example:**
  ```bash
  curl "https://api.oddspot.test/api/v1/feed/country?country=Japan"
  ```

---

### 3.4 Random Teleport Feed (`GET /api/v1/feed/random`)
Non-deterministic discovery sampler (`$sample`) returning random country-tier oddities with optional country teleport.

- **Auth:** Optional Bearer JWT
- **Query Parameters:** `country` (string, optional), `limit` (int 1..20, default 10)
- **Response (200 OK):**
  ```json
  {
    "posts": []
  }
  ```
- **Curl Example:**
  ```bash
  curl "https://api.oddspot.test/api/v1/feed/random?limit=5"
  ```

---

## 4. Communities Endpoints (`/api/v1/communities`)

### 4.1 Create Community (`POST /api/v1/communities`)
Creates a new interest or geographical community chapter. Creator automatically becomes `owner`.

- **Auth:** Bearer JWT
- **Request Body:**
  ```json
  {
    "name": "Tokyo Rooftop Scouts",
    "slug": "tokyo-rooftops",
    "description": "Urban elevation spotters in Greater Tokyo.",
    "iconUrl": "https://images.oddspot.test/icon.jpg",
    "scope": "city",
    "place": { "city": "Tokyo", "country": "Japan" },
    "rules": ["Leave no trace", "Respect private property"],
    "flairs": ["water-tower", "helipad", "rooftop-garden"]
  }
  ```
- **Response (201 Created):**
  ```json
  {
    "ok": true,
    "community": {
      "id": "6724a600f91a0c00123456cc",
      "name": "Tokyo Rooftop Scouts",
      "slug": "tokyo-rooftops",
      "memberCount": 1
    }
  }
  ```
- **Error Codes:** `VALIDATION_FAILED` (400), `CONFLICT` (409 slug exists)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/communities \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"name":"Tokyo Rooftop Scouts","slug":"tokyo-rooftops","scope":"city","place":{"city":"Tokyo","country":"Japan"}}'
  ```

---

### 4.2 List / Search Communities (`GET /api/v1/communities`)
Lists communities with scope, query, and city filters.

- **Auth:** Public
- **Query Parameters:** `q` (string), `scope` (`city`, `country`, `interest`), `city` (string), `limit` (int)
- **Response (200 OK):**
  ```json
  {
    "communities": []
  }
  ```
- **Curl Example:**
  ```bash
  curl "https://api.oddspot.test/api/v1/communities?scope=city&city=tokyo"
  ```

---

### 4.3 Get Community Detail (`GET /api/v1/communities/:slug`)
Returns community metadata, member count, rules, flairs, and caller membership status.

- **Auth:** Optional Bearer JWT
- **Response (200 OK):**
  ```json
  {
    "community": {
      "id": "6724a600f91a0c00123456cc",
      "name": "Tokyo Rooftop Scouts",
      "slug": "tokyo-rooftops",
      "rules": ["Leave no trace"],
      "memberCount": 42
    },
    "isMember": true,
    "memberRole": "owner"
  }
  ```
- **Curl Example:**
  ```bash
  curl https://api.oddspot.test/api/v1/communities/tokyo-rooftops \
    -H "Authorization: Bearer $TOKEN"
  ```

---

### 4.4 Update Community Rules & Profile (`PATCH /api/v1/communities/:slug`)
Updates rules, description, and iconUrl. Restricted strictly to community `owner` and `moderator` (or site staff). Regular members receive 403 `FORBIDDEN`.

- **Auth:** Bearer JWT (Owner/Moderator only)
- **Request Body:**
  ```json
  {
    "rules": ["Rule 1: Leave no trace", "Rule 2: Respect property"],
    "description": "Updated chapter description."
  }
  ```
- **Response (200 OK):** Updated community document.
- **Error Codes:** `FORBIDDEN` (403), `NOT_FOUND` (404)
- **Curl Example:**
  ```bash
  curl -X PATCH https://api.oddspot.test/api/v1/communities/tokyo-rooftops \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"rules":["Updated rule 1"]}'
  ```

---

### 4.5 Join Community (`POST /api/v1/communities/:slug/join`)
Joins a community chapter and atomically increments `memberCount`.

- **Auth:** Bearer JWT
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "joined": true,
    "role": "member",
    "memberCount": 43
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/communities/tokyo-rooftops/join \
    -H "Authorization: Bearer $TOKEN"
  ```

---

### 4.6 Leave Community (`POST /api/v1/communities/:slug/leave`)
Leaves a community and decrements `memberCount`. Owners cannot leave without transferring ownership.

- **Auth:** Bearer JWT
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "left": true,
    "memberCount": 42
  }
  ```
- **Error Codes:** `FORBIDDEN` (400 owner cannot leave)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/communities/tokyo-rooftops/leave \
    -H "Authorization: Bearer $TOKEN"
  ```

---

### 4.7 Community Feed (`GET /api/v1/communities/:slug/posts`)
Retrieves posts published within the community chapter.

- **Auth:** Optional Bearer JWT
- **Query Parameters:** `cursor` (string), `limit` (int), `sort` (`hot`, `new`, `top`)
- **Response (200 OK):**
  ```json
  {
    "community": { "id": "...", "name": "...", "slug": "..." },
    "posts": [],
    "nextCursor": null,
    "hasMore": false
  }
  ```
- **Curl Example:**
  ```bash
  curl "https://api.oddspot.test/api/v1/communities/tokyo-rooftops/posts?sort=hot"
  ```

---

## 5. Notifications Endpoints (`/api/v1/notifications`)

### 5.1 List Notifications (`GET /api/v1/notifications`)
Retrieves cursor-paginated notification items scoped strictly to caller's `userId`.

- **Auth:** Bearer JWT
- **Query Parameters:** `cursor` (string), `limit` (int 1..50), `unreadOnly` (boolean)
- **Response (200 OK):**
  ```json
  {
    "notifications": [
      {
        "id": "6724a700f91a0c00123456dd",
        "type": "comment",
        "title": "New comment on your spot",
        "actorId": { "id": "...", "username": "bob" },
        "postId": { "id": "...", "title": "Old Clocktower" },
        "read": false,
        "createdAt": "2026-10-27T06:12:00.000Z"
      }
    ],
    "unreadCount": 1,
    "nextCursor": null,
    "hasMore": false
  }
  ```
- **Curl Example:**
  ```bash
  curl https://api.oddspot.test/api/v1/notifications \
    -H "Authorization: Bearer $TOKEN"
  ```

---

### 5.2 Mark Notifications Read (`POST /api/v1/notifications/read`)
Marks specified IDs or all notifications read. Scoped strictly to caller's `userId`.

- **Auth:** Bearer JWT
- **Request Body:**
  ```json
  {
    "ids": ["6724a700f91a0c00123456dd"],
    "all": false
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "modifiedCount": 1,
    "unreadCount": 0
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/notifications/read \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"all":true}'
  ```

---

## 6. Users & Profile Endpoints (`/api/v1/users`)

### 6.1 Public Scout Profile (`GET /api/v1/users/:username`)
Returns public profile without sensitive fields.

- **Auth:** Public
- **Response (200 OK):**
  ```json
  {
    "user": {
      "id": "6724a100f91a0c0012345678",
      "username": "urban_scout",
      "avatarUrl": "https://images.oddspot.test/avatar.jpg",
      "bio": "Searching for lost geometry in the city.",
      "stats": { "posts": 5, "comments": 14, "visits": 3 },
      "badges": ["scout", "first_visit"],
      "createdAt": "2026-10-26T12:00:00.000Z"
    }
  }
  ```
- **Curl Example:**
  ```bash
  curl https://api.oddspot.test/api/v1/users/urban_scout
  ```

---

### 6.2 Update Profile Avatar & Bio (`PATCH /api/v1/users/me`)
Updates user avatar (validated against SSRF / IP literals) and bio.

- **Auth:** Bearer JWT
- **Request Body:**
  ```json
  {
    "avatarUrl": "https://images.oddspot.test/scout.png",
    "bio": "Updated bio text."
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "user": {
      "id": "6724a100f91a0c0012345678",
      "username": "urban_scout",
      "avatarUrl": "https://images.oddspot.test/scout.png",
      "bio": "Updated bio text."
    }
  }
  ```
- **Error Codes:** `VALIDATION_FAILED` (400 SSRF/invalid avatar)
- **Curl Example:**
  ```bash
  curl -X PATCH https://api.oddspot.test/api/v1/users/me \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"avatarUrl":"https://images.oddspot.test/scout.png"}'
  ```

---

### 6.3 Update Discovery Preferences & Theme (`PATCH /api/v1/users/me/preferences`)
Persists feed discovery rules, theme customizer overrides, and profile widget layout order.

- **Auth:** Bearer JWT
- **Request Body:**
  ```json
  {
    "feedConfig": {
      "mode": "rules",
      "rules": {
        "version": 1,
        "maxDistanceKm": 25,
        "includeTags": ["neon", "streetart"],
        "boostTags": [{ "tag": "neon", "multiplier": 1.5 }]
      }
    },
    "theme": {
      "preset": "neon-night",
      "overrides": { "--accent-primary": "#00f0ff" }
    },
    "profileLayout": {
      "widgetOrder": ["badges", "stats", "tabs"]
    }
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "preferences": { ... }
  }
  ```
- **Curl Example:**
  ```bash
  curl -X PATCH https://api.oddspot.test/api/v1/users/me/preferences \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"feedConfig":{"mode":"default"}}'
  ```

---

### 6.4 Complete Scout Onboarding Tour (`POST /api/v1/users/me/onboarding-complete`)
Atomically sets `onboardingDone: true` and awards the `'scout'` badge.

- **Auth:** Bearer JWT
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "onboardingDone": true,
    "badges": ["scout"]
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/users/me/onboarding-complete \
    -H "Authorization: Bearer $TOKEN"
  ```

---

### 6.5 Export GDPR User Archive (`GET /api/v1/users/me/export`)
Produces a complete, authenticated JSON dump of all user data with `Cache-Control: no-store`.

- **Auth:** Bearer JWT
- **Response (200 OK):**
  ```json
  {
    "user": { ... },
    "posts": [ ... ],
    "comments": [ ... ],
    "votes": [ ... ],
    "visits": [ ... ],
    "memberships": [ ... ],
    "exportedAt": "2026-10-27T06:15:00.000Z"
  }
  ```
- **Curl Example:**
  ```bash
  curl https://api.oddspot.test/api/v1/users/me/export \
    -H "Authorization: Bearer $TOKEN" > my_oddspot_archive.json
  ```

---

## 7. Moderation Queue Endpoints (`/api/v1/mod`)

### 7.1 Moderation Queue Reports (`GET /api/v1/mod/reports`)
Lists open and resolved moderation reports. Restricted strictly to `moderator` and `admin` roles.

- **Auth:** Bearer JWT (`moderator` or `admin`)
- **Query Parameters:** `status` (`open`, `resolved`, `dismissed`), `limit` (int)
- **Response (200 OK):**
  ```json
  {
    "reports": []
  }
  ```
- **Error Codes:** `AUTH_FORBIDDEN` (403)
- **Curl Example:**
  ```bash
  curl https://api.oddspot.test/api/v1/mod/reports \
    -H "Authorization: Bearer $STAFF_TOKEN"
  ```

---

### 7.2 Action Report (`POST /api/v1/mod/reports/:id/action`)
Resolves or dismisses a report and takes optional action (`hide_post`, `remove_post`, `dismiss`). Writes immutable `AuditLog`.

- **Auth:** Bearer JWT (`moderator` or `admin`)
- **Request Body:**
  ```json
  {
    "action": "hide_post",
    "reason": "Confirmed private property boundary"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "report": { ... }
  }
  ```
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/mod/reports/6724a500f91a0c00123456bb/action \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"action":"hide_post","reason":"Verified"}'
  ```

---

### 7.3 Ban User (`POST /api/v1/mod/users/:id/ban`)
Bans a user, revoking sessions. Role hierarchy strictly enforced: moderators cannot ban admins or fellow moderators.

- **Auth:** Bearer JWT (`moderator` or `admin`)
- **Request Body:**
  ```json
  {
    "reason": "Repeated spam and abusive submissions"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "ok": true,
    "user": { "id": "...", "banned": true }
  }
  ```
- **Error Codes:** `AUTH_FORBIDDEN` (403 role hierarchy violation)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/mod/users/6724a100f91a0c0012345678/ban \
    -H "Authorization: Bearer $STAFF_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"reason":"Spam"}'
  ```

---

## 8. Uploads & Direct Signing (`/api/v1/uploads`)

### 8.1 Request Presigned Upload Signature (`POST /api/v1/uploads/sign`)
Generates presigned HMAC parameters for direct client-to-storage uploads (Cloudinary or R2 stub). In default `allowlist` mode, returns 501 `UPLOAD_PROVIDER_DISABLED`.

- **Auth:** Bearer JWT
- **Rate Limit:** Upload Limiter (30 requests / 15 minutes)
- **Request Body:**
  ```json
  {
    "fileType": "image/jpeg",
    "fileSize": 2048576,
    "purpose": "post"
  }
  ```
- **Response (200 OK):**
  ```json
  {
    "provider": "cloudinary",
    "uploadUrl": "https://api.cloudinary.com/v1_1/my-cloud/image/upload",
    "params": {
      "timestamp": 1793062000,
      "transformation": "fl_strip_profile",
      "signature": "a1b2c3d4e5f6...",
      "api_key": "1234567890"
    }
  }
  ```
- **Error Codes:** `UPLOAD_UNSUPPORTED_MIME` (400), `UPLOAD_FILE_TOO_LARGE` (413), `UPLOAD_PROVIDER_DISABLED` (501)
- **Curl Example:**
  ```bash
  curl -X POST https://api.oddspot.test/api/v1/uploads/sign \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"fileType":"image/jpeg","fileSize":1000000,"purpose":"post"}'
  ```

---

## 9. System Probes & Observability

### 9.1 Liveness Probe (`GET /health`)
- **Auth:** Public
- **Response (200 OK):** `{"status":"ok","uptime":123.45}`

### 9.2 Readiness Probe (`GET /ready`)
- **Auth:** Public
- **Response (200 OK):** `{"status":"ready","db":"up"}` (or 503 if MongoDB ping fails)

### 9.3 Prometheus Metrics (`GET /metrics`)
- **Auth:** Bearer Token matching `METRICS_TOKEN` (constant-time verification)
- **Response (200 OK):** Prometheus text exposition format (`# TYPE http_requests_total counter`, etc.).
