/**
 * Source-to-domain normalization. Ambiguous source values become review work
 * and quality issues rather than widening the canonical enums.
 */
export const directiveStatuses = ['ACTIVE', 'SUPERSEDED', 'WITHDRAWN', 'NEEDS_REVIEW'] as const;
export type DirectiveStatus = (typeof directiveStatuses)[number];

export const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type Priority = (typeof priorities)[number];

export const actionStatuses = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'NEEDS_REVIEW'] as const;
export type ActionStatus = (typeof actionStatuses)[number];

export const issueSeverities = ['WARNING', 'ERROR'] as const;
export type IssueSeverity = (typeof issueSeverities)[number];

export const issueCodes = [
  'MISSING_EFFECTIVE_DATE',
  'EFFECTIVE_BEFORE_PUBLICATION',
  'CONFLICTING_SOURCE_STATUS',
  'MALFORMED_TEXT',
  'RESOLVED_WITHOUT_TIMESTAMP',
  'OVERDUE_PENDING_ACTION',
  'IMPORTANT_ACTION_WITHOUT_DUE_DATE',
] as const;
export type IssueCode = (typeof issueCodes)[number];

export interface SourceAction {
  sourceId: string;
  title: string;
  sourceStatus: string;
  dueAt: string | null;
  resolvedAt: string | null;
  important: boolean;
}

export interface SourceDirective {
  sourceId: string;
  reference: string;
  title: string;
  summary: string;
  sourceStatus: string;
  priority: Priority;
  publishedAt: string;
  effectiveAt: string | null;
  actions: SourceAction[];
}

export interface QualityIssue {
  code: IssueCode;
  severity: IssueSeverity;
  field: string;
  rawValue: string | null;
  explanation: string;
  sourceActionId?: string;
}

export interface NormalizedAction {
  sourceId: string;
  title: string;
  sourceStatus: string;
  status: ActionStatus;
  dueAt: Date | null;
  resolvedAt: Date | null;
  important: boolean;
}

export interface NormalizedDirective {
  sourceId: string;
  reference: string;
  title: string;
  summary: string;
  sourceStatus: string;
  status: DirectiveStatus;
  priority: Priority;
  publishedAt: Date;
  effectiveAt: Date | null;
  actions: NormalizedAction[];
  issues: QualityIssue[];
}

const controlCharacters = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

// Remove control characters from display text; the caller keeps the raw source separately.
export function cleanText(value: string): string {
  return value.replace(controlCharacters, ' ').replace(/\s+/g, ' ').trim();
}

function normalizedStatus(sourceStatus: string): DirectiveStatus {
  const cleaned = cleanText(sourceStatus).toUpperCase();
  if (cleaned === 'ACTIVE' || cleaned === 'SUPERSEDED' || cleaned === 'WITHDRAWN') return cleaned;
  // A compound or unknown status cannot safely be mapped to one regulatory state.
  return 'NEEDS_REVIEW';
}

function normalizedActionStatus(sourceStatus: string, resolvedAt: string | null): ActionStatus {
  const cleaned = cleanText(sourceStatus).toUpperCase();
  // The database requires a timestamp for a resolved canonical action.
  if (cleaned === 'RESOLVED') return resolvedAt === null ? 'NEEDS_REVIEW' : 'RESOLVED';
  if (cleaned === 'PENDING' || cleaned === 'IN_PROGRESS') return cleaned;
  return 'NEEDS_REVIEW';
}

// Derive display values and review flags without changing the caller's source object.
// The seed stores that original object in rawSource for later audit.
export function normalizeDirective(source: SourceDirective, now: Date): NormalizedDirective {
  const issues: QualityIssue[] = [];
  const title = cleanText(source.title);
  const summary = cleanText(source.summary);
  if (title !== source.title || summary !== source.summary) {
    issues.push({
      code: 'MALFORMED_TEXT', severity: 'WARNING', field: 'title,summary',
      rawValue: JSON.stringify({ title: source.title, summary: source.summary }),
      explanation: 'Control characters or repeated whitespace were removed from display text.',
    });
  }

  const status = normalizedStatus(source.sourceStatus);
  if (status === 'NEEDS_REVIEW') {
    issues.push({
      code: 'CONFLICTING_SOURCE_STATUS', severity: 'ERROR', field: 'sourceStatus',
      rawValue: source.sourceStatus,
      explanation: 'Source status cannot be mapped unambiguously to a canonical status.',
    });
  }

  const publishedAt = new Date(source.publishedAt);
  const effectiveAt = source.effectiveAt === null ? null : new Date(source.effectiveAt);
  // Missing or contradictory dates stay visible; an issue explains why review is needed.
  if (effectiveAt === null) {
    issues.push({
      code: 'MISSING_EFFECTIVE_DATE', severity: 'WARNING', field: 'effectiveAt',
      rawValue: null, explanation: 'The source did not provide an effective date.',
    });
  } else if (effectiveAt < publishedAt) {
    issues.push({
      code: 'EFFECTIVE_BEFORE_PUBLICATION', severity: 'ERROR', field: 'effectiveAt',
      rawValue: source.effectiveAt,
      explanation: 'Effective date precedes publication; the source date is retained for review.',
    });
  }

  const actions = source.actions.map((action): NormalizedAction => {
    const dueAt = action.dueAt === null ? null : new Date(action.dueAt);
    const resolvedAt = action.resolvedAt === null ? null : new Date(action.resolvedAt);
    const actionStatus = normalizedActionStatus(action.sourceStatus, action.resolvedAt);
    // A source claim of resolution without evidence cannot enter RESOLVED canonically.
    if (cleanText(action.sourceStatus).toUpperCase() === 'RESOLVED' && resolvedAt === null) {
      issues.push({
        code: 'RESOLVED_WITHOUT_TIMESTAMP', severity: 'ERROR', field: 'actions.resolvedAt',
        rawValue: action.sourceStatus, sourceActionId: action.sourceId,
        explanation: 'Source says resolved but supplies no resolution time; canonical action needs review.',
      });
    }
    if (actionStatus === 'PENDING' && dueAt !== null && dueAt < now) {
      issues.push({
        code: 'OVERDUE_PENDING_ACTION', severity: 'WARNING', field: 'actions.dueAt',
        rawValue: action.dueAt, sourceActionId: action.sourceId,
        explanation: 'Pending action is past its due date.',
      });
    }
    if (action.important && dueAt === null) {
      issues.push({
        code: 'IMPORTANT_ACTION_WITHOUT_DUE_DATE', severity: 'WARNING', field: 'actions.dueAt',
        rawValue: null, sourceActionId: action.sourceId,
        explanation: 'Important action has no due date in the source.',
      });
    }
    return {
      sourceId: action.sourceId, title: cleanText(action.title), sourceStatus: action.sourceStatus,
      status: actionStatus, dueAt, resolvedAt, important: action.important,
    };
  });

  return {
    sourceId: source.sourceId, reference: source.reference, title, summary, sourceStatus: source.sourceStatus,
    status, priority: source.priority, publishedAt, effectiveAt, actions, issues,
  };
}
