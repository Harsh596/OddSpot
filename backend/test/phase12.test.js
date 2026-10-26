// backend/test/phase12.test.js
// Tests for Phase P12: Observability (pino, prom-client/metrics) & Distributed Job Locks

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const { Writable } = require('stream');
const request = require('supertest');
const mongoose = require('mongoose');

const { setupTestDb, teardownTestDb, clearCollections } = require('./setup');
const { createApp } = require('../app');
const { createLogger } = require('../utils/logger');
const { runWithJobLock } = require('../services/scheduler');
const JobLock = require('../models/JobLock');

describe('Phase 12: Observability & Distributed Job Locks', () => {
  before(async () => {
    await setupTestDb();
  });

  after(async () => {
    delete process.env.METRICS_TOKEN;
    await teardownTestDb();
    if (mongoose && mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  beforeEach(async () => {
    await clearCollections();
    await JobLock.deleteMany({});
  });

  it('1. Logger redacts Authorization, password, token, and refreshToken fields and strips CRLF characters', async () => {
    let capturedLog = '';
    const dest = new Writable({
      write(chunk, encoding, callback) {
        capturedLog += chunk.toString();
        callback();
      },
    });

    const testLogger = createLogger(dest);

    const logPayload = {
      headers: {
        authorization: 'Bearer super_secret_access_jwt_token',
        cookie: 'session_id=12345; secret=xyz',
      },
      password: 'MySecretPassword123!',
      token: 'secret_reset_token',
      refreshToken: 'secret_refresh_token_xyz',
      dangerousMessage: 'First line\r\nInjected log line\r\nThird line',
    };

    testLogger.info(logPayload, 'User login attempt\r\nwith newline');

    assert(capturedLog.length > 0, 'Logger should emit output');
    const parsed = JSON.parse(capturedLog);

    // Assert redactions
    assert.strictEqual(parsed.headers.authorization, '[REDACTED]');
    assert.strictEqual(parsed.password, '[REDACTED]');
    assert.strictEqual(parsed.token, '[REDACTED]');
    assert.strictEqual(parsed.refreshToken, '[REDACTED]');

    // Assert CRLF sanitization
    assert(!parsed.dangerousMessage.includes('\r'), 'CRLF must be stripped from payload string');
    assert(!parsed.dangerousMessage.includes('\n'), 'CRLF must be stripped from payload string');
    assert(!parsed.msg.includes('\r'), 'CRLF must be stripped from log message');
    assert(!parsed.msg.includes('\n'), 'CRLF must be stripped from log message');

    const withoutTerminalNewline = capturedLog.endsWith('\n') ? capturedLog.slice(0, -1) : capturedLog;
    assert(!withoutTerminalNewline.includes('\r'), 'Serialized JSON must contain no carriage returns');
    assert(!withoutTerminalNewline.includes('\n'), 'Serialized JSON must contain no embedded line feeds');
  });

  it('2. GET /metrics rejects unauthenticated callers (401/403) and returns Prometheus metrics when valid METRICS_TOKEN is provided', async () => {
    process.env.METRICS_TOKEN = 'test-metrics-token-very-secret-12345';
    const testApp = createApp();

    // 1. Missing Authorization header -> 401
    const resNoToken = await request(testApp).get('/metrics');
    assert.strictEqual(resNoToken.status, 401);

    // 2. Invalid Token -> 403
    const resBadToken = await request(testApp)
      .get('/metrics')
      .set('Authorization', 'Bearer wrong_token_value');
    assert.strictEqual(resBadToken.status, 403);

    // 3. Valid Token -> 200 text/plain with Prometheus metrics
    const resValid = await request(testApp)
      .get('/metrics')
      .set('Authorization', `Bearer ${process.env.METRICS_TOKEN}`);

    assert.strictEqual(resValid.status, 200);
    assert(resValid.headers['content-type'].includes('text/plain'));
    assert(resValid.text.includes('oddspot_http_requests_total'));
    assert(resValid.text.includes('oddspot_http_request_duration_ms'));
    assert(resValid.text.includes('oddspot_db_operation_duration_ms'));
  });

  it('3. Distributed JobLock ensures two concurrent instances never run the same job simultaneously', async () => {
    const jobName = `test-nightly-reconcile-${Date.now()}`;
    let worker1Ran = false;
    let worker2Ran = false;

    // Simulate two concurrent workers attempting to execute the same job
    const worker1Promise = runWithJobLock(
      jobName,
      async () => {
        worker1Ran = true;
        await new Promise((r) => setTimeout(r, 80));
        return 'worker1_done';
      },
      { ttlMs: 5000, owner: 'worker-instance-1' }
    );

    const worker2Promise = runWithJobLock(
      jobName,
      async () => {
        worker2Ran = true;
        await new Promise((r) => setTimeout(r, 80));
        return 'worker2_done';
      },
      { ttlMs: 5000, owner: 'worker-instance-2' }
    );

    const [res1, res2] = await Promise.all([worker1Promise, worker2Promise]);

    const executedCount = (res1.executed ? 1 : 0) + (res2.executed ? 1 : 0);
    assert.strictEqual(executedCount, 1, `Expected exactly one worker to execute, but got ${executedCount}`);

    if (res1.executed) {
      assert.strictEqual(worker1Ran, true);
      assert.strictEqual(worker2Ran, false);
      assert.strictEqual(res2.executed, false);
      assert.strictEqual(res2.reason, 'LOCKED');
    } else {
      assert.strictEqual(worker2Ran, true);
      assert.strictEqual(worker1Ran, false);
      assert.strictEqual(res1.executed, false);
      assert.strictEqual(res1.reason, 'LOCKED');
    }

    // After completion, lock is released so a subsequent run succeeds
    const subsequentRun = await runWithJobLock(
      jobName,
      async () => 'subsequent_done',
      { ttlMs: 5000, owner: 'worker-instance-3' }
    );
    assert.strictEqual(subsequentRun.executed, true);
    assert.strictEqual(subsequentRun.result, 'subsequent_done');
  });
});
