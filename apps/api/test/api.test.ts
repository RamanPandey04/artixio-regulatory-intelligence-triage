import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { createApp } from '../src/app';

const base = process.env.DATABASE_URL;
if (!base) throw new Error('DATABASE_URL is required for API tests.');
const testUrl = new URL(base);
testUrl.searchParams.set('schema', 'api_test');
const prisma = new PrismaClient({ datasources: { db: { url: testUrl.toString() } } });
const app = createApp(prisma);

let directiveId: string;
let actionId: string;

beforeEach(async () => {
  await prisma.complianceDirective.deleteMany();
  await prisma.regulatoryAuthority.deleteMany();
  const nmc = await prisma.regulatoryAuthority.create({ data: {
    code: 'NMC', name: 'National Medicines Commission', jurisdiction: 'United Kingdom',
  } });
  const fsa = await prisma.regulatoryAuthority.create({ data: {
    code: 'FSA', name: 'Food Safety Agency', jurisdiction: 'European Union',
  } });
  const sourceSystem = 'API_TEST';
  const first = await prisma.complianceDirective.create({ data: {
    authorityId: nmc.id, sourceSystem, sourceId: 'T-001', reference: 'NMC-001',
    title: 'Clinical reporting notice', summary: 'Adverse event reporting.',
    sourceStatus: 'ACTIVE', status: 'ACTIVE', priority: 'HIGH',
    publishedAt: new Date('2026-01-01'), effectiveAt: new Date('2026-02-01'),
    rawSource: { title: 'Clinical reporting notice', sourceStatus: 'ACTIVE' },
  } });
  directiveId = first.id;
  const action = await prisma.actionItem.create({ data: {
    directiveId: first.id, sourceId: 'ACT-1', title: 'Assess reporting',
    sourceStatus: 'PENDING', status: 'PENDING', dueAt: new Date('2027-01-01'),
  } });
  actionId = action.id;
  await prisma.dataQualityIssue.create({ data: {
    directiveId: first.id, actionId: action.id, code: 'EFFECTIVE_BEFORE_PUBLICATION',
    severity: 'ERROR', field: 'effectiveAt', rawValue: '2025-12-31', explanation: 'Test issue.',
  } });

  const second = await prisma.complianceDirective.create({ data: {
    authorityId: fsa.id, sourceSystem, sourceId: 'T-002', reference: 'FSA-002',
    title: 'Label review', summary: 'Food labeling.', sourceStatus: 'ACTIVE / WITHDRAWN',
    status: 'NEEDS_REVIEW', priority: 'LOW', publishedAt: new Date('2026-02-01'),
    effectiveAt: null, rawSource: { sourceStatus: 'ACTIVE / WITHDRAWN' },
  } });
  await prisma.actionItem.create({ data: {
    directiveId: second.id, sourceId: 'ACT-1', title: 'Review label',
    sourceStatus: 'RESOLVED', status: 'NEEDS_REVIEW',
  } });
  await prisma.dataQualityIssue.create({ data: {
    directiveId: second.id, code: 'CONFLICTING_SOURCE_STATUS', severity: 'WARNING',
    field: 'sourceStatus', rawValue: 'ACTIVE / WITHDRAWN', explanation: 'Test issue.',
  } });

  const third = await prisma.complianceDirective.create({ data: {
    authorityId: nmc.id, sourceSystem, sourceId: 'T-003', reference: 'NMC-003',
    title: 'Supplier records', summary: 'Traceability records.', sourceStatus: 'ACTIVE',
    status: 'ACTIVE', priority: 'MEDIUM', publishedAt: new Date('2026-03-01'),
    effectiveAt: new Date('2026-04-01'), rawSource: { sourceStatus: 'ACTIVE' },
  } });
  await prisma.actionItem.create({ data: {
    directiveId: third.id, sourceId: 'ACT-1', title: 'Close assessment',
    sourceStatus: 'RESOLVED', status: 'RESOLVED', resolvedAt: new Date('2026-03-15'),
  } });

  await prisma.complianceDirective.create({ data: {
    authorityId: fsa.id, sourceSystem, sourceId: 'T-004', reference: 'FSA-004',
    title: 'Packaging controls', summary: 'Packaging requirements.', sourceStatus: 'WITHDRAWN',
    status: 'WITHDRAWN', priority: 'MEDIUM', publishedAt: new Date('2026-04-01'),
    effectiveAt: new Date('2026-05-01'), rawSource: { sourceStatus: 'WITHDRAWN' },
  } });
});

afterAll(async () => { await prisma.$disconnect(); });

describe('API', () => {
  it('reports health and database connectivity', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', database: 'ok' });
  });

  it('returns a bounded directive list with counts and pagination', async () => {
    const response = await request(app).get('/api/directives?pageSize=2&sortBy=publishedAt&sortOrder=asc');
    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 2, total: 4, totalPages: 2 });
    expect(response.body.data.map((row: { reference: string }) => row.reference)).toEqual(['NMC-001', 'FSA-002']);
    expect(response.body.data[0]).toMatchObject({ issueCount: 1, highestIssueSeverity: 'ERROR',
      actionProgress: { total: 1, pending: 1, resolved: 0 } });
  });

  it('searches text and combines authority, priority, and status filters', async () => {
    const response = await request(app).get('/api/directives?search=reporting&authority=nmc&priority=HIGH&status=ACTIVE');
    expect(response.status).toBe(200);
    expect(response.body.data.map((row: { reference: string }) => row.reference)).toEqual(['NMC-001']);
  });

  it('filters canonical status', async () => {
    const response = await request(app).get('/api/directives?status=NEEDS_REVIEW');
    expect(response.body.data.map((row: { reference: string }) => row.reference)).toEqual(['FSA-002']);
  });

  it('filters records with and without issues', async () => {
    const flagged = await request(app).get('/api/directives?hasIssues=true');
    const clean = await request(app).get('/api/directives?hasIssues=false');
    expect(flagged.body.pagination.total).toBe(2);
    expect(clean.body.pagination.total).toBe(2);
    expect(clean.body.data.every((row: { issueCount: number }) => row.issueCount === 0)).toBe(true);
  });

  it('filters issue severity and combines it with hasIssues', async () => {
    const errors = await request(app).get('/api/directives?hasIssues=true&issueSeverity=ERROR');
    const warnings = await request(app).get('/api/directives?issueSeverity=WARNING');
    const impossible = await request(app).get('/api/directives?hasIssues=false&issueSeverity=ERROR');
    expect(errors.body.data.map((row: { reference: string }) => row.reference)).toEqual(['NMC-001']);
    expect(warnings.body.data.map((row: { reference: string }) => row.reference)).toEqual(['FSA-002']);
    expect(impossible.body.pagination.total).toBe(0);
  });

  it('rejects malformed filters and pagination with 400', async () => {
    for (const query of ['hasIssues=yes', 'page=abc', 'pageSize=101', 'sortBy=rawSource', 'status=UNKNOWN']) {
      const response = await request(app).get(`/api/directives?${query}`);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('returns full detail including raw source, issues, actions, and authority', async () => {
    const response = await request(app).get(`/api/directives/${directiveId}`);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      id: directiveId, authority: { code: 'NMC' }, rawSource: { sourceStatus: 'ACTIVE' },
      issues: [{ severity: 'ERROR' }], actions: [{ id: actionId, statusHistory: [] }],
    });
  });

  it('rejects an issue linked to an action on a different directive', async () => {
    const other = await prisma.actionItem.findFirstOrThrow({ where: { sourceId: 'ACT-1', directive: { sourceId: 'T-002' } } });
    await expect(prisma.$executeRaw`
      INSERT INTO "DataQualityIssue" ("id", "directiveId", "actionId", "code", "severity", "field", "explanation")
      VALUES (${randomUUID()}::uuid, ${directiveId}::uuid, ${other.id}::uuid,
        'MALFORMED_TEXT'::"IssueCode", 'WARNING'::"IssueSeverity", 'title', 'Cross-directive issue')
    `).rejects.toMatchObject({ code: 'P2010' });
  });

  it('returns 404 for a missing directive', async () => {
    const response = await request(app).get('/api/directives/00000000-0000-4000-8000-000000000000');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects invalid PATCH bodies and malformed JSON', async () => {
    const invalid = await request(app).patch(`/api/action-items/${actionId}/status`).send({ status: 'NEEDS_REVIEW' });
    const malformed = await request(app).patch(`/api/action-items/${actionId}/status`)
      .set('Content-Type', 'application/json').send('{bad');
    expect(invalid.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for a missing action', async () => {
    const response = await request(app).patch('/api/action-items/00000000-0000-4000-8000-000000000000/status')
      .send({ status: 'RESOLVED' });
    expect(response.status).toBe(404);
  });

  it('sets resolvedAt and records a status transition atomically', async () => {
    const before = await prisma.complianceDirective.findUniqueOrThrow({
      where: { id: directiveId }, include: { issues: true },
    });
    const response = await request(app).patch(`/api/action-items/${actionId}/status`).send({ status: 'RESOLVED' });
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('RESOLVED');
    expect(response.body.data.resolvedAt).toBeTruthy();
    const history = await prisma.actionItemStatusHistory.findMany({ where: { actionItemId: actionId } });
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ previousStatus: 'PENDING', newStatus: 'RESOLVED' });
    expect(history[0]?.changedAt.toISOString()).toBe(response.body.data.resolvedAt);
    const after = await prisma.complianceDirective.findUniqueOrThrow({
      where: { id: directiveId }, include: { issues: true },
    });
    expect(after.rawSource).toEqual(before.rawSource);
    expect(after.sourceStatus).toBe(before.sourceStatus);
    expect(after.issues).toEqual(before.issues);
  });

  it('clears resolvedAt when reopening and does not audit a no-op', async () => {
    await request(app).patch(`/api/action-items/${actionId}/status`).send({ status: 'RESOLVED' });
    const response = await request(app).patch(`/api/action-items/${actionId}/status`).send({ status: 'IN_PROGRESS' });
    await request(app).patch(`/api/action-items/${actionId}/status`).send({ status: 'IN_PROGRESS' });
    expect(response.status).toBe(200);
    expect(response.body.data.resolvedAt).toBeNull();
    expect(await prisma.actionItemStatusHistory.count({ where: { actionItemId: actionId } })).toBe(2);
  });
});
