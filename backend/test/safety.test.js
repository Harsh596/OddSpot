// backend/test/safety.test.js
// Verifies production-DB refusal safety barrier and rate limit production enforcement

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertSafeTestDatabase } = require('./setup');
const { getAuthRateLimitMax, getWriteRateLimitMax } = require('../config/rateLimits');

describe('Database Safety & Production Guards', () => {
  it('1. Refuses production Atlas URI with db oddspot', () => {
    assert.throws(
      () => {
        assertSafeTestDatabase(
          'mongodb+srv://oddspot_admin:password123@cluster0.mongodb.net/oddspot?retryWrites=true&w=majority'
        );
      },
      /Safety violation/
    );
  });

  it('2. Refuses local production URI with db oddspot', () => {
    assert.throws(
      () => {
        assertSafeTestDatabase('mongodb://localhost:27017/oddspot');
      },
      /Safety violation/
    );
  });

  it('3. Refuses case-insensitive variants of oddspot (e.g. ODDSPOT)', () => {
    assert.throws(
      () => {
        assertSafeTestDatabase('mongodb://127.0.0.1:27017/ODDSPOT?authSource=admin');
      },
      /Safety violation/
    );
  });

  it('4. Refuses empty or non-string URIs', () => {
    assert.throws(
      () => {
        assertSafeTestDatabase('');
      },
      /Safety violation/
    );
    assert.throws(
      () => {
        assertSafeTestDatabase(null);
      },
      /Safety violation/
    );
  });

  it('5. Permits oddspot_test and oddspot_test_2 test URIs', () => {
    assert.doesNotThrow(() => {
      assertSafeTestDatabase('mongodb://localhost:27017/oddspot_test');
    });
    assert.doesNotThrow(() => {
      assertSafeTestDatabase('mongodb://localhost:27017/oddspot_test_2');
    });
    assert.doesNotThrow(() => {
      assertSafeTestDatabase('mongodb://127.0.0.1:54321/oddspot_test_2?replicaSet=testset');
    });
  });

  it('6. Production rate limits strictly enforce defaults regardless of env overrides', () => {
    const origEnv = process.env.NODE_ENV;
    const origAuth = process.env.AUTH_RATE_LIMIT_MAX;
    const origWrite = process.env.WRITE_RATE_LIMIT_MAX;

    try {
      process.env.NODE_ENV = 'production';
      process.env.AUTH_RATE_LIMIT_MAX = '99999';
      process.env.WRITE_RATE_LIMIT_MAX = '99999';

      assert.strictEqual(getAuthRateLimitMax(20), 20);
      assert.strictEqual(getWriteRateLimitMax(30), 30);
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.AUTH_RATE_LIMIT_MAX = origAuth;
      process.env.WRITE_RATE_LIMIT_MAX = origWrite;
    }
  });

  it('7. Non-production rate limits honor overrides', () => {
    const origEnv = process.env.NODE_ENV;
    const origAuth = process.env.AUTH_RATE_LIMIT_MAX;
    const origWrite = process.env.WRITE_RATE_LIMIT_MAX;

    try {
      process.env.NODE_ENV = 'test';
      process.env.AUTH_RATE_LIMIT_MAX = '10000';
      process.env.WRITE_RATE_LIMIT_MAX = '5000';

      assert.strictEqual(getAuthRateLimitMax(20), 10000);
      assert.strictEqual(getWriteRateLimitMax(30), 5000);
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.AUTH_RATE_LIMIT_MAX = origAuth;
      process.env.WRITE_RATE_LIMIT_MAX = origWrite;
    }
  });
});
