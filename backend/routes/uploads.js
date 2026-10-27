// backend/routes/uploads.js
// Signed image upload endpoints and provider dispatching (P15).

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { uploadSignLimiter } = require('../config/rateLimits');
const {
  validateBody,
  uploads: uploadsValidators,
  ErrorCodes,
  formatErrorResponse,
} = require('../validators');
const {
  MAX_UPLOAD_BYTES,
  generateUploadSignature,
} = require('../services/uploadProvider');

const router = Router();

// All upload signing endpoints require authentication and per-user hourly rate limiting
router.use(requireAuth);

/**
 * POST /api/v1/uploads/sign
 * Generates presigned upload parameters / HMAC signatures for direct browser uploads.
 */
router.post(
  '/sign',
  uploadSignLimiter,
  validateBody(uploadsValidators.signUploadSchema),
  async (req, res, next) => {
    try {
      const { mimeType, sizeBytes, purpose } = req.body;

      // 1. Enforce max file size limit (5 MB = 5242880 bytes) with HTTP 413
      if (sizeBytes > MAX_UPLOAD_BYTES) {
        return res.status(413).json(
          formatErrorResponse(
            ErrorCodes.PAYLOAD_TOO_LARGE,
            `File size (${sizeBytes} bytes) exceeds maximum limit of ${MAX_UPLOAD_BYTES} bytes (5 MB)`
          )
        );
      }

      // 2. Generate signed upload parameters via active upload provider
      const uploadParams = await generateUploadSignature({
        userId: req.user.id,
        mimeType,
        sizeBytes,
        purpose,
      });

      return res.status(200).json(uploadParams);
    } catch (err) {
      if (err.statusCode === 413 || err.code === 'PAYLOAD_TOO_LARGE') {
        return res.status(413).json(
          formatErrorResponse(
            ErrorCodes.PAYLOAD_TOO_LARGE,
            err.message
          )
        );
      }

      if (err.statusCode === 501 || err.code === 'UPLOAD_PROVIDER_DISABLED') {
        return res.status(501).json({
          error: {
            code: 'UPLOAD_PROVIDER_DISABLED',
            message:
              err.message ||
              'Direct upload signing is disabled until an image host is configured; supply an allowlisted HTTPS image URL directly.',
            details: [],
          },
          code: 'UPLOAD_PROVIDER_DISABLED',
          message:
            err.message ||
            'Direct upload signing is disabled until an image host is configured; supply an allowlisted HTTPS image URL directly.',
          details: [],
        });
      }

      if (err.statusCode === 400 || err.code === 'VALIDATION_FAILED') {
        return res.status(400).json(
          formatErrorResponse(
            ErrorCodes.VALIDATION_FAILED,
            err.message
          )
        );
      }

      next(err);
    }
  }
);

module.exports = router;
