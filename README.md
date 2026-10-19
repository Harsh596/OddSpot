# Oddspot

Oddspot is a location-based forum where people post strange, bizarre, and overlooked real-world oddities they discover, allowing scouts nearby to find and visit them.

A dynamic "Oddity Score" meter ranks spots based on community interactions (likes, dislikes, comments), scaling visibility from local city feeds up to country-wide feeds once threshold engagement is reached.

---

## Architecture & Folder Structure

The repository is structured into independent frontend and backend workspaces:

```text
OddSpot/
├── backend/                  # Node.js + Express API server (CommonJS)
│   ├── config/
│   │   └── meter.js          # Tunable meter weights, decay, and tier thresholds
│   ├── middleware/
│   │   └── auth.js           # JWT Bearer verification middleware
│   ├── models/               # Mongoose data models
│   │   ├── User.js           # Users, credentials, badges, stats
│   │   ├── Post.js           # Geocoded posts with 2dsphere index & meter scores
│   │   ├── Comment.js        # Post discussion comments
│   │   ├── Vote.js           # Unique (userId, postId) voting ledger
│   │   └── Report.js         # Community moderation reports
│   ├── routes/
│   │   ├── auth.js           # Signup, login, and auth profile routes
│   │   └── posts.js          # Post creation, nearby feed, voting, comments, reporting
│   ├── scripts/
│   │   ├── seed.js           # Initial database seed script
│   │   ├── syncIndexes.js    # Mongoose 2dsphere / compound index synchronizer
│   │   └── smokeTest.js      # Automated 23-point smoke test suite
│   ├── services/
│   │   └── meter.js          # Meter score computation, delta updates, and tier progression
│   ├── db.js                 # MongoDB connection manager
│   ├── server.js             # Express app entrypoint (Helmet, CORS, Rate limiting)
│   ├── package.json
│   └── .env.example          # Backend environment variable template
│
├── frontend/                 # Vite + React web application (ESM, Plain layout)
│   ├── src/
│   │   ├── context/
│   │   │   └── AuthContext.jsx # Global auth state, localStorage token sync, 401 interceptor
│   │   ├── components/
│   │   │   └── Navbar.jsx      # Navigation bar and auth controls
│   │   ├── pages/
│   │   │   ├── NearbyFeed.jsx  # Geolocation feed, radius filter, like/dislike, load more
│   │   │   ├── CreatePost.jsx  # Find creation form, GPS auto-fill, hide-exact option
│   │   │   ├── PostDetail.jsx  # Safe plain-text post viewer, comments thread, reporting
│   │   │   ├── Login.jsx       # Login form
│   │   │   └── Signup.jsx      # Registration form with validation
│   │   ├── api.js              # Centralized API fetch client
│   │   ├── App.jsx             # Main router and shell layout
│   │   └── App.css             # Modular clean stylesheets
│   ├── package.json
│   ├── vite.config.js
│   └── .env.example          # Frontend environment variable template
│
├── README.md                 # Project documentation (this file)
└── WORKLOG.md                # Detailed implementation decisions and test logs
```

---

## Setup & Prerequisites

- **Node.js**: v18+ (tested on Node v20/v24)
- **MongoDB Atlas** cluster with `MONGODB_URI` connection string

### 1. Backend Setup

1. Navigate to `backend/`:
   ```bash
   cd backend
   ```
2. Create your `.env` from the template:
   ```bash
   cp .env.example .env
   ```
   Fill in your `MONGODB_URI` and a secure `JWT_SECRET`.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Synchronize database indexes (including the `2dsphere` index on `location`):
   ```bash
   npm run db:sync
   ```
5. Start the backend development server:
   ```bash
   npm run dev
   # Server starts on http://localhost:5001
   ```

### 2. Frontend Setup

1. In a separate terminal, navigate to `frontend/`:
   ```bash
   cd frontend
   ```
2. Create your `.env` from the template:
   ```bash
   cp .env.example .env
   ```
   Default `VITE_API_URL` points to `http://localhost:5001/api`.
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the frontend development server:
   ```bash
   npm run dev
   # App runs at http://localhost:5173
   ```
5. To create a production build:
   ```bash
   npm run build
   ```

---

## Running the Automated Smoke Test

Oddspot includes an end-to-end automated test suite that validates authentication, input sanitization, geospatial proximity, anti-trilateration protections, meter tier progression, reporting, and auto-fuzzing without touching production data:

```bash
cd backend
npm run test:smoke
```

All test records are prefixed with `test_` and are automatically purged at the conclusion of the test run.

---

## Privacy & Security Protections

1. **Anti-Trilateration Distance Sanitization**:
   When a user flags a spot with `hideExact: true`, the API:
   - Fuzzes coordinates to a ~500m grid (`[fuzzedLng, fuzzedLat]`).
   - Calculates distances strictly against the fuzzed point rather than the true coordinate.
   - Quantizes reported `distanceMeters` to 500m increments.
   - Snaps feed query radii to discrete tiers (`1km`, `2km`, `5km`, `10km`, `25km`) and filters feed inclusion in memory against the fuzzed point distance, blocking radius-probing bisection attacks.
2. **Community Auto-Fuzzing**:
   When a post receives 3 or more reports for `unsafe_or_private` grounds, the system automatically marks `hideExact: true` to prevent unauthorized foot traffic.
3. **No Direct Image Binaries**:
   MongoDB stores only validated `https://` URLs; binary media is kept outside the database.
4. **Hardening**:
   - `helmet` security headers.
   - Restricted CORS origin matching `FRONTEND_URL`.
   - Payload limit capped at 100kb.
   - Rate limiting on authentication attempts, post creation, voting, and reporting.
   - All user input rendered safely as plain text in the UI (no `dangerouslySetInnerHTML`).