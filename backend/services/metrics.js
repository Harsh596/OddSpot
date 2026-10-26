// backend/services/metrics.js
// Prometheus metrics service using prom-client and protected by METRICS_TOKEN.

const crypto = require('crypto');
const client = require('prom-client');

const register = new client.Registry();
client.collectDefaultMetrics({ register, prefix: 'oddspot_' });

const httpRequestsTotal = new client.Counter({
  name: 'oddspot_http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDurationMs = new client.Histogram({
  name: 'oddspot_http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [5, 15, 50, 100, 200, 500, 1000, 2500, 5000],
  registers: [register],
});

const dbOperationDurationMs = new client.Histogram({
  name: 'oddspot_db_operation_duration_ms',
  help: 'MongoDB database operation duration in milliseconds',
  labelNames: ['operation', 'collection'],
  buckets: [1, 5, 15, 50, 100, 250, 500, 1000, 2500],
  registers: [register],
});

const rateLimitHitsTotal = new client.Counter({
  name: 'oddspot_rate_limit_hits_total',
  help: 'Total count of rate limit hits by limiter prefix',
  labelNames: ['limiter'],
  registers: [register],
});

const http5xxTotal = new client.Counter({
  name: 'oddspot_http_5xx_total',
  help: 'Total count of HTTP 5xx responses returned',
  labelNames: ['method', 'route'],
  registers: [register],
});

function verifyMetricsToken(req) {
  const metricsToken = process.env.METRICS_TOKEN;
  if (!metricsToken) {
    return { ok: false, status: 403, error: 'METRICS_TOKEN is not configured on this server' };
  }

  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Authorization header with Bearer token is required' };
  }

  const token = authHeader.slice(7).trim();
  const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest();
  const expectedHash = crypto.createHash('sha256').update(metricsToken, 'utf8').digest();

  if (!crypto.timingSafeEqual(tokenHash, expectedHash)) {
    return { ok: false, status: 403, error: 'Invalid metrics token' };
  }

  return { ok: true };
}

async function metricsHandler(req, res) {
  const check = verifyMetricsToken(req);
  if (!check.ok) {
    return res.status(check.status).json({
      error: { code: 'UNAUTHORIZED', message: check.error, details: [] },
      message: check.error,
      code: 'UNAUTHORIZED',
    });
  }

  res.setHeader('Content-Type', register.contentType);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const metrics = await register.metrics();
  return res.status(200).send(metrics);
}

function metricsMiddleware(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const method = req.method;
    const route = req.baseUrl
      ? `${req.baseUrl}${req.route?.path || req.path || ''}`
      : req.route?.path || req.path || 'unknown';
    const statusCode = String(res.statusCode);

    httpRequestsTotal.inc({ method, route, status_code: statusCode });
    httpRequestDurationMs.observe({ method, route, status_code: statusCode }, durationMs);

    if (res.statusCode >= 500) {
      http5xxTotal.inc({ method, route });
    }
  });

  next();
}

module.exports = {
  register,
  metricsHandler,
  metricsMiddleware,
  verifyMetricsToken,
  metrics: {
    httpRequestsTotal,
    httpRequestDurationMs,
    dbOperationDurationMs,
    rateLimitHitsTotal,
    http5xxTotal,
  },
};
