export type DirectiveStatus = 'ACTIVE' | 'SUPERSEDED' | 'WITHDRAWN' | 'NEEDS_REVIEW';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ActionStatus = 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' | 'NEEDS_REVIEW';
export type IssueSeverity = 'WARNING' | 'ERROR';

export interface Authority { id?: string; code: string; name: string; jurisdiction: string }
export interface ActionProgress { total: number; resolved: number; inProgress: number; pending: number; needsReview: number }
export interface DirectiveRow {
  id: string;
  reference: string;
  title: string;
  sourceStatus: string;
  status: DirectiveStatus;
  priority: Priority;
  publishedAt: string;
  effectiveAt: string | null;
  authority: Authority;
  issueCount: number;
  highestIssueSeverity: IssueSeverity | null;
  actionProgress: ActionProgress;
}
export interface Issue {
  id: string; code: string; severity: IssueSeverity; field: string; rawValue: string | null; explanation: string;
}
export interface StatusHistory { id: string; previousStatus: ActionStatus; newStatus: ActionStatus; changedAt: string }
export interface ActionItem {
  id: string; title: string; sourceId: string; sourceStatus: string; status: ActionStatus;
  important: boolean; dueAt: string | null; resolvedAt: string | null; statusHistory: StatusHistory[];
}
export interface DirectiveDetail {
  id: string; reference: string; title: string; summary: string; sourceSystem: string; sourceId: string;
  sourceStatus: string; status: DirectiveStatus; priority: Priority; publishedAt: string; effectiveAt: string | null;
  authority: Authority; rawSource: unknown; issues: Issue[]; actions: ActionItem[];
}
export interface PageInfo { page: number; pageSize: number; total: number; totalPages: number }
export interface DirectiveList { data: DirectiveRow[]; pagination: PageInfo }
export interface ListParams {
  search: string; authority: string; status: string; priority: string; hasIssues: string; issueSeverity: string;
  page: number; pageSize: number; sortBy: string; sortOrder: 'asc' | 'desc';
}
