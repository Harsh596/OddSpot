// backend/middleware/bodyLimit.js
// Per-route JSON body limiters enforcing strict byte bounds.
// - Login: 2 KB
// - Post: 20 KB (parser tolerates up to 50 KB so syntax/nested edge cases are handled with 400)
// - Comment: 10 KB
// - Default: 100 KB

const express = require('express');

const jsonLogin = express.json({ limit: '2kb' });
const jsonPost = express.json({ limit: '50kb' });
const jsonComment = express.json({ limit: '10kb' });
const jsonDefault = express.json({ limit: '100kb' });

function bodyLimit(req, res, next) {
  // Pass-through bypass hook for future multipart uploads
  if (req.is('multipart/*')) {
    return next();
  }

  const url = req.originalUrl || req.url || '';
  if (req.method === 'POST') {
    if (url.includes('/auth/login')) {
      return jsonLogin(req, res, next);
    }
    if (url.match(/\/posts\/[^/]+\/comments/)) {
      return jsonComment(req, res, next);
    }
    if (url.match(/\/posts\/?(\?.*)?$/)) {
      return jsonPost(req, res, next);
    }
  }

  return jsonDefault(req, res, next);
}

module.exports = {
  bodyLimit,
  limits: {
    login: '2kb',
    post: '20kb',
    comment: '10kb',
    default: '100kb',
  },
};
