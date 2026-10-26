# Future httpOnly Cookie Authentication Plan

## Executive Summary
This document outlines the architectural plan for transitioning Oddspot's web authentication from `Authorization: Bearer <token>` in `localStorage` to hardened `httpOnly` session cookies.

While bearer tokens stored in browser storage are susceptible to exfiltration via cross-site scripting (XSS), storing tokens in `httpOnly` and `Secure` cookies with browser prefix protection (`__Host-`) prevents client-side JavaScript access while enforcing browser-level security boundaries.

---

## 1. Target Cookie Architecture

Oddspot will implement a dual-cookie session design utilizing the `__Host-` cookie prefix, ensuring cookies can only be set via HTTPS from the origin domain and cannot be overwritten by subdomains:

| Cookie Name | Scope | Lifetime | Flags | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `__Host-oddspot_token` | `Path=/` | 15 Minutes | `HttpOnly; Secure; SameSite=Lax; Path=/` | Short-lived access token for API requests |
| `__Host-oddspot_refresh` | `Path=/api/auth` | 7 Days | `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` | Rotating refresh token scoped only to auth endpoints |
| `__Host-oddspot_csrf` | `Path=/` | Session | `Secure; SameSite=Lax; Path=/` *(Non-HttpOnly)* | Cryptographic CSRF token for double-submit verification |

### Flag Rationale:
- **`HttpOnly`**: Blocks all JavaScript `document.cookie` reads, mitigating token exfiltration via DOM-based XSS.
- **`Secure`**: Guarantees transmission strictly across encrypted TLS connections.
- **`SameSite=Lax` (Access Token)**: Allows top-level navigation while mitigating cross-site request forgery on embedded third-party requests.
- **`SameSite=Strict` (Refresh Token)**: Restricted entirely to first-party requests originating directly within Oddspot.
- **`__Host-` Prefix**: Enforces that cookies cannot specify a `Domain` attribute and must have `Path=/`, blocking subdomain session hijacking.

---

## 2. CSRF Mitigation Strategy

Because cookies are automatically attached by browsers to cross-site requests, robust CSRF protection must accompany cookie authentication:

1. **Double Submit Cookie Pattern**:
   - On initial load or login, the backend issues a random 32-byte cryptographic token in the non-HttpOnly `__Host-oddspot_csrf` cookie.
   - The frontend reads `__Host-oddspot_csrf` and attaches its value to the `X-CSRF-Token` HTTP request header for state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`).
   - The backend validates that `req.headers['x-csrf-token']` matches the cookie value using timing-safe comparison (`crypto.timingSafeEqual`).

2. **Strict Origin & Referer Verification**:
   - The backend verifies that incoming `Origin` and `Referer` headers match the allowlisted `FRONTEND_URL` environment configuration.
   - Any request with mismatched or forged origins on mutating routes is rejected with HTTP 403 `FORBIDDEN`.

---

## 3. Dual-Mode Authentication Transition

To maintain seamless interoperability with mobile applications, CLI tools, and legacy clients, the backend authentication middleware will support a dual-mode fallback:

```javascript
function extractToken(req) {
  // 1. Prioritize Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1].trim();
  }
  // 2. Fall back to httpOnly cookie if present
  if (req.cookies && req.cookies['__Host-oddspot_token']) {
    return req.cookies['__Host-oddspot_token'];
  }
  return null;
}
```

---

## 4. Endpoint Rotation & Lifecycle Updates

1. **`POST /api/auth/login` & `POST /api/auth/signup`**:
   - Generates JWT and refresh token.
   - Sets `Set-Cookie: __Host-oddspot_token=...; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=900`.
   - Sets `Set-Cookie: __Host-oddspot_refresh=...; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=604800`.
   - Returns user profile in JSON body.

2. **`POST /api/auth/refresh`**:
   - Reads refresh token from `req.cookies['__Host-oddspot_refresh']` (or request body for API clients).
   - Atomically rotates token in MongoDB.
   - Sets updated `__Host-oddspot_token` and `__Host-oddspot_refresh` cookies.

3. **`POST /api/auth/logout` & `POST /api/auth/logout-all`**:
   - Revokes refresh token in database.
   - Clears cookies via `Set-Cookie` with `Max-Age=0` and expired date:
     ```
     Set-Cookie: __Host-oddspot_token=; Max-Age=0; Path=/; HttpOnly; Secure
     Set-Cookie: __Host-oddspot_refresh=; Max-Age=0; Path=/api/auth; HttpOnly; Secure
     ```

---

## 5. Frontend Client Migration

1. **HTTP Client Configuration**:
   - Configure Fetch / Axios with `credentials: 'include'` on all API requests.
2. **Local Storage Deprecation**:
   - Automatically purge any legacy tokens found in `localStorage.getItem('token')` or `localStorage.getItem('refreshToken')`.
3. **Silent Token Refresh**:
   - An HTTP 401 response interceptor catches expired access tokens, calls `POST /api/auth/refresh` with credentials included, and replays the failed request upon cookie update.

---

## 6. Phased Rollout Schedule

- **Phase 1 (Backend Dual-Mode)**: Introduce cookie-parser, cookie setting in `/login` and `/refresh`, and dual-mode token extraction in `requireAuth`.
- **Phase 2 (CSRF Hardening)**: Introduce CSRF token generation and validation middleware on mutating API routes.
- **Phase 3 (Frontend Adoption)**: Update web client to use `credentials: 'include'`, purge localStorage credentials, and verify login/logout/refresh flows across browsers.
- **Phase 4 (Legacy Cleanup)**: Restrict browser user-agents strictly to cookie auth while preserving Bearer header support for mobile app builds.
