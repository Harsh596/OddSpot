# Oddspot Security & Location Privacy Specification

This document provides the authoritative security architecture, location privacy threat model, mathematical proofs, cryptographic token lifecycle, and pre-deployment verification checklist for the Oddspot platform.

---

## 1. Location Privacy Threat Model

Oddspot is an exploration network where users discover and share obscure physical landmarks, urban anomalies, and overlooked curiosities. Because many oddities are located in residential neighborhoods, sensitive ecosystems, or proximity to private property, protecting contributor privacy and preventing physical stalking or harassment is a primary design imperative.

### 1.1 Attacker Profiles & Capabilities

| Attacker Profile | Objective | Capabilities & Attack Vectors |
|---|---|---|
| **Curious Scout / Leaker** | Uncover exact location of hidden spots without visiting in person. | Queries public API endpoints, inspects response payloads, extracts image metadata (EXIF/GPS), examines client-side bundle/cache. |
| **Grid Prober / Trilaterator** | Recover true coordinates mathematically by triangulating distances or bounding boxes. | Spawns multiple queries from adjacent GPS coordinates (geometric trilateration) or systematically steps bounding boxes to pinpoint boundaries. |
| **Sybil Network / Brigader** | Inflate or tank spot visibility, trigger false alarms, or brute-force reveal-on-arrival limits. | Rotates IP addresses, spoofs `X-Forwarded-For`, spins up synthetic accounts to bypass rate limits and manipulate the Oddometer score. |
| **Malicious Poster** | Submit fake coordinates, dangerous traps, or malicious image links to exploit scout clients or server SSRF. | Craft polyglot Markdown/HTML, embed SSRF links targeting internal cloud metadata (`169.254.169.254`) or loopback (`127.0.0.1`), upload malicious EXIF profiles. |
| **Eavesdropper / Token Thief** | Intercept or replay user credentials to hijack administrative or scout accounts. | Token replay, algorithm-confusion JWT attacks (`alg: none`), refresh token concurrent race conditions, and timing analysis. |

---

## 2. Deterministic HMAC Polar Fuzzing Math

When a spot is submitted with `hideExact: true`, the true physical coordinates are never served to unauthenticated or remote clients. Instead, a permanent, deterministic fuzzed coordinate pair is computed and indexed.

### 2.1 Cryptographic Derivation

The implementation in `backend/utils/fuzzLocation.js` uses **HMAC-SHA256** to derive pseudo-random polar coordinates from the true latitude, longitude, and post identifier.

Let:
- $K = \text{LOCATION\_FUZZ\_SALT}$ (configured via environment, defaults to secure server salt)
- $S = \text{seed}$ (post `_id` string, e.g., `671f1...`)
- $\text{lng}, \text{lat} = \text{original coordinates (rounded to 6 decimal places)}$
- $R_E = 6,371,000 \text{ meters (WGS-84 mean Earth radius)}$
- $r_{\min} = 150 \text{ meters}$
- $r_{\max} = 400 \text{ meters}$

The message digest is computed as:
$$M = \text{seed} \parallel \text{":"} \parallel \text{lng.toFixed(6)} \parallel \text{":"} \parallel \text{lat.toFixed(6)}$$
$$H = \text{HMAC-SHA256}(K, M)$$

$H$ is a 32-byte binary buffer. From $H$, two unsigned 32-bit big-endian integers are extracted:
1. **Angle Integer** ($I_\theta$): bytes 0..3
   $$I_\theta = \text{readUInt32BE}(H, 0)$$
2. **Distance Integer** ($I_r$): bytes 4..7
   $$I_r = \text{readUInt32BE}(H, 4)$$

### 2.2 Polar Coordinate Projection

The continuous angle $\theta \in [0, 2\pi)$ and distance $r \in [r_{\min}, r_{\max}]$ are derived as:
$$\theta = \left( \frac{I_\theta}{2^{32} - 1} \right) \times 2\pi$$
$$r = r_{\min} + \left( \frac{I_r}{2^{32} - 1} \right) \times (r_{\max} - r_{\min}) = 150 + \left( \frac{I_r}{4,294,967,295} \right) \times 250$$

### 2.3 Spherical Displacement to Geographic Coordinates

The offset is projected onto the Earth's surface:
$$\Delta \text{lat} = \left( \frac{r \cos(\theta)}{R_E} \right) \times \left( \frac{180}{\pi} \right)$$
$$\phi_{\text{lat}} = \frac{\text{lat} \times \pi}{180}$$
$$\cos(\phi_{\text{lat}}) = \max(0.00001, \cos(\phi_{\text{lat}})) \quad \text{(Polar singularity guard)}$$
$$\Delta \text{lng} = \left( \frac{r \sin(\theta)}{R_E \times \cos(\phi_{\text{lat}})} \right) \times \left( \frac{180}{\pi} \right)$$

The final fuzzed coordinates $[\text{lng}_{\text{fuzz}}, \text{lat}_{\text{fuzz}}]$ are clamped and rounded to 6 decimal places (~0.11 meters precision):
$$\text{lat}_{\text{fuzz}} = \text{clamp}(-90, 90, \text{round}_6(\text{lat} + \Delta \text{lat}))$$
$$\text{lng}_{\text{fuzz}} = \text{normalize}_{[-180, 180]}(\text{round}_6(\text{lng} + \Delta \text{lng}))$$

### 2.4 Properties of the Fuzzing Function

1. **Strict Annulus Bound**: The displacement distance $r$ is mathematically bounded strictly between $150\text{ m}$ and $400\text{ m}$. An observer located at $[\text{lng}_{\text{fuzz}}, \text{lat}_{\text{fuzz}}]$ is guaranteed to be at least 150 meters away from the real spot, eliminating casual visual identification of private dwellings.
2. **Uniform Angle Distribution**: Because HMAC-SHA256 distributes hash bits uniformly, $\theta$ is uniformly distributed over $[0, 2\pi)$, ensuring no directional bias toward roads or cardinal directions.
3. **Deterministic Immutability**: Given identical input coordinates and post `_id`, the output is 100% reproducible. This ensures the fuzzed point never drifts or wobbles on subsequent queries.

---

## 3. `feedLocation` Architecture & Anti-Trilateration

A classic vulnerability in geospatial applications is **trilateration through repeated queries**: if a server measures distance against the true location or changes the random fuzz on every request, an adversary querying from three known locations can calculate the true intersection point.

Oddspot eliminates trilateration by construction through the `feedLocation` architecture.

```
                      +---------------------------------------+
                      |       Post Submission (POST)          |
                      +---------------------------------------+
                                          |
                        Is hideExact == true?
                       /                     \
                     YES                      NO
                     /                         \
+-----------------------------------+   +------------------------------------+
| Compute HMAC Polar Fuzz (150-400m)|   | feedLocation = exact location      |
| feedLocation = [lng_fuzz,lat_fuzz]|   |                                    |
+-----------------------------------+   +------------------------------------+
                     \                         /
                      v                       v
               +--------------------------------------+
               | Store in MongoDB:                    |
               | - location: [lng, lat] (private)     |
               | - feedLocation: [lng, lat] (indexed) |
               +--------------------------------------+
                                  |
                   Geospatial Query ($geoNear / $near)
                                  |
                                  v
+----------------------------------------------------------------------------+
| 1. Query searches ONLY feedLocation 2dsphere index                         |
| 2. Calculated distance is measured relative to feedLocation                |
| 3. Returned distance is quantized: Math.round(distance / 500) * 500        |
| 4. Allowed query radii are snapped: [1000, 2000, 5000, 10000, 25000]       |
| 5. Tie-breaker sorting: createdAt: -1, _id: -1 prevents rank leakage       |
| 6. Serializer strips true location; ETag hashes only sanitized payload     |
+----------------------------------------------------------------------------+
```

### 3.1 Defense-in-Depth Measures

1. **Zero Dynamic Fuzzing**: Fuzzing is performed **once** at post creation. The resulting coordinate is permanently stored in `post.feedLocation`. All subsequent geospatial indexing, range queries, and distance calculations use `feedLocation`. Because distance is measured against a fixed point, intersecting circles will always intersect at `feedLocation`, never revealing `location`.
2. **Quantized Distance Display**: Distances returned in API payloads (`post.distance`) are quantized to 500-meter increments via `Math.round(distance / 500) * 500`. Client UIs display `~500m away (approximate area)`. An adversary cannot exploit millimeter or meter-level floats to determine proximity boundaries.
3. **Snapped Query Radii**: Range queries are snapped to pre-approved radii (`1 km`, `2 km`, `5 km`, `10 km`, `25 km`). Arbitrary boundary exploration at 1-meter intervals is rejected by schema validators.
4. **Deterministic Secondary Sorting**: Equidistant spots are sorted by `createdAt: -1, _id: -1`. The server never exposes internal floating-point distance sort ranks.
5. **Sanitized ETag Hashes**: HTTP ETags are computed over the serialized, sanitized JSON representation (`backend/utils/postSerializer.js`). The raw `post.location` field is stripped before serialization, preventing cryptographic or length-based ETag side-channel leakage.

---

## 4. Reveal-on-Arrival Protections

Scouts who physically hike to a spot can unlock the exact coordinates via the Reveal-on-Arrival mechanism (`POST /api/v1/posts/:id/reveal`).

### 4.1 Access Criteria & Constraints

1. **Authentication Required**: Anonymous callers cannot reveal coordinates; the endpoint requires a verified JWT Bearer token (`authenticateToken`).
2. **Strict Physical Proximity ($\le 300\text{ meters}$)**:
   - The scout's mobile device must provide current high-accuracy GPS coordinates (`{ latitude, longitude }`).
   - The server computes the true Haversine distance $D_{\text{true}}$ between the caller's coordinates and `post.location.coordinates`.
   - If $D_{\text{true}} > 300\text{ meters}$, the request is rejected with `403 Forbidden` (`OUT_OF_RANGE`) and indicates the distance required to approach.
3. **Daily Reveal Quota (10 Spots / Day)**:
   - Each successful reveal is recorded in `AuditLog` with `action: 'spot_revealed'`.
   - The system queries `AuditLog.countDocuments({ actorId, action: 'spot_revealed', createdAt: { $gte: 24h_ago } })`.
   - If the user has reached 10 reveals in the rolling 24-hour window, the request is rejected with `429 Too Many Requests` (`DAILY_REVEAL_LIMIT_EXCEEDED`). This stops automated GPS-spoofing botnets from scraping entire city databases in a single sweep.
4. **Memory-Only Client Storage**:
   - The unlocked coordinates are stored strictly in React runtime state (`PostDetail.jsx` and `VisitActionPanel.jsx`).
   - Unlocked coordinates are **never written to `localStorage` or `sessionStorage`**, preventing persistent cache extraction or physical device inspection exploits.

---

## 5. Residual Limitations & Physical Edge Cases

While Oddspot provides best-in-class mathematical privacy, certain physical constraints remain:

1. **Isolated Geographic Landmarks**: If a spot is described as "the giant stone monolith on top of Mount Sentinel", an adversary reading the title and text can locate the landmark via satellite imagery regardless of coordinate fuzzing. Contributors are cautioned during post creation via `<SafetyChecklist/>` to omit identifying address numbers and avoid photographing private dwellings.
2. **Client GPS Spoofing**: A motivated attacker using rooted hardware or mock location providers can submit spoofed GPS coordinates within 300 meters of a suspected location. However, because they must already know the location within 300 meters to succeed, and because of the 10/day quota, large-scale automated data extraction is economically and computationally unviable.
3. **Impossible Travel Velocity Checks**: For check-ins (`POST /api/v1/posts/:id/visit`), the system calculates travel speed between the user's consecutive check-ins. If velocity exceeds $500\text{ km/h}$, the visit is flagged or rejected to prevent multi-city spoofing.

---

## 6. Authentication & Cryptographic Token Rotation

Oddspot implements a zero-trust, rotating session token architecture designed to prevent token theft, replay, and session hijacking.

### 6.1 Token Types & Lifecycles

```
+-----------------------------------------------------------------------------+
|                                ACCESS TOKEN                                 |
| - Format: RFC 7519 JWT (HS256)                                              |
| - Lifespan: 15 minutes (short-lived)                                        |
| - Payload: { id: ObjectId, username: string, tokenVersion: number }         |
| - Signature: Signed using JWT_SECRET or active kid from JWT_SECRETS keyring |
+-----------------------------------------------------------------------------+
                                       ^
                                       | Rotates via POST /api/v1/auth/refresh
                                       v
+-----------------------------------------------------------------------------+
|                                REFRESH TOKEN                                |
| - Format: Opaque 40-byte cryptographically secure random string (80 hex chars)|
| - Storage: SHA-256 hash stored in MongoDB RefreshToken collection           |
| - Lifespan: 7 days with sliding window TTL index                            |
| - Metadata: { userId, familyId, tokenHash, revoked, expiresAt }             |
+-----------------------------------------------------------------------------+
```

### 6.2 Token Family Rotation & Reuse Detection

To prevent token theft from compromised client machines, refresh tokens are organized into **Token Families** (`familyId`):

1. **Single-Use Rotation**: When a client presents an active refresh token $R_1$, the server atomically marks $R_1$ as `revoked: true` and issues a brand-new refresh token $R_2$ within the same `familyId`.
2. **Reuse Detection**: If an adversary steals $R_1$ and attempts to replay it after the legitimate client has already rotated to $R_2$, the server detects that $R_1$ is marked revoked.
3. **Automatic Family Revocation**:
   - The entire `familyId` is marked revoked in MongoDB.
   - The user's account-wide `tokenVersion` is incremented:
     ```javascript
     await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } });
     ```
   - In-memory auth caches are purged via `invalidateUserAuthCache(userId)`.
   - All active access tokens and refresh tokens across all devices in that family are instantly invalidated.
   - A high-priority security alert is logged in `AuditLog` (`action: 'refresh_token_family_revoked'`).

### 6.3 Cryptographic Keyring & Secret Rotation (`kid`)

Access tokens support seamless zero-downtime key rotation via the Key Identifier (`kid`) header:
- `JWT_CURRENT_KEY_ID`: Identifies the current signing key.
- `JWT_SECRETS`: JSON dictionary containing valid keys:
  ```json
  {
    "key-2026-q1": "0123456789abcdef0123456789abcdef",
    "key-2026-q2": "fedcba9876543210fedcba9876543210"
  }
  ```
- **Verification Logic**: `backend/services/token.js` inspects the JWT header `kid`. If present, it looks up the secret in `JWT_SECRETS`. If omitted, it falls back to `JWT_SECRET`.
- **Algorithm Enforcement**: The verification layer strictly enforces `algorithms: ['HS256']`. Tokens specifying `alg: 'none'` or asymmetric RSA algorithms are immediately rejected with `401 Unauthorized`.

---

## 7. Zero SSRF & Safe Image Architecture

Oddspot allows image URLs for spot showcases, visit proofs, user avatars, and community icons. Because user-supplied URLs present Server-Side Request Forgery (SSRF) and Server-Side Code Injection hazards, strict URL isolation is enforced.

### 7.1 Image URL Validation Engine (`imageUrlValidator.js`)

Before any image URL is stored in MongoDB, it is validated against the following invariants:
1. **HTTPS Protocol Enforced**: Plaintext `http://` or non-HTTP schemes (`file://`, `gopher://`, `javascript:`, `data:`) are rejected.
2. **Zero IP Literals**:
   - IPv4 dotted quads (`127.0.0.1`, `192.168.1.1`, `10.0.0.1`)
   - IPv6 addresses (`::1`, `fe80::`, `[::]`)
   - IPv6-mapped IPv4 addresses (`[::ffff:127.0.0.1]`, `[::ffff:169.254.169.254]`)
   - Integer / Hex / Octal encoded IP literals (`0x7f000001`, `2130706433`, `017700000001`)
3. **Loopback & Cloud Metadata Blocks**:
   - `localhost`, `*.localhost`, `127.0.0.1`
   - AWS / GCP / Azure link-local metadata endpoints (`169.254.169.254`, `metadata.google.internal`)
4. **Host Allowlist**: When `IMAGE_HOST_ALLOWLIST` is configured (e.g. `res.cloudinary.com,images.unsplash.com`), only domains matching the exact hostname or approved subdomain are accepted.
5. **Zero Server Fetch**: The Oddspot server **never downloads or fetches** remote image URLs. Browsers fetch images directly from the CDN with appropriate sandbox CSP headers.

---

## 8. Pre-Deploy Security Checklist

Before deploying an Oddspot instance to staging or production, execute and verify this checklist:

| Verification Item | Command / Inspection | Expected Value | Status |
|---|---|---|---|
| **Node Environment** | `echo $NODE_ENV` | `production` | [ ] Verified |
| **JWT Secret Length** | Check length of `JWT_SECRET` | $\ge 32$ characters | [ ] Verified |
| **Location Fuzz Salt** | Check `LOCATION_FUZZ_SALT` | Strong random salt configured | [ ] Verified |
| **Trust Proxy Guard** | Check `TRUST_PROXY` in `backend/app.js` | `1` or `true` behind proxy, `false` if direct | [ ] Verified |
| **CORS Whitelist** | Check `FRONTEND_URL` | Explicit domains only (no `*`) | [ ] Verified |
| **Image Allowlist** | Check `IMAGE_HOST_ALLOWLIST` | Configured CDN domains | [ ] Verified |
| **Database Indexes** | `node backend/scripts/syncIndexes.js` | 2dsphere and compound indexes built | [ ] Verified |
| **TTL Purge Indexes** | Inspect `notifications`, `ratelimits`, `refreshtokens` | `expireAfterSeconds` index active | [ ] Verified |
| **Database Validators** | `node backend/scripts/applySchemaValidation.js` | `collMod` schema validation active | [ ] Verified |
| **Storage Budget** | `node backend/scripts/storageReport.js` | $< 400\text{ MB}$ ($< 78\%$ of Atlas M0 limit) | [ ] Verified |
| **Prometheus Auth** | `curl -i http://localhost:5001/metrics` | `401 Unauthorized` without `METRICS_TOKEN` | [ ] Verified |
| **Automated Test Suite** | `cd backend && npm test` | 100% tests passing | [ ] Verified |
| **Frontend Production Build** | `cd frontend && npm run build` | Zero syntax or bundling errors | [ ] Verified |
