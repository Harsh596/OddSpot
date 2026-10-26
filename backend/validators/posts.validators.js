// backend/validators/posts.validators.js
// Zod schemas with allowlists and scalar enforcement for posts, comments, voting, and reports.

const { z } = require('zod');
const {
  normalizedString,
  objectIdSchema,
  latitudeSchema,
  longitudeSchema,
  normalizeText,
} = require('./common');

function isSecureImageUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:') return true;
    if (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && parsed.hostname === 'localhost') {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Image item validator: HTTPS URL max 500 chars, optional integer width/height between 1 and 10000
const imageSchema = z
  .union([
    z
      .string({ invalid_type_error: 'Image URL must be a string' })
      .refine(isSecureImageUrl, {
        message: 'Images must use secure HTTPS URLs',
      })
      .refine((url) => url.length <= 500, {
        message: 'Image URL must not exceed 500 characters',
      }),
    z
      .object({
        url: z
          .string({ required_error: 'Image URL is required', invalid_type_error: 'Image URL must be a string' })
          .refine(isSecureImageUrl, {
            message: 'Images must use secure HTTPS URLs',
          })
          .refine((url) => url.length <= 500, {
            message: 'Image URL must not exceed 500 characters',
          }),
        width: z
          .number({ invalid_type_error: 'Width must be a number' })
          .int('Width must be an integer')
          .min(1, 'Width must be between 1 and 10000')
          .max(10000, 'Width must be between 1 and 10000')
          .optional(),
        height: z
          .number({ invalid_type_error: 'Height must be a number' })
          .int('Height must be an integer')
          .min(1, 'Height must be between 1 and 10000')
          .max(10000, 'Height must be between 1 and 10000')
          .optional(),
      })
      .strict(),
  ])
  .transform((img) => (typeof img === 'string' ? { url: img } : img));

// Tag validator: trimmed, lowercased, max 30 chars
const tagSchema = z
  .string({ invalid_type_error: 'Tag must be a text string' })
  .transform((t) => normalizeText(t).toLowerCase())
  .refine((t) => t.length >= 1 && t.length <= 30, {
    message: 'Each tag must be between 1 and 30 characters',
  });

// POST /api/v1/posts
const createPostSchema = z
  .object({
    title: normalizedString({ min: 1, max: 140, fieldName: 'Title' }),
    body: z
      .string({ invalid_type_error: 'Body must be a text string' })
      .transform((val) => normalizeText(val, { multiLine: true }))
      .refine((val) => val.length <= 10000, {
        message: 'Body must not exceed 10000 characters',
      })
      .optional(),
    latitude: z
      .number({ invalid_type_error: 'Latitude must be a valid number' })
      .refine((v) => Number.isFinite(v) && v >= -90 && v <= 90, {
        message: 'Latitude must be a number between -90 and 90',
      })
      .optional(),
    longitude: z
      .number({ invalid_type_error: 'Longitude must be a valid number' })
      .refine((v) => Number.isFinite(v) && v >= -180 && v <= 180, {
        message: 'Longitude must be a number between -180 and 180',
      })
      .optional(),
    coordinates: z
      .array(z.number({ invalid_type_error: 'Invalid coordinate values' }))
      .length(2, 'Invalid coordinate values')
      .optional(),
    city: normalizedString({ min: 1, max: 100, fieldName: 'City' }).optional(),
    country: normalizedString({ min: 1, max: 100, fieldName: 'Country' }).optional(),
    state: z
      .string({ invalid_type_error: 'State must be a text string' })
      .transform((val) => normalizeText(val))
      .refine((val) => val.length <= 100, {
        message: 'State must not exceed 100 characters',
      })
      .optional(),
    place: z
      .object({
        city: z
          .string({ invalid_type_error: 'City must be a text string' })
          .transform((val) => normalizeText(val, { maxLength: 100, fieldName: 'City' }))
          .refine((val) => val.length <= 100, 'City must not exceed 100 characters')
          .optional(),
        state: z
          .string({ invalid_type_error: 'State must be a text string' })
          .transform((val) => normalizeText(val, { maxLength: 100, fieldName: 'State' }))
          .refine((val) => val.length <= 100, 'State must not exceed 100 characters')
          .optional(),
        country: z
          .string({ invalid_type_error: 'Country must be a text string' })
          .transform((val) => normalizeText(val, { maxLength: 100, fieldName: 'Country' }))
          .refine((val) => val.length <= 100, 'Country must not exceed 100 characters')
          .optional(),
      })
      .optional(),
    type: z.enum(['find', 'identify'], {
      message: "Post type must be 'find' or 'identify'",
      errorMap: () => ({ message: "Post type must be 'find' or 'identify'" }),
    }).optional().default('find'),
    images: z
      .array(imageSchema, {
        invalid_type_error: 'Images must be an array of image URLs',
      })
      .max(6, 'Maximum of 6 images allowed')
      .optional()
      .default([]),
    tags: z
      .array(tagSchema, {
        invalid_type_error: 'Tags must be an array of strings',
      })
      .max(10, 'A post can have a maximum of 10 tags')
      .optional()
      .default([]),
    warnings: z
      .array(
        z.enum(['private_property', 'walking_required', 'unsafe_night', 'other'], {
          message: 'Invalid warning type',
        }),
        { invalid_type_error: 'Warnings must be an array of warning types' }
      )
      .optional()
      .default([]),
    hideExact: z.boolean({ invalid_type_error: 'hideExact must be a boolean' }).optional().default(false),
    // Mass-assignment guarded fields: allowed in payload for test compatibility but safely stripped
    tier: z.unknown().optional(),
    meter: z.unknown().optional(),
    authorId: z.unknown().optional(),
    removed: z.unknown().optional(),
    solved: z.unknown().optional(),
    stats: z.unknown().optional(),
  })
  .strip()
  .superRefine((data, ctx) => {
    const hasLat = typeof data.latitude === 'number';
    const hasLng = typeof data.longitude === 'number';
    const hasCoords = Array.isArray(data.coordinates) && data.coordinates.length === 2;

    if (!hasLat && !hasCoords) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latitude'],
        message: 'Latitude is required',
      });
    }
    if (!hasLng && !hasCoords) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['longitude'],
        message: 'Longitude is required',
      });
    }

    // Null Island (0, 0) check
    const latVal = typeof data.latitude === 'number' ? data.latitude : (hasCoords ? data.coordinates[1] : null);
    const lngVal = typeof data.longitude === 'number' ? data.longitude : (hasCoords ? data.coordinates[0] : null);
    if (latVal === 0 && lngVal === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latitude'],
        message: 'Coordinates (0, 0) - Null Island is not permitted',
      });
    }

    const effectiveCity = data.place && typeof data.place.city === 'string' ? data.place.city : data.city;
    const effectiveCountry = data.place && typeof data.place.country === 'string' ? data.place.country : data.country;

    if (!effectiveCity || !effectiveCity.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['city'],
        message: 'City is required and must not contain null characters',
      });
    }
    if (!effectiveCountry || !effectiveCountry.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['country'],
        message: 'Country is required and must not contain null characters',
      });
    }
  })
  .transform((data) => {
    let lat = data.latitude;
    let lng = data.longitude;
    if (Array.isArray(data.coordinates) && data.coordinates.length === 2) {
      lng = data.coordinates[0];
      lat = data.coordinates[1];
    }
    const city = data.place && data.place.city ? data.place.city : data.city;
    const country = data.place && data.place.country ? data.place.country : data.country;
    const state = data.place && data.place.state ? data.place.state : data.state;

    return {
      title: data.title,
      body: data.body,
      latitude: lat,
      longitude: lng,
      city,
      country,
      state: state || '',
      type: data.type,
      images: data.images,
      tags: data.tags,
      warnings: data.warnings,
      hideExact: data.hideExact,
    };
  });

// GET /api/v1/posts/nearby
const nearbyQuerySchema = z
  .object({
    lat: z.coerce
      .number({ required_error: 'Latitude (lat) is required', invalid_type_error: 'Latitude (lat) must be a number' })
      .refine((v) => Number.isFinite(v) && v >= -90 && v <= 90, {
        message: 'Latitude must be between -90 and 90',
      }),
    lng: z.coerce
      .number({ required_error: 'Longitude (lng) is required', invalid_type_error: 'Longitude (lng) must be a number' })
      .refine((v) => Number.isFinite(v) && v >= -180 && v <= 180, {
        message: 'Longitude must be between -180 and 180',
      }),
    maxDistance: z.coerce
      .number({ invalid_type_error: 'maxDistance must be a number' })
      .refine((v) => Number.isFinite(v), 'maxDistance must be a finite number')
      .optional()
      .default(10000),
    page: z.coerce
      .number({ invalid_type_error: 'page must be a number' })
      .optional()
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: 'limit must be a number' })
      .optional()
      .default(20),
    tier: z.enum(['city', 'state', 'country']).optional(),
  })
  .passthrough()
  .superRefine((data, ctx) => {
    if (data.lat === 0 && data.lng === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['lat'],
        message: 'Coordinates (0, 0) - Null Island is not permitted',
      });
    }
  })
  .transform((data) => ({
    ...data,
    lat: Number(data.lat.toFixed(6)),
    lng: Number(data.lng.toFixed(6)),
  }));

// Parameter with ObjectId
const postIdParamSchema = z
  .object({
    id: z
      .string({ required_error: 'Invalid post ID', invalid_type_error: 'Invalid post ID' })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid post ID'),
  })
  .strip();

// POST /api/v1/posts/:id/vote
const voteSchema = z
  .object({
    value: z
      .number({ required_error: 'Vote value is required', invalid_type_error: 'Vote value must be a number' })
      .refine((v) => v === 1 || v === -1, {
        message: 'Vote value must be 1 (like) or -1 (dislike)',
      }),
  })
  .passthrough();

// POST /api/v1/posts/:id/comments
const commentSchema = z
  .object({
    body: normalizedString({ min: 1, max: 5000, multiLine: true, fieldName: 'Comment body' }),
    parentId: z
      .string({ invalid_type_error: 'Invalid parent comment ID' })
      .refine((val) => val === '' || /^[0-9a-fA-F]{24}$/.test(val), {
        message: 'Invalid parent comment ID',
      })
      .transform((val) => (val === '' ? null : val))
      .optional()
      .nullable(),
  })
  .passthrough();

// POST /api/v1/posts/:id/report
const reportSchema = z
  .object({
    reason: z.enum(
      [
        'unsafe_or_private',
        'nsfw',
        'spam',
        'doxxing',
        'misinformation',
        'wrong_location',
        'offensive',
        'other',
      ],
      {
        message: 'A valid reason is required',
        errorMap: () => ({ message: 'A valid reason is required' }),
      }
    ),
    details: z
      .string({ invalid_type_error: 'Details must be text' })
      .transform((val) => normalizeText(val))
      .refine((val) => val.length <= 500, {
        message: 'Details must not exceed 500 characters',
      })
      .optional(),
    notes: z
      .string({ invalid_type_error: 'Notes must be text' })
      .transform((val) => normalizeText(val))
      .refine((val) => val.length <= 500, {
        message: 'Notes must not exceed 500 characters',
      })
      .optional(),
  })
  .strip();

// GET /api/v1/posts/:id/comments query validation
const commentsQuerySchema = z
  .object({
    cursor: z.string().optional(),
    page: z.coerce
      .number({ invalid_type_error: 'page must be a number' })
      .int('page must be an integer')
      .min(1, 'page must be between 1 and 100')
      .max(100, 'page must be between 1 and 100')
      .optional()
      .default(1),
    limit: z.coerce
      .number({ invalid_type_error: 'limit must be a number' })
      .int('limit must be an integer')
      .min(1, 'limit must be between 1 and 100')
      .max(50, 'limit must be between 1 and 50')
      .optional()
      .default(20),
  })
  .passthrough();

// PATCH /api/v1/posts/:id
const updatePostSchema = z
  .object({
    title: normalizedString({ min: 1, max: 140, fieldName: 'Title' }).optional(),
    body: z
      .string({ invalid_type_error: 'Body must be a text string' })
      .transform((val) => normalizeText(val, { multiLine: true }))
      .refine((val) => val.length <= 10000, {
        message: 'Body must not exceed 10000 characters',
      })
      .optional(),
    tags: z
      .array(tagSchema, {
        invalid_type_error: 'Tags must be an array of strings',
      })
      .max(10, 'A post can have a maximum of 10 tags')
      .optional(),
    warnings: z
      .array(
        z.enum(['private_property', 'walking_required', 'unsafe_night', 'other'], {
          message: 'Invalid warning type',
        }),
        { invalid_type_error: 'Warnings must be an array of warning types' }
      )
      .optional(),
    type: z.enum(['find', 'identify']).optional(),
    // Reject immutable fields
    latitude: z.any().optional(),
    longitude: z.any().optional(),
    coordinates: z.any().optional(),
    location: z.any().optional(),
    hideExact: z.any().optional(),
    place: z.any().optional(),
    city: z.any().optional(),
    country: z.any().optional(),
    state: z.any().optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.latitude !== undefined ||
      data.longitude !== undefined ||
      data.coordinates !== undefined ||
      data.location !== undefined ||
      data.hideExact !== undefined ||
      data.place !== undefined ||
      data.city !== undefined ||
      data.country !== undefined ||
      data.state !== undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['location'],
        message: 'Location and privacy settings cannot be modified after post creation',
      });
    }
  });

// PATCH /api/v1/comments/:id
const updateCommentSchema = z
  .object({
    body: normalizedString({ min: 1, max: 5000, multiLine: true, fieldName: 'Comment body' }),
  })
  .strip();

module.exports = {
  createPostSchema,
  updatePostSchema,
  nearbyQuerySchema,
  postIdParamSchema,
  voteSchema,
  commentSchema,
  updateCommentSchema,
  commentsQuerySchema,
  reportSchema,
};
