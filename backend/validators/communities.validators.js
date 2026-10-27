// backend/validators/communities.validators.js
// Zod schemas for Communities creation, discovery, and community feed queries (P14).

const { z } = require('zod');
const { normalizedString } = require('./common');
const { validateSafeImageUrl } = require('../utils/imageUrlValidator');

function validateIconUrl(url, ctx) {
  if (!url) return;
  const res = validateSafeImageUrl(url);
  if (!res.valid) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: res.error || 'Icon URL must be a valid secure image URL',
    });
  }
}

const createCommunitySchema = z
  .object({
    name: z
      .string({ required_error: 'Name is required' })
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(60, 'Name must not exceed 60 characters'),
    slug: z
      .string({ required_error: 'Slug is required' })
      .trim()
      .toLowerCase()
      .min(2, 'Slug must be at least 2 characters')
      .max(60, 'Slug must not exceed 60 characters')
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Slug must contain only lowercase letters, numbers, and hyphens'
      ),
    description: z
      .string()
      .max(500, 'Description must not exceed 500 characters')
      .optional()
      .default(''),
    iconUrl: z
      .string()
      .max(500, 'Icon URL must not exceed 500 characters')
      .superRefine(validateIconUrl)
      .optional(),
    scope: z.enum(['city', 'country', 'interest']).optional().default('city'),
    place: z
      .object({
        city: z.string().max(100).optional(),
        state: z.string().max(100).optional(),
        country: z.string().max(100).optional(),
      })
      .optional(),
    coordinates: z
      .array(z.number())
      .length(2, 'Coordinates must be [longitude, latitude]')
      .refine(
        ([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
        'Coordinates must be valid [longitude, latitude]'
      )
      .optional(),
    rules: z
      .array(z.string().max(200, 'Rule must not exceed 200 characters'))
      .max(20, 'Maximum of 20 rules allowed')
      .optional()
      .default([]),
    flairs: z
      .array(z.string().max(50, 'Flair must not exceed 50 characters'))
      .max(20, 'Maximum of 20 flairs allowed')
      .optional()
      .default([]),
  })
  .strip();

const nearbyCommunitiesQuerySchema = z
  .object({
    longitude: z.coerce
      .number()
      .min(-180, 'Longitude must be between -180 and 180')
      .max(180, 'Longitude must be between -180 and 180')
      .optional(),
    latitude: z.coerce
      .number()
      .min(-90, 'Latitude must be between -90 and 90')
      .max(90, 'Latitude must be between -90 and 90')
      .optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    radius: z.coerce
      .number()
      .positive('Radius must be positive')
      .max(500000, 'Radius must not exceed 500km')
      .optional()
      .default(50000),
    q: z.string().max(100).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20),
  })
  .strip()
  .transform((val) => ({
    ...val,
    longitude: val.longitude ?? val.lng,
    latitude: val.latitude ?? val.lat,
  }));

const communityPostsQuerySchema = z
  .object({
    cursor: z.string().max(512).optional(),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(20),
    sort: z.enum(['hot', 'new', 'top']).optional().default('hot'),
  })
  .strip();

module.exports = {
  createCommunitySchema,
  nearbyCommunitiesQuerySchema,
  communityPostsQuerySchema,
};
