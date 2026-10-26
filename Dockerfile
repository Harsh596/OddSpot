# Multi-stage Dockerfile for Oddspot Backend (Node 20 Alpine)

# Stage 1: Dependencies builder
FROM node:20-alpine AS builder
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Stage 2: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5001

# Run as non-root user for container security
USER node

# Copy dependencies and application source
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node backend ./

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:5001/health || exit 1

CMD ["node", "server.js"]
