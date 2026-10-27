// backend/services/uploadProvider.js
// Pluggable image upload provider interface with allowlist-only default and Cloudinary/R2 adapters (P15).
//
// ============================================================================
// ARCHITECTURAL NOTES & PRIVACY / SAFETY HOOKS:
// ============================================================================
// 1. EXIF Metadata Stripping (Privacy Protection):
//    Raw JPEG/PNG photos taken by smartphones contain EXIF tags (e.g. GPS latitude/
//    longitude coordinates, altitude, device serial number, timestamp). To ensure
//    scout anonymity and prevent unintended location leaks on approximate/fuzzed
//    posts, all uploads must be stripped of EXIF profiles prior to public serving:
//      - Cloudinary: 'transformation=fl_strip_profile' forces immediate server-side
//        stripping of ICC, IPTC, and GPS EXIF metadata chunks upon ingestion.
//      - S3 / R2: Direct uploads should be post-processed via a Cloudflare Worker
//        or server-side pipeline (e.g. sharp().rotate().withMetadata({ exif: false }))
//        before public bucket replication.
//
// 2. Content Moderation Hooks (Safety Policy):
//    Upload signing parameters can include automated moderation pipelines:
//      - Cloudinary: 'moderation=aws_rek' or 'moderation=webpurify' to automatically
//        quarantine NSFW, violence, or CSAM content before assets become publicly accessible.
//      - Webhook notifications: Cloudinary/R2 webhooks notify OddSpot moderation backend
//        to update post/asset status if an asset fails automated safety checks.
// ============================================================================

const crypto = require('crypto');

const ALLOWED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const MAX_UPLOAD_BYTES = 5242880; // 5 MB (5 * 1024 * 1024 bytes)

const ALLOWED_PURPOSES = Object.freeze([
  'post_image',
  'visit_photo',
  'avatar',
]);

/**
 * Resolves active upload provider name from environment.
 * Default is 'allowlist' (requires zero keys / external services).
 */
function getActiveProviderName() {
  const envVal = (process.env.UPLOAD_PROVIDER || '').trim().toLowerCase();
  if (!envVal || envVal === 'allowlist') {
    return 'allowlist';
  }
  return envVal;
}

/**
 * Checks if Cloudinary is fully configured with required credentials.
 */
function isCloudinaryConfigured() {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  return Boolean(cloudName && apiKey && apiSecret);
}

/**
 * Checks if Cloudflare R2 / S3 is fully configured with required credentials.
 */
function isR2Configured() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  return Boolean(accountId && accessKeyId && secretAccessKey && bucketName);
}

/**
 * Generates an upload signing payload based on the active provider.
 *
 * @param {Object} params
 * @param {string} params.userId - Authenticated user ID requesting the upload
 * @param {string} params.mimeType - MIME type of the file (must be in ALLOWED_MIME_TYPES)
 * @param {number} params.sizeBytes - File size in bytes (must be <= MAX_UPLOAD_BYTES)
 * @param {string} [params.purpose='post_image'] - Purpose of the image upload
 * @returns {Promise<Object>} Provider upload configuration and credentials
 */
async function generateUploadSignature({ userId, mimeType, sizeBytes, purpose = 'post_image' }) {
  // 1. Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    const err = new Error(
      `Unsupported MIME type "${mimeType}". Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
    );
    err.statusCode = 400;
    err.code = 'VALIDATION_FAILED';
    throw err;
  }

  // 2. Validate file size (max 5 MB)
  if (!sizeBytes || typeof sizeBytes !== 'number' || sizeBytes > MAX_UPLOAD_BYTES) {
    const err = new Error(
      `File size (${sizeBytes || 0} bytes) exceeds the maximum allowed limit of ${MAX_UPLOAD_BYTES} bytes (5 MB)`
    );
    err.statusCode = 413;
    err.code = 'PAYLOAD_TOO_LARGE';
    throw err;
  }

  // 3. Validate purpose
  const targetPurpose = ALLOWED_PURPOSES.includes(purpose) ? purpose : 'post_image';

  const providerName = getActiveProviderName();

  // Mode A: Allowlist / Default (No external provider active)
  if (providerName === 'allowlist') {
    const err = new Error(
      'Direct upload signing is disabled until an image host is configured; supply an allowlisted HTTPS image URL directly.'
    );
    err.statusCode = 501;
    err.code = 'UPLOAD_PROVIDER_DISABLED';
    err.details = [];
    throw err;
  }

  // Mode B: Cloudinary
  if (providerName === 'cloudinary') {
    if (!isCloudinaryConfigured()) {
      const err = new Error(
        'Cloudinary provider is selected but credentials are not configured; supply an allowlisted HTTPS image URL directly.'
      );
      err.statusCode = 501;
      err.code = 'UPLOAD_PROVIDER_DISABLED';
      err.details = [];
      throw err;
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    const timestamp = Math.floor(Date.now() / 1000);
    const folder = 'oddspot';
    const transformation = 'fl_strip_profile'; // EXIF stripping hook

    // Cloudinary signature parameter string: sorted alphabetically by key name
    // Keys: folder, timestamp, transformation
    const paramString = `folder=${folder}&timestamp=${timestamp}&transformation=${transformation}`;
    const stringToSign = `${paramString}${apiSecret}`;

    const signature = crypto.createHash('sha1').update(stringToSign).digest('hex');

    return {
      provider: 'cloudinary',
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      apiKey,
      timestamp,
      folder,
      transformation,
      signature,
      maxSizeBytes: MAX_UPLOAD_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      purpose: targetPurpose,
    };
  }

  // Mode C: Cloudflare R2 / S3 Stub
  if (providerName === 'r2' || providerName === 's3') {
    if (!isR2Configured()) {
      const err = new Error(
        'R2/S3 provider is selected but credentials are not configured; supply an allowlisted HTTPS image URL directly.'
      );
      err.statusCode = 501;
      err.code = 'UPLOAD_PROVIDER_DISABLED';
      err.details = [];
      throw err;
    }

    const accountId = process.env.R2_ACCOUNT_ID;
    const bucketName = process.env.R2_BUCKET_NAME;
    const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
    const randomSuffix = crypto.randomBytes(8).toString('hex');
    const objectKey = `oddspot/${targetPurpose}/${Date.now()}-${randomSuffix}.${extension}`;

    return {
      provider: 'r2',
      uploadUrl: `https://${accountId}.r2.cloudflarestorage.com/${bucketName}`,
      key: objectKey,
      maxSizeBytes: MAX_UPLOAD_BYTES,
      allowedMimeTypes: ALLOWED_MIME_TYPES,
      purpose: targetPurpose,
      stub: true,
    };
  }

  // Unknown provider fallback
  const err = new Error(`Unsupported upload provider: "${providerName}"`);
  err.statusCode = 501;
  err.code = 'UPLOAD_PROVIDER_DISABLED';
  err.details = [];
  throw err;
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  ALLOWED_PURPOSES,
  getActiveProviderName,
  isCloudinaryConfigured,
  isR2Configured,
  generateUploadSignature,
};
