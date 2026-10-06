import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Check, Clock3, X } from 'lucide-react';
import { fetchDirective, patchActionStatus } from './api';
import { formatDate, label } from './format';
import type { ActionItem, DirectiveDetail } from './types';

const statusOptions = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'IN_PROGRESS', label: 'In progress' },
  { value: 'RESOLVED', label: 'Resolved' },
] as const;

function Field({ name, value, muted = false }: { name: string; value: string; muted?: boolean }) {
  return <div className="min-w-0">
    <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">{name}</dt>
    <dd className={`mt-1 break-words text-sm ${muted ? 'text-slate-500' : 'text-slate-800'}`}>{value}</dd>
  </div>;
}

function ActionCard({ action, busy, onChange }: {
  action: ActionItem;
  busy: boolean;
  onChange: (id: string, status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED') => void;
}) {
  return <div className="rounded-md border border-slate-200 bg-white px-3 py-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-5 text-slate-800">{action.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>Due {formatDate(action.dueAt)}</span>
          {action.important && <span className="font-medium text-amber-800">Important</span>}
          {action.resolvedAt && <span>Resolved {formatDate(action.resolvedAt)}</span>}
        </div>
      </div>
      <div className="shrink-0">
        <label htmlFor={`action-${action.id}`} className="sr-only">Status for {action.title}</label>
        <select id={`action-${action.id}`} value={action.status} disabled={busy}
          onChange={(event) => onChange(action.id, event.target.value as 'PENDING' | 'IN_PROGRESS' | 'RESOLVED')}
          className="h-8 max-w-[150px] rounded border border-slate-300 bg-white px-2 text-xs font-medium text-slate-700 focus:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:opacity-50">
          {action.status === 'NEEDS_REVIEW' && <option value="NEEDS_REVIEW" disabled>Needs review</option>}
          {statusOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
    </div>
    {action.statusHistory.length > 0 && <details className="mt-3 border-t border-slate-100 pt-2">
      <summary className="cursor-pointer text-xs font-medium text-slate-600">Status history ({action.statusHistory.length})</summary>
      <ol className="mt-2 space-y-1.5 text-xs text-slate-500">
        {action.statusHistory.map((entry) => <li key={entry.id} className="flex flex-wrap items-center gap-1">
          <span>{label(entry.previousStatus)}</span><ArrowRight size={12} aria-hidden="true" />
          <span className="font-medium text-slate-700">{label(entry.newStatus)}</span>
          <span>· {formatDate(entry.changedAt)}</span>
        </li>)}
      </ol>
    </details>}
  </div>;
}

function DetailContent({ directive, busy, onChange, mutationError }: {
  directive: DirectiveDetail;
  busy: boolean;
  onChange: (id: string, status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED') => void;
  mutationError: string | null;
}) {
  return <div className="space-y-6 px-5 py-5 sm:px-6">
    <section aria-labelledby="overview-heading">
      <h3 id="overview-heading" className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Overview</h3>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 rounded-md border border-slate-200 bg-slate-50 p-4">
        <Field name="Authority" value={`${directive.authority.name} (${directive.authority.code})`} />
        <Field name="Priority" value={label(directive.priority)} />
        <Field name="Canonical status" value={label(directive.status)} />
        <Field name="Publication" value={formatDate(directive.publishedAt)} />
        <Field name="Effective" value={formatDate(directive.effectiveAt)} muted={!directive.effectiveAt} />
        <Field name="Jurisdiction" value={directive.authority.jurisdiction} />
      </dl>
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{directive.summary}</p>
    </section>

    <section aria-labelledby="quality-heading">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="quality-heading" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Data quality</h3>
        <span className="text-xs tabular-nums text-slate-500">{directive.issues.length} issues</span>
      </div>
      {directive.issues.length === 0 ? <p className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-3 text-sm text-slate-600"><Check size={15} aria-hidden="true" /> No source issues recorded.</p>
        : <div className="space-y-2">
          <p className="text-xs leading-5 text-slate-500">Flagged source records remain visible so they can be reviewed.</p>
          {directive.issues.map((issue) => <div key={issue.id} className="rounded-md border border-amber-200 bg-amber-50/50 px-3 py-3">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <AlertTriangle size={14} className={issue.severity === 'ERROR' ? 'text-rose-700' : 'text-amber-700'} aria-hidden="true" />
              <span className={issue.severity === 'ERROR' ? 'text-rose-800' : 'text-amber-800'}>{label(issue.severity)}</span>
              <span className="min-w-0 break-words text-slate-700">{label(issue.code)}</span>
            </div>
            <p className="mt-1.5 text-sm leading-5 text-slate-700">{issue.explanation}</p>
            <p className="mt-1 break-all text-xs text-slate-500">Field: {issue.field}{issue.rawValue !== null ? ` · Source: ${issue.rawValue}` : ''}</p>
          </div>)}
        </div>}
    </section>

    <section aria-labelledby="actions-heading">
      <div className="mb-3 flex items-center justify-between">
        <h3 id="actions-heading" className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Action items</h3>
        <span className="text-xs tabular-nums text-slate-500">{directive.actions.length} total</span>
      </div>
      {mutationError && <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">Update failed: {mutationError}</p>}
      {busy && <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500"><Clock3 size={13} aria-hidden="true" /> Saving status…</p>}
      {directive.actions.length === 0 ? <p className="rounded-md border border-slate-200 px-3 py-3 text-sm text-slate-500">No action items recorded.</p>
        : <div className="space-y-2">{directive.actions.map((action) => <ActionCard key={action.id} action={action} busy={busy} onChange={onChange} />)}</div>}
    </section>

    <section aria-labelledby="source-heading" className="border-t border-slate-200 pt-5">
      <details>
        <summary id="source-heading" className="cursor-pointer text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Source record / audit data</summary>
        <div className="mt-3 space-y-3">
          <dl className="grid grid-cols-2 gap-3"><Field name="Source system" value={directive.sourceSystem} muted /><Field name="Source ID" value={directive.sourceId} muted /><Field name="Source status" value={directive.sourceStatus} muted /></dl>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">{JSON.stringify(directive.rawSource, null, 2)}</pre>
        </div>
      </details>
    </section>
  </div>;
}

export function DetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['directive', id], queryFn: () => fetchDirective(id) });
  const mutation = useMutation({
    mutationFn: ({ actionId, status }: { actionId: string; status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED' }) => patchActionStatus(actionId, status),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['directive', id] }),
        queryClient.invalidateQueries({ queryKey: ['directives'] }),
      ]);
    },
  });

  useEffect(() => {
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); return; }
      if (event.key !== 'Tab') return;
      const controls = panelRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), select:not([disabled]), summary, a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!controls?.length) return;
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      else if (!panelRef.current?.contains(document.activeElement)) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; };
  }, [onClose]);

  return <div className="fixed inset-0 z-50">
    <button type="button" aria-label="Close detail panel" onClick={onClose} className="absolute inset-0 h-full w-full bg-slate-950/35" />
    <aside ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="detail-title" className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l border-slate-200 bg-white shadow-xl sm:w-[min(560px,92vw)]">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Directive detail</p>
          <h2 id="detail-title" className="mt-1 break-words text-lg font-semibold leading-6 text-slate-900">{detail.data?.title ?? 'Loading directive'}</h2>
          {detail.data && <p className="mt-1 font-mono text-xs text-slate-500">{detail.data.reference}</p>}
        </div>
        <button ref={closeRef} type="button" onClick={onClose} aria-label="Close detail panel" className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-500"><X size={18} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {detail.isPending && <p role="status" className="p-6 text-sm text-slate-500">Loading directive details…</p>}
        {detail.isError && <div role="alert" className="m-5 rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p>Could not load this directive. {detail.error.message}</p>
          <button type="button" onClick={() => detail.refetch()} className="mt-2 font-semibold underline">Retry</button>
        </div>}
        {detail.data && <DetailContent directive={detail.data} busy={mutation.isPending}
          mutationError={mutation.isError ? mutation.error.message : null}
          onChange={(actionId, status) => mutation.mutate({ actionId, status })} />}
      </div>
    </aside>
  </div>;
}
