/**
 * Database queries for directive triage. Filters and pagination run in
 * PostgreSQL; only the bounded result page is shaped for the table.
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import type { DirectiveQuery } from './validation';

// Compose validated filters as one database predicate so combinations stay consistent.
export async function listDirectives(prisma: PrismaClient, query: DirectiveQuery) {
  const and: Prisma.ComplianceDirectiveWhereInput[] = [];
  if (query.search) {
    and.push({ OR: [
      { title: { contains: query.search, mode: 'insensitive' } },
      { reference: { contains: query.search, mode: 'insensitive' } },
      { summary: { contains: query.search, mode: 'insensitive' } },
    ] });
  }
  if (query.authority) and.push({ authority: { code: query.authority.toUpperCase() } });
  if (query.status) and.push({ status: query.status });
  if (query.priority) and.push({ priority: query.priority });
  if (query.hasIssues !== undefined) and.push({ issues: query.hasIssues ? { some: {} } : { none: {} } });
  if (query.issueSeverity) and.push({ issues: { some: { severity: query.issueSeverity } } });
  const where: Prisma.ComplianceDirectiveWhereInput = { AND: and };

  // Select a Prisma order expression from known fields; never interpolate input into SQL.
  const sortFields = {
    publishedAt: { publishedAt: query.sortOrder },
    effectiveAt: { effectiveAt: query.sortOrder },
    title: { title: query.sortOrder },
    reference: { reference: query.sortOrder },
    priority: { priority: query.sortOrder },
    status: { status: query.sortOrder },
  } satisfies Record<DirectiveQuery['sortBy'], Prisma.ComplianceDirectiveOrderByWithRelationInput>;

  // Fetch related issue/action data for this page, avoiding a query per table row.
  const [total, rows] = await prisma.$transaction([
    prisma.complianceDirective.count({ where }),
    prisma.complianceDirective.findMany({
      where,
      orderBy: [sortFields[query.sortBy], { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true, reference: true, title: true, sourceStatus: true, status: true,
        priority: true, publishedAt: true, effectiveAt: true,
        authority: { select: { code: true, name: true, jurisdiction: true } },
        issues: { select: { severity: true } },
        actions: { select: { status: true } },
      },
    }),
  ]);

  return {
    data: rows.map(({ issues, actions, ...row }) => ({
      ...row,
      issueCount: issues.length,
      highestIssueSeverity: issues.some((issue) => issue.severity === 'ERROR') ? 'ERROR'
        : issues.length > 0 ? 'WARNING' : null,
      actionProgress: {
        total: actions.length,
        resolved: actions.filter((action) => action.status === 'RESOLVED').length,
        inProgress: actions.filter((action) => action.status === 'IN_PROGRESS').length,
        pending: actions.filter((action) => action.status === 'PENDING').length,
        needsReview: actions.filter((action) => action.status === 'NEEDS_REVIEW').length,
      },
    })),
    pagination: {
      page: query.page, pageSize: query.pageSize, total,
      totalPages: Math.ceil(total / query.pageSize),
    },
  };
}

// Detail keeps raw source and issue history available for regulatory review.
export function getDirective(prisma: PrismaClient, id: string) {
  return prisma.complianceDirective.findUnique({
    where: { id },
    include: {
      authority: true,
      actions: { include: { statusHistory: { orderBy: { changedAt: 'desc' } } }, orderBy: { sourceId: 'asc' } },
      issues: { orderBy: [{ severity: 'desc' }, { createdAt: 'asc' }] },
    },
  });
}
