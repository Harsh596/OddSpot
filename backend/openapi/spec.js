// backend/openapi/spec.js
// Declarative OpenAPI 3.1.0 specification for OddSpot API.

const path = require('path');
const fs = require('fs');

function buildOpenApiSpec() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'OddSpot API',
      version: '1.0.0',
      description: 'API specification for OddSpot location-based forum with strict allowlists, authentication, and validation contracts.',
    },
    servers: [
      { url: '/api/v1', description: 'Version 1 Primary' },
      { url: '/api', description: 'Version 1 Legacy Alias' },
    ],
    paths: {
      '/health': {
        get: {
          summary: 'Service health check',
          tags: ['System'],
          responses: {
            200: {
              description: 'Service is healthy',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string', example: 'ok' },
                      time: { type: 'string', format: 'date-time' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/config/public': {
        get: {
          summary: 'Retrieve public runtime configuration and client limits',
          tags: ['System'],
          responses: {
            200: {
              description: 'Public configuration parameters',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      version: { type: 'string' },
                      limits: {
                        type: 'object',
                        properties: {
                          postMaxImages: { type: 'integer' },
                          postMaxTags: { type: 'integer' },
                          titleMaxLength: { type: 'integer' },
                          bodyMaxLength: { type: 'integer' },
                          commentMaxLength: { type: 'integer' },
                          payloadLimits: { type: 'object' },
                        },
                      },
                      features: { type: 'object' },
                    },
                  },
                },
              },
            },
          },
        },
      },
      '/auth/signup': {
        post: {
          summary: 'User registration with strict username and password validation',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['username', 'email', 'password'],
                  properties: {
                    username: { type: 'string', minLength: 3, maxLength: 24, pattern: '^[A-Za-z0-9_]{3,24}$' },
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8, maxLength: 72 },
                    confirmAge: { type: 'boolean' },
                    ageConfirmed: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'User successfully registered' },
            400: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } } },
            409: { description: 'Username or email already exists' },
          },
        },
      },
      '/auth/login': {
        post: {
          summary: 'User login with timing-equalized verification',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['identifier', 'password'],
                  properties: {
                    identifier: { type: 'string' },
                    password: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Login successful' },
            400: { description: 'Validation error' },
            401: { description: 'Invalid credentials or account locked' },
            403: { description: 'Account suspended' },
            413: { description: 'Payload too large (max 2 KB)' },
            429: { description: 'Rate limit exceeded' },
          },
        },
      },
      '/auth/refresh': {
        post: {
          summary: 'Rotate refresh token with reuse detection',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['refreshToken'],
                  properties: { refreshToken: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Token refreshed' },
            400: { description: 'Missing refresh token' },
            401: { description: 'Invalid or reused refresh token' },
            403: { description: 'Account suspended' },
          },
        },
      },
      '/auth/logout': {
        post: {
          summary: 'Revoke refresh token session',
          tags: ['Auth'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { refreshToken: { type: 'string' } },
                },
              },
            },
          },
          responses: { 200: { description: 'Logged out successfully' } },
        },
      },
      '/auth/logout-all': {
        post: {
          summary: 'Revoke all sessions for current user',
          tags: ['Auth'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'All sessions revoked' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/auth/change-password': {
        post: {
          summary: 'Change password with lockout tracking',
          tags: ['Auth'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['currentPassword', 'newPassword'],
                  properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string', minLength: 8, maxLength: 72 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Password changed successfully' },
            400: { description: 'Invalid password or incorrect current password' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/auth/forgot-password': {
        post: {
          summary: 'Initiate password reset (enumeration-safe)',
          tags: ['Auth'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { email: { type: 'string', format: 'email' } },
                },
              },
            },
          },
          responses: { 200: { description: 'Generic delivery acknowledgement' } },
        },
      },
      '/auth/reset-password': {
        post: {
          summary: 'Reset password with single-use token',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'newPassword'],
                  properties: {
                    token: { type: 'string' },
                    newPassword: { type: 'string', minLength: 8, maxLength: 72 },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Password reset successfully' },
            400: { description: 'Invalid or expired token' },
          },
        },
      },
      '/auth/verify-email': {
        post: {
          summary: 'Verify email with single-use token',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token'],
                  properties: { token: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Email verified' },
            400: { description: 'Invalid or expired token' },
          },
        },
      },
      '/auth/verify-email/request': {
        post: {
          summary: 'Request email verification token dispatch',
          tags: ['Auth'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { email: { type: 'string', format: 'email' } },
                },
              },
            },
          },
          responses: { 200: { description: 'Generic verification email sent' } },
        },
      },
      '/auth/verify-email/confirm': {
        post: {
          summary: 'Confirm email verification token',
          tags: ['Auth'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token'],
                  properties: { token: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Email verified successfully' },
            400: { description: 'Invalid or expired token' },
          },
        },
      },
      '/auth/resend-verification': {
        post: {
          summary: 'Resend email verification (enumeration-safe)',
          tags: ['Auth'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { email: { type: 'string', format: 'email' } },
                },
              },
            },
          },
          responses: { 200: { description: 'Generic delivery acknowledgement' } },
        },
      },
      '/auth/me': {
        get: {
          summary: 'Get current user profile',
          tags: ['Auth'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'Current profile data' },
            401: { description: 'Unauthorized' },
            404: { description: 'User not found' },
          },
        },
        delete: {
          summary: 'Delete user account and anonymize contributions',
          tags: ['Auth'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['currentPassword'],
                  properties: { currentPassword: { type: 'string' } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Account deleted' },
            400: { description: 'Current password incorrect or missing' },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/posts': {
        post: {
          summary: 'Create a new post',
          tags: ['Posts'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['title', 'latitude', 'longitude', 'city', 'country'],
                  properties: {
                    title: { type: 'string', minLength: 1, maxLength: 140 },
                    body: { type: 'string', maxLength: 10000 },
                    latitude: { type: 'number', minimum: -90, maximum: 90 },
                    longitude: { type: 'number', minimum: -180, maximum: 180 },
                    city: { type: 'string', maxLength: 100 },
                    country: { type: 'string', maxLength: 100 },
                    state: { type: 'string', maxLength: 100 },
                    type: { type: 'string', enum: ['find', 'identify'] },
                    images: { type: 'array', maxItems: 6, items: { type: 'string' } },
                    tags: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 30 } },
                    warnings: { type: 'array', items: { type: 'string' } },
                    hideExact: { type: 'boolean' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Post created' },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
            413: { description: 'Payload too large (max 20 KB)' },
          },
        },
      },
      '/posts/nearby': {
        get: {
          summary: 'Fetch nearby posts sorted by distance',
          tags: ['Posts'],
          parameters: [
            { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
            { name: 'maxDistance', in: 'query', required: false, schema: { type: 'number', default: 10000 } },
            { name: 'page', in: 'query', required: false, schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 20, maximum: 50 } },
            { name: 'tier', in: 'query', required: false, schema: { type: 'string', enum: ['city', 'state', 'country'] } },
          ],
          responses: {
            200: { description: 'List of nearby posts' },
            400: { description: 'Invalid coordinate or parameter' },
          },
        },
      },
      '/posts/{id}': {
        get: {
          summary: 'Get single post by ID',
          tags: ['Posts'],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } }],
          responses: {
            200: { description: 'Post details' },
            400: { description: 'Invalid ID format' },
            404: { description: 'Post not found' },
          },
        },
        patch: {
          summary: 'Edit post within 24h window (author only, immutable location)',
          tags: ['Posts'],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string', minLength: 1, maxLength: 140 },
                    body: { type: 'string', maxLength: 10000 },
                    tags: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 30 } },
                    warnings: { type: 'array', items: { type: 'string' } },
                    type: { type: 'string', enum: ['find', 'identify'] },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Post updated successfully' },
            400: { description: 'Validation error, edit window expired, or attempted location edit' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden: only author can edit post' },
            404: { description: 'Post not found' },
          },
        },
        delete: {
          summary: 'Soft-delete post (author or moderator/admin)',
          tags: ['Posts'],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Post deleted successfully' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' },
            404: { description: 'Post not found' },
          },
        },
      },
      '/posts/{id}/vote': {
        post: {
          summary: 'Cast or change vote on a post',
          tags: ['Posts'],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['value'],
                  properties: { value: { type: 'integer', enum: [1, -1] } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Vote recorded' },
            400: { description: 'Invalid vote or self-vote disallowed' },
            401: { description: 'Unauthorized' },
            404: { description: 'Post not found' },
          },
        },
      },
      '/posts/{id}/comments': {
        get: {
          summary: 'List comments for a post',
          tags: ['Posts'],
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
          ],
          responses: {
            200: { description: 'Comment list' },
            400: { description: 'Invalid post ID' },
            404: { description: 'Post not found' },
          },
        },
        post: {
          summary: 'Add comment to a post',
          tags: ['Posts'],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['body'],
                  properties: {
                    body: { type: 'string', minLength: 1, maxLength: 5000 },
                    parentId: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Comment created' },
            400: { description: 'Validation error' },
            401: { description: 'Unauthorized' },
            404: { description: 'Post not found' },
            413: { description: 'Payload too large (max 10 KB)' },
          },
        },
      },
      '/posts/{id}/report': {
        post: {
          summary: 'Submit a moderation report for a post',
          tags: ['Posts'],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['reason'],
                  properties: {
                    reason: { type: 'string', enum: ['spam', 'unsafe_or_private', 'wrong_location', 'offensive', 'other'] },
                    notes: { type: 'string', maxLength: 500 },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Report created' },
            400: { description: 'Self-reporting or invalid reason' },
            401: { description: 'Unauthorized' },
            404: { description: 'Post not found' },
            409: { description: 'Duplicate report' },
          },
        },
      },
      '/comments/{id}': {
        patch: {
          summary: 'Edit comment (author only)',
          tags: ['Comments'],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['body'],
                  properties: { body: { type: 'string', minLength: 1, maxLength: 5000 } },
                },
              },
            },
          },
          responses: {
            200: { description: 'Comment updated successfully' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' },
            404: { description: 'Comment not found' },
          },
        },
        delete: {
          summary: 'Soft-delete comment (author or moderator/admin)',
          tags: ['Comments'],
          security: [{ BearerAuth: [] }],
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Comment deleted successfully' },
            401: { description: 'Unauthorized' },
            403: { description: 'Forbidden' },
            404: { description: 'Comment not found' },
          },
        },
      },
      '/users/{username}': {
        get: {
          summary: 'Get public user profile (PII safe)',
          tags: ['Users'],
          parameters: [{ name: 'username', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Public user profile' },
            404: { description: 'User not found' },
          },
        },
      },
      '/users/me/posts': {
        get: {
          summary: "List authenticated user's posts",
          tags: ['Users'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: "List of caller's active posts" },
            401: { description: 'Unauthorized' },
          },
        },
      },
      '/users/me/export': {
        get: {
          summary: "Complete data export for caller (GDPR compliance)",
          tags: ['Users'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: { description: 'JSON dump of user profile, posts, comments, votes, and reports' },
            401: { description: 'Unauthorized' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          required: ['error', 'code', 'message', 'details'],
          properties: {
            error: { type: 'string', description: 'Dual-compatible error message string' },
            code: { type: 'string', description: 'Machine-readable error code' },
            message: { type: 'string', description: 'Human-readable error explanation' },
            details: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of detailed field or constraint validation errors',
            },
          },
        },
      },
    },
  };
}

// Writes generated specification to both docs/openapi.json and backend/docs/openapi.json
function writeOpenApiJson() {
  const spec = buildOpenApiSpec();
  const rootDocsDir = path.resolve(__dirname, '../../docs');
  const backendDocsDir = path.resolve(__dirname, '../docs');

  if (!fs.existsSync(rootDocsDir)) {
    fs.mkdirSync(rootDocsDir, { recursive: true });
  }
  if (!fs.existsSync(backendDocsDir)) {
    fs.mkdirSync(backendDocsDir, { recursive: true });
  }

  const rootPath = path.join(rootDocsDir, 'openapi.json');
  const backendPath = path.join(backendDocsDir, 'openapi.json');

  const content = JSON.stringify(spec, null, 2);
  fs.writeFileSync(rootPath, content, 'utf8');
  fs.writeFileSync(backendPath, content, 'utf8');

  return rootPath;
}

module.exports = {
  buildOpenApiSpec,
  spec: buildOpenApiSpec(),
  writeOpenApiJson,
};
