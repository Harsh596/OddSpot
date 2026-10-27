# Oddspot Production Deployment Runbook

This guide describes how to deploy the Oddspot backend into production using Docker, container orchestration, or bare-metal Linux with MongoDB Atlas M0.

---

## 1. Environment Configuration

Create a production `.env` file (outside source control) with the following mandatory variables:

```bash
# Core Environment
NODE_ENV=production
PORT=5001

# MongoDB Atlas M0 Connection
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/oddspot?retryWrites=true&w=majority

# JWT & Key Management (Min 32 characters)
JWT_SECRET=your-secure-random-jwt-secret-min-32-chars-long!
# Optional Keyring for key rotation:
# JWT_KEYRING=[{"kid":"key-2026","secret":"...","status":"current"}]

# Location Fuzzing Secret (Min 32 characters, enforced in production)
FUZZ_SECRET=your-secure-random-fuzz-secret-min-32-chars-long!

# Security & Network
TRUST_PROXY=1
FRONTEND_URL=https://oddspot.app,https://staging.oddspot.app

# Optional Rate Limit Overrides (Ignored in NODE_ENV=production)
# AUTH_RATE_LIMIT_MAX=20
# WRITE_RATE_LIMIT_MAX=30
```

---

## 2. Docker & Container Deployment

### Running with Docker Compose
A production-ready `docker-compose.yml` is provided for local or single-node VPS hosting:

```bash
# Build and start services in background
docker compose up -d --build

# View container logs
docker compose logs -f backend

# Verify health status
docker compose ps
```

### Standalone Docker Container Build
```bash
# Build Docker image
docker build -t oddspot-backend:latest .

# Run container with resource constraints
docker run -d \
  --name oddspot-backend \
  --restart unless-stopped \
  -p 5001:5001 \
  --env-file .env \
  --memory=512m \
  --cpus=1.0 \
  oddspot-backend:latest
```

---

## 3. Reverse Proxy Configuration (NGINX / Caddy)

When running behind a reverse proxy or load balancer, set `TRUST_PROXY=1` so Express accurately reads client IPs from `X-Forwarded-For`.

### NGINX Sample Configuration
```nginx
server {
    listen 443 ssl http2;
    server_name api.oddspot.app;

    ssl_certificate /etc/letsencrypt/live/api.oddspot.app/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.oddspot.app/privkey.pem;

    client_max_body_size 100k;

    location / {
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_connect_timeout 5s;
        proxy_read_timeout 15s;
        proxy_send_timeout 15s;
    }
}
```

---

## 4. Health & Readiness Probes

Oddspot exposes two lightweight endpoints for container orchestrators (Kubernetes, Docker Swarm, ECS, Nomad):

| Endpoint | Probe Type | Checks Performed | HTTP Codes |
|---|---|---|---|
| `GET /health` | Liveness | Verifies Node.js process is active and event loop is responsive. | `200 OK` |
| `GET /ready` | Readiness | Pings MongoDB cluster and checks connection readyState. | `200 OK` (connected), `503 Service Unavailable` (disconnected) |

---

## 5. Pre-Flight Database Initialization

Before routing live traffic, execute migrations and ensure indexes and schemas are synced:

```bash
# 1. Run versioned migrations
node backend/migrations/runner.js

# 2. Sync indexes
node backend/scripts/syncIndexes.js

# 3. Apply collMod schema validators
node backend/scripts/applySchemaValidation.js

# 4. Check initial storage usage
node backend/scripts/storageReport.js --warn-threshold 400
```
