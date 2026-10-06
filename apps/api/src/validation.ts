import { z } from 'zod';
import { directiveStatuses, issueSeverities, priorities } from '@artixio/domain';

export const directiveQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  authority: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/).optional(),
  status: z.enum(directiveStatuses).optional(),
  priority: z.enum(priorities).optional(),
  hasIssues: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  issueSeverity: z.enum(issueSeverities).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(['publishedAt', 'effectiveAt', 'title', 'reference', 'priority', 'status']).default('publishedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
}).strict();

export const idSchema = z.string().uuid();
export const actionStatusBodySchema = z.object({
  status: z.enum(['PENDING', 'IN_PROGRESS', 'RESOLVED']),
}).strict();

export type DirectiveQuery = z.infer<typeof directiveQuerySchema>;
export type RequestedActionStatus = z.infer<typeof actionStatusBodySchema>['status'];
