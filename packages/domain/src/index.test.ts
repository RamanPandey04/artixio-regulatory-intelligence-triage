import { describe, expect, it } from 'vitest';
import { cleanText, normalizeDirective, type SourceDirective } from './index';

const valid: SourceDirective = {
  sourceId: 'SIM-001', reference: 'NMC-001', title: 'Reporting notice',
  summary: 'Review applicability.', sourceStatus: 'ACTIVE', priority: 'HIGH',
  publishedAt: '2026-01-01', effectiveAt: '2026-02-01',
  actions: [{ sourceId: 'ACT-1', title: 'Review', sourceStatus: 'PENDING', dueAt: '2027-01-01', resolvedAt: null, important: false }],
};

describe('source normalization', () => {
  it('removes control characters and repeated whitespace for display', () => {
    expect(cleanText(' A\u0007  B\t C ')).toBe('A B C');
    const result = normalizeDirective({ ...valid, title: ' A\u0007  B ' }, new Date('2026-06-01'));
    expect(result.title).toBe('A B');
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'MALFORMED_TEXT' })]));
  });

  it('retains ambiguous source status and requires review', () => {
    const result = normalizeDirective({ ...valid, sourceStatus: 'ACTIVE / WITHDRAWN' }, new Date('2026-06-01'));
    expect(result.status).toBe('NEEDS_REVIEW');
    expect(result.sourceStatus).toBe('ACTIVE / WITHDRAWN');
    expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'CONFLICTING_SOURCE_STATUS' })]));
  });

  it('flags missing and contradictory dates', () => {
    const missing = normalizeDirective({ ...valid, effectiveAt: null }, new Date('2026-06-01'));
    const contradictory = normalizeDirective({ ...valid, effectiveAt: '2025-12-31' }, new Date('2026-06-01'));
    expect(missing.issues.map((issue) => issue.code)).toContain('MISSING_EFFECTIVE_DATE');
    expect(contradictory.issues.map((issue) => issue.code)).toContain('EFFECTIVE_BEFORE_PUBLICATION');
    expect(contradictory.effectiveAt?.toISOString()).toContain('2025-12-31');
  });

  it('does not canonically resolve an action without a timestamp', () => {
    const result = normalizeDirective({
      ...valid, actions: [{ ...valid.actions[0]!, sourceStatus: 'RESOLVED', resolvedAt: null }],
    }, new Date('2026-06-01'));
    expect(result.actions[0]?.status).toBe('NEEDS_REVIEW');
    expect(result.issues.map((issue) => issue.code)).toContain('RESOLVED_WITHOUT_TIMESTAMP');
  });

  it('flags overdue pending and important undated actions', () => {
    const result = normalizeDirective({
      ...valid, actions: [{ ...valid.actions[0]!, dueAt: null, important: true },
        { ...valid.actions[0]!, sourceId: 'ACT-2', dueAt: '2025-01-01' }],
    }, new Date('2026-06-01'));
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'IMPORTANT_ACTION_WITHOUT_DUE_DATE', 'OVERDUE_PENDING_ACTION',
    ]));
  });
});
