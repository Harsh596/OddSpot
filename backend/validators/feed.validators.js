// backend/validators/feed.validators.js
// Zod validation schemas for regional feeds (/feed/city, /feed/country, /feed/random)

const { z } = require('zod');

// GET /api/v1/feed/city
const cityFeedQuerySchema = z
  .object({
    city: z.string().max(100, 'City must not exceed 100 characters').optional(),
    cityKey: z.string().max(100, 'City key must not exceed 100 characters').optional(),
    country: z.string().max(100, 'Country must not exceed 100 characters').optional(),
    countryCode: z.string().max(10, 'Country code must not exceed 10 characters').optional(),
    sort: z.enum(['new', 'hot', 'top']).optional().default('new'),
    limit: z.coerce.number().optional().default(20),
    cursor: z.string().max(512).optional(),
    page: z.coerce.number().optional(),
  })
  .strip()
  .superRefine((data, ctx) => {
    if (!data.city && !data.cityKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cityKey'],
        message: 'City (city or cityKey) is required',
      });
    }
    if (!data.country && !data.countryCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['countryCode'],
        message: 'Country (country or countryCode) is required',
      });
    }
  });

// GET /api/v1/feed/country
const countryFeedQuerySchema = z
  .object({
    country: z.string().max(100, 'Country must not exceed 100 characters').optional(),
    countryCode: z.string().max(10, 'Country code must not exceed 10 characters').optional(),
    sort: z.enum(['new', 'hot', 'top']).optional().default('new'),
    limit: z.coerce.number().optional().default(20),
    cursor: z.string().max(512).optional(),
    page: z.coerce.number().optional(),
  })
  .strip()
  .superRefine((data, ctx) => {
    if (!data.country && !data.countryCode) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['countryCode'],
        message: 'Country (country or countryCode) is required',
      });
    }
  });

// GET /api/v1/feed/random
const randomFeedQuerySchema = z
  .object({
    country: z.string().max(100, 'Country must not exceed 100 characters').optional(),
    countryCode: z.string().max(10, 'Country code must not exceed 10 characters').optional(),
    limit: z.coerce.number().optional().default(10),
  })
  .strip();

module.exports = {
  cityFeedQuerySchema,
  countryFeedQuerySchema,
  randomFeedQuerySchema,
};
