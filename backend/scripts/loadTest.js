// backend/scripts/loadTest.js
// Runs a 50-connection, 10-second autocannon benchmark against /feed/city,
// asserting p95 < 300ms and 0 errors under load.
//
// Usage:
//   node backend/scripts/loadTest.js

require('dotenv').config();
const path = require('path');
const assert = require('node:assert/strict');
const autocannon = require('autocannon');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { connect, disconnect, mongoose } = require('../db');
const { createApp } = require('../app');
const { Post, User } = require('../models');
const { seedLoadData } = require('./seedLoadData');

async function runLoadBenchmark({
  port = 5003,
  connections = 50,
  duration = 10,
  seedCount = 2000,
  quiet = false,
} = {}) {
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  log('\n======================================================');
  log(`=== OddSpot Autocannon Load Test (${connections} conns, ${duration}s) ===`);
  log('======================================================\n');

  let mongod = null;
  let server = null;

  try {
    // 1. Establish isolated replica set if not connected
    if (mongoose.connection.readyState !== 1) {
      log('Starting in-memory MongoDB replica set...');
      mongod = await MongoMemoryReplSet.create({
        replSet: { count: 1, dbName: 'oddspot_loadtest' },
      });
      await connect(mongod.getUri());
    }

    // 2. Ensure indexes and seed dataset
    log(`Seeding initial load test data (${seedCount} posts)...`);
    await seedLoadData({ totalPosts: seedCount, verifyExplain: false, quiet: true });

    // 3. Launch HTTP server
    log(`Starting backend server on port ${port}...`);
    process.env.PORT = String(port);
    process.env.NODE_ENV = 'test';
    process.env.AUTH_RATE_LIMIT_MAX = '10000';
    process.env.WRITE_RATE_LIMIT_MAX = '10000';

    const app = createApp();
    server = await new Promise((resolve) => {
      const s = app.listen(port, () => resolve(s));
    });

    const targetUrl = `http://127.0.0.1:${port}/api/v1/feed/city?cityKey=bengaluru&countryCode=IN&sort=hot`;
    log(`Benchmarking target: ${targetUrl}\n`);

    // 4. Execute autocannon benchmark
    const instance = autocannon({
      url: targetUrl,
      connections,
      duration,
      headers: {
        'Accept': 'application/json',
      },
    });

    autocannon.track(instance, { renderProgressBar: !quiet });

    const result = await new Promise((resolve, reject) => {
      instance.on('done', resolve);
      instance.on('error', reject);
    });

    log('\n======================================================');
    log('=== Autocannon Benchmark Results ===');
    log('======================================================');
    const p95Latency = result.latency.p95 ?? result.latency.p97_5 ?? result.latency.p99;

    log(`- Total Requests:      ${result.requests.total.toLocaleString()}`);
    log(`- Requests / Sec:      ${result.requests.average.toFixed(1)} req/s`);
    log(`- Transfer / Sec:      ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`);
    log(`- Latency (mean):      ${result.latency.average} ms`);
    log(`- Latency (p50):       ${result.latency.p50} ms`);
    log(`- Latency (p90):       ${result.latency.p90} ms`);
    log(`- Latency (p95/p97.5): ${p95Latency} ms`);
    log(`- Latency (p99):       ${result.latency.p99} ms`);
    log(`- Total Errors:        ${result.errors}`);
    log(`- Total Non-2xx:       ${result.non2xx}`);
    log('======================================================\n');

    // 5. Assert performance criteria: p95 < 300ms, 0 errors, 0 non-2xx
    assert.ok(
      p95Latency < 300,
      `P95 latency exceeded 300ms SLA: got ${p95Latency} ms`
    );
    assert.equal(
      result.errors,
      0,
      `Load test encountered ${result.errors} socket/connection errors`
    );
    assert.equal(
      result.non2xx,
      0,
      `Load test encountered ${result.non2xx} non-2xx HTTP responses`
    );

    log('VERIFICATION PASSED: p95 < 300ms SLA met with zero errors!\n');

    return result;
  } finally {
    if (server) {
      await new Promise((res) => server.close(res));
    }
    if (mongod) {
      await disconnect();
      await mongod.stop();
    }
  }
}

if (require.main === module) {
  runLoadBenchmark()
    .then(() => {
      process.exit(0);
    })
    .catch((err) => {
      console.error('Load test assertion failed:', err);
      process.exit(1);
    });
}

module.exports = {
  runLoadBenchmark,
};
