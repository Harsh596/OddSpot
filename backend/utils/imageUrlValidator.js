// backend/utils/imageUrlValidator.js
// Strict image URL validation and SSRF prevention (P15).
// Strictly validates syntax, protocol, credentials, IP literals, and optional host allowlists.
// CRITICAL: NEVER executes network fetch(), http.get(), or DNS resolution against user-supplied URLs (Zero SSRF).

const net = require('net');

/**
 * Checks whether a hostname string is an IP address or internal host.
 * Blocks IPv4, IPv6, hex/octal/integer encodings, and local/loopback names.
 */
function isIpOrInternalHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;

  const lower = hostname.toLowerCase().trim();

  // Strip IPv6 brackets if present e.g. [::1] -> ::1
  const cleanHost = lower.startsWith('[') && lower.endsWith(']')
    ? lower.slice(1, -1)
    : lower;

  // 1. Localhost and local names
  if (
    cleanHost === 'localhost' ||
    cleanHost.endsWith('.localhost') ||
    cleanHost === 'local' ||
    cleanHost.endsWith('.local') ||
    cleanHost.endsWith('.internal') ||
    cleanHost.endsWith('.lan')
  ) {
    return true;
  }

  // 2. Direct IPv4 or IPv6 detection via node:net
  if (net.isIP(cleanHost) !== 0) {
    return true;
  }

  // 3. Alternative IP encodings: integer (e.g. 2130706433), hex (0x7f000001), octal
  if (/^\d+$/.test(cleanHost) || /^0x[0-9a-f]+$/i.test(cleanHost) || /^0[0-7]+$/.test(cleanHost)) {
    return true;
  }

  // 4. Dotted numbers (e.g., partial hex/octal or dotted integer representations like 0177.0.0.1, 127.1, 10.1)
  const parts = cleanHost.split('.');
  if (parts.length >= 2 && parts.length <= 4 && parts.every((p) => /^(\d+|0x[0-9a-f]+)$/i.test(p))) {
    return true;
  }

  // 5. IPv6 substrings, mapped IPv4 (::ffff:), or colons
  if (cleanHost.includes(':')) {
    return true;
  }

  return false;
}

/**
 * Verifies if a hostname is allowed based on process.env.IMAGE_HOST_ALLOWLIST.
 * When IMAGE_HOST_ALLOWLIST is not set or empty, all non-IP public domains are permitted.
 * When set, hostname must match an entry (exact match or *.domain wildcard).
 */
function isHostAllowlisted(hostname) {
  const allowlistEnv = process.env.IMAGE_HOST_ALLOWLIST;
  if (!allowlistEnv || !allowlistEnv.trim()) {
    return true; // No allowlist restriction active
  }

  const allowedEntries = allowlistEnv
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (allowedEntries.length === 0) {
    return true;
  }

  const lowerHost = hostname.toLowerCase();

  return allowedEntries.some((entry) => {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(2);
      return lowerHost === suffix || lowerHost.endsWith('.' + suffix);
    }
    return lowerHost === entry;
  });
}

/**
 * Comprehensive syntactic validator for image URLs.
 * Returns { valid: boolean, error?: string, parsedUrl?: URL }
 */
function validateImageUrl(urlStr) {
  if (typeof urlStr !== 'string') {
    return { valid: false, error: 'Image URL must be a string' };
  }

  const trimmed = urlStr.trim();
  if (!trimmed) {
    return { valid: false, error: 'Image URL cannot be empty' };
  }

  if (trimmed.length > 500) {
    return { valid: false, error: 'Image URL must not exceed 500 characters' };
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // 1. Enforce HTTPS only (Zero HTTP, file:, data:, javascript:, ftp:)
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Images must use secure HTTPS URLs' };
  }

  // 2. Disallow embedded credentials in URL (e.g. https://user:pass@domain.com/)
  if (parsed.username || parsed.password) {
    return { valid: false, error: 'Image URL must not contain credentials' };
  }

  // 3. Block IP literals, localhost, link-local, RFC1918, and internal hosts (SSRF Prevention)
  const hostname = parsed.hostname;
  if (!hostname || isIpOrInternalHost(hostname)) {
    return {
      valid: false,
      error: 'Image URL host is not permitted (IP literals and local hosts are blocked)',
    };
  }

  // 4. Enforce IMAGE_HOST_ALLOWLIST when configured
  if (!isHostAllowlisted(hostname)) {
    return {
      valid: false,
      error: `Image host "${hostname}" is not on the allowed host list`,
    };
  }

  return { valid: true, parsedUrl: parsed };
}

/**
 * Boolean helper for Zod schema refinements.
 */
function isSecureImageUrl(urlStr) {
  return validateImageUrl(urlStr).valid;
}

module.exports = {
  validateImageUrl,
  validateSafeImageUrl: validateImageUrl,
  isSecureImageUrl,
  isIpOrInternalHost,
  isHostAllowlisted,
};
