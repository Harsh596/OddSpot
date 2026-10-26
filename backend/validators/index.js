// backend/validators/index.js
// Express validation middleware bridging Zod schemas to standardized error envelopes.

const { z } = require('zod');
const { ErrorCodes, formatErrorResponse } = require('./errorCodes');
const { containsNullByte } = require('./common');
const authValidators = require('./auth');
const postsValidators = require('./posts');
const commonValidators = require('./common');

// Middleware factory for validating req.body, req.query, or req.params
function validate(schema, source = 'body') {
  return (req, res, next) => {
    try {
      const data = req[source];

      // Central check for NUL bytes in source data
      if (containsNullByte(data)) {
        return res.status(400).json(
          formatErrorResponse(
            ErrorCodes.VALIDATION_FAILED,
            'Request body must not contain null characters',
            ['Null characters (\\0) are forbidden in all input fields']
          )
        );
      }

      // Execute Zod parsing, allowlisting and normalization
      const parsed = schema.parse(data);
      req[source] = parsed;
      next();
    } catch (err) {
      if (err instanceof z.ZodError || err.name === 'ZodError') {
        const issues = err.issues || err.errors || [];
        const details = issues.map((e) => {
          const path = e.path ? e.path.join('.') : '';
          return path ? `${path}: ${e.message}` : e.message;
        });
        const firstMessage = issues[0]?.message || 'Validation failed';
        return res.status(400).json(
          formatErrorResponse(ErrorCodes.VALIDATION_FAILED, firstMessage, details)
        );
      }
      next(err);
    }
  };
}

module.exports = {
  validate,
  validateBody: (schema) => validate(schema, 'body'),
  validateQuery: (schema) => validate(schema, 'query'),
  validateParams: (schema) => validate(schema, 'params'),
  auth: authValidators,
  posts: postsValidators,
  feed: require('./feed.validators'),
  mod: require('./mod.validators'),
  notifications: require('./notifications.validators'),
  communities: require('./communities.validators'),
  common: commonValidators,
  ErrorCodes,
  formatErrorResponse,
};
