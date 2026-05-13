import { z } from 'zod';
import { insertQuerySchema, queries, modelResponses } from './schema';

// ============================================
// SHARED ERROR SCHEMAS
// ============================================
export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

// ============================================
// API CONTRACT
// ============================================
export const api = {
  metallm: {
    // Submit a new query to be processed by multiple AIs
    submit: {
      method: 'POST' as const,
      path: '/api/metallm/process',
      input: insertQuerySchema,
      responses: {
        201: z.custom<QueryWithResponses>(), // Returns the created query + initial (empty or partial) responses
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    // Get history of queries
    list: {
      method: 'GET' as const,
      path: '/api/metallm/queries',
      responses: {
        200: z.array(z.custom<typeof queries.$inferSelect>()),
        401: errorSchemas.unauthorized,
      },
    },
    // Get a specific query details with all model responses
    get: {
      method: 'GET' as const,
      path: '/api/metallm/queries/:id',
      responses: {
        200: z.custom<QueryWithResponses>(),
        404: errorSchemas.notFound,
        401: errorSchemas.unauthorized,
      },
    },
  },
};

// Helper types
export type QueryWithResponses = typeof queries.$inferSelect & {
  responses: typeof modelResponses.$inferSelect[];
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
