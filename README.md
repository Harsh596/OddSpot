# Oddspot 📍

**Oddspot** is a hyper-local, community-driven exploration platform where people discover, document, and physically visit strange, bizarre, and overlooked real-world oddities—from roadside kinetic sculptures and architectural anomalies to hidden staircases and retro neon relics.

Built with a **zero-trust location privacy architecture**, Oddspot protects contributor privacy and sensitive sites using deterministic HMAC polar coordinate fuzzing and proximity-based reveal-on-arrival mechanics.

---

## 🚀 Key Features

- **📍 Location Privacy & Anti-Trilateration**: Sensitive spots are protected by deterministic HMAC-SHA256 polar coordinate fuzzing ($150\text{m}..400\text{m}$). Queries operate exclusively on fuzzed coordinates with quantized distance rounding, eliminating geometric trilateration.
- **🧭 Reveal-on-Arrival**: In-the-wild physical discovery unlocks exact coordinates only when a verified scout approaches within $\le 300\text{m}$ (subject to a 10/day anti-scraping quota).
- **⚡ Oddometer & Tier Progression**: A dynamic social vitality gauge calculates engagement scores ($S = 3C + 1L - 1D + 2V$). High-scoring oddities ratchet up from **Local Whisper** to **Neighborhood Eyebrow-Raiser**, **City Sensation**, and ultimately **Country-Wide Certified Oddity!**.
- **🛡️ Anti-Brigading & Sybil Defense**: Coordinated voting or commenting spikes trigger an automated velocity freeze, locking score inflation until moderator review.
- **🗺️ Interactive Leaflet Map & Radar**: Web Mercator clustering, GPS distance filters (1..25 km), and radius overlays for fuzzed spots.
- **🏕️ Communities & Chapters**: Localized chapters (`/c/:slug`) with scoped member feeds, leadership roles, custom flairs, and chapter rules.
- **🎒 Scout Progression & Badges**: 5-step interactive onboarding tour, mission sweep trackers, and earned badges (`scout`, `first_visit`, `10_visits`).
- **🎨 Live Theme Engine & Feed Rules**: 4 design token presets (`Neon Night`, `Paper Zine`, `Terminal`, `Vaporwave`), real-time WCAG 2.2 contrast ratio verification, and a visual discovery rule builder.
- **🔔 Notifications & Threaded Comments**: Depth-3 discussion threads with markdown spoilers (`>!spoiler!<`), solve flow for mystery spots, and unread notification drawer.
- **🔒 Hardened Security & Zero SSRF**: Strictly enforced HTTPS image allowlisting, zero server-side fetching, JSON nesting depth limits, CRLF-sanitized logging, and rotating refresh token families with reuse detection.

---

## 🏗️ Architecture & Technology Stack

```
OddSpot/
├── backend/                  # Node.js 20+ & Express 5 API Server (CommonJS)
│   ├── config/               # Meter weights, JWT keyring, auth constants
│   ├── middleware/           # Rate limiting, auth, logging, idempotency
│   ├── models/               # Mongoose schemas (17 MongoDB collections)
│   ├── routes/               # API controllers (/api/v1/* and /api/*)
│   ├── scripts/              # Migrations, backups, smoke tests, reconciler
│   ├── services/             # Meter engine, notifications, token rotator
│   ├── test/                 # Node test runner suite (370+ automated tests)
│   └── utils/                # HMAC fuzzing, image validation, serializers
│
├── frontend/                 # React 19 + Leaflet Single-Page App (Vite + ESM)
│   ├── src/
│   │   ├── components/       # Map, Oddometer gauge, Drawer, Modals
│   │   ├── context/          # Auth context, Theme engine with WCAG guard
│   │   ├── pages/            # Home, Explore, Random, PostDetail, Profile
│   │   ├── styles/           # CSS custom property design tokens
│   │   └── utils/            # Markdown parser, map clustering, safety
│   ├── package.json
│   └── vite.config.js
│
└── docs/                     # Authoritative Documentation Suite
    ├── API.md                # Comprehensive OpenAPI / REST API reference
    ├── SECURITY.md           # Threat model, HMAC math, token security
    ├── DATA.md               # 17 MongoDB collections, indexes, counter matrix
    ├── RUNBOOK.md            # Incident playbooks (secrets, disaster, abuse)
    ├── ARCHITECTURE.md       # System design, middleware pipeline, diagrams
    ├── DEPLOY.md             # Docker deployment & Nginx configuration
    ├── THREAT_MODEL.md       # OWASP API Security Top 10 remediation audit
    └── RESTORE.md            # Database backup & restore drill procedures
```

---

## 🛠️ Quickstart Guide

### Prerequisites
- **Node.js**: v20.x or higher
- **MongoDB**: MongoDB Atlas M0 cluster or local replica set (`MONGODB_URI`)

### 1. Backend Setup

```bash
cd backend

# 1. Configure environment variables
cp .env.example .env
# Edit .env and supply your MONGODB_URI and a 32+ character JWT_SECRET

# 2. Install dependencies
npm install

# 3. Synchronize database indexes & collections
npm run db:sync

# 4. Start the backend API server
npm run dev
# Backend starts on http://localhost:5001
```

### 2. Frontend Setup

```bash
cd frontend

# 1. Configure environment variables
cp .env.example .env

# 2. Install dependencies
npm install

# 3. Start Vite development server
npm run dev
# Frontend starts on http://localhost:5173
```

---

## 🧪 Testing & Verification

Oddspot includes a test suite covering unit tests, integration tests, red-team penetration tests, and manual verification scripts:

```bash
# Run backend test suite (370+ unit and integration tests)
cd backend && npm test

# Run frontend production build verification
cd frontend && npm run build

# Run automated penetration test suites
cd backend
node --test test/redteam1.test.js  # BOLA, mass assignment, token race
node --test test/redteam2.test.js  # Anti-trilateration, Sybil surge
node --test test/redteam3.test.js  # Rate limit bypass, IPv6, ReDoS
node --test test/redteam4.test.js  # Full-stack XSS, SSRF, rule fuzzing

# Run automated smoke test against isolated database
node scripts/smokeTest.js

# Run manual check validation scripts
bash scripts/manualChecks.sh
bash scripts/manualChecks2.sh

# Run MongoDB storage & capacity audit (<400 MB check)
node scripts/storageReport.js --warn-threshold 400
```

---

## ⚙️ Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `NODE_ENV` | Yes | `development` | Set to `production` in live environments. |
| `PORT` | No | `5001` | TCP port for the Express HTTP server. |
| `MONGODB_URI` | Yes | — | MongoDB Atlas or replica set connection URI. |
| `JWT_SECRET` | Yes | — | Cryptographic secret for HS256 tokens ($\ge 32$ chars). |
| `JWT_SECRETS` | No | `{}` | JSON dictionary for zero-downtime key rotation (`kid`). |
| `JWT_CURRENT_KEY_ID` | No | — | Active key identifier for signing new access tokens. |
| `LOCATION_FUZZ_SALT`| No | Server Salt | Salt used for HMAC-SHA256 polar coordinate fuzzing. |
| `FRONTEND_URL` | No | `http://localhost:5173` | Comma-separated whitelist of allowed CORS origins. |
| `TRUST_PROXY` | No | `0` | Set to `1` behind reverse proxies (Nginx, Cloudflare). |
| `UPLOAD_PROVIDER` | No | `allowlist` | Upload mode: `allowlist`, `cloudinary`, or `r2`. |
| `IMAGE_HOST_ALLOWLIST`| No | — | Comma-separated domain allowlist for image URLs. |
| `METRICS_TOKEN` | No | — | Constant-time bearer token required for `GET /metrics`. |
| `METER_COUNTRY_THRESHOLD`| No | `50` | Oddometer score required to unlock country-wide feed. |
| `REPORT_FUZZ_THRESHOLD` | No | `3` | Reports required to initiate review quarantine. |

---

## 📚 Complete Documentation Suite

For comprehensive technical specifications, refer to the documentation in `/docs`:

- **[REST API Reference (API.md)](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/docs/API.md)**: Exhaustive endpoint documentation across `/api/v1/*`, authentication requirements, rate limits, JSON schemas, error codes, and copy-pasteable curl examples.
- **[Security & Privacy Specification (SECURITY.md)](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/docs/SECURITY.md)**: Location privacy threat model, exact HMAC polar fuzzing math, anti-trilateration guarantees, token family reuse detection, and pre-deploy security checklist.
- **[Database Architecture (DATA.md)](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/docs/DATA.md)**: Full schema dictionary for all 17 collections, compound indexes, TTL eviction policies, and the global counter mutation matrix.
- **[Operations & Incident Runbook (RUNBOOK.md)](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/docs/RUNBOOK.md)**: Incident response playbooks for secret rotation, disaster recovery restores, brigading mitigation, and Atlas M0 storage management.
- **[System Architecture (ARCHITECTURE.md)](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/docs/ARCHITECTURE.md)**: High-level topology, component breakdown, request middleware pipeline, Mermaid sequence diagrams, and Oddometer mechanics.
- **[Production Deployment Guide (DEPLOY.md)](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/docs/DEPLOY.md)**: Container setup, Nginx reverse proxy, resource constraints, and readiness probe integration.
- **[OWASP API Threat Model (THREAT_MODEL.md)](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/docs/THREAT_MODEL.md)**: OWASP API Security Top 10 remediation audit and test verification matrix.
- **[Database Backup & Restore Drill (RESTORE.md)](file:///Users/harshmishra/Documents/SST/OddSpot/OddSpot/docs/RESTORE.md)**: Point-in-time backup generation, staging restore drills, and counter reconciliation.

---

## 📄 License & Ethical Scout Code

Oddspot code is provided under the MIT License. Scouts using this software agree to the **Oddspot Ethical Scout Code**:
1. Respect private property: never trespass or post interior photos of private residences.
2. Leave no trace: pack out trash and leave curious artifacts exactly as found.
3. Observe safety advisories: adhere to nighttime warnings and rugged terrain alerts.