import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type SortingState } from '@tanstack/react-table';
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { fetchDirectives } from './api';
import { DetailDrawer } from './DetailDrawer';
import { formatDate, label } from './format';
import type { DirectiveRow, ListParams } from './types';

type Filters = Pick<ListParams, 'search' | 'authority' | 'status' | 'priority' | 'hasIssues' | 'issueSeverity'>;
const emptyFilters: Filters = { search: '', authority: '', status: '', priority: '', hasIssues: '', issueSeverity: '' };
const pageSize = 25;

const fieldClass = 'h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-600 focus:ring-2 focus:ring-slate-200';

export function App() {
  const [draft, setDraft] = useState({ search: '', authority: '' });
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'publishedAt', desc: true }]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const search = draft.search.trim();
      const authority = draft.authority.trim();
      if (search !== filters.search || authority !== filters.authority) {
        setFilters((current) => ({ ...current, search, authority }));
        setPage(1);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draft, filters.search, filters.authority]);

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const resetFilters = () => {
    setDraft({ search: '', authority: '' });
    setFilters(emptyFilters);
    setPage(1);
  };
  const closeDetail = useCallback(() => {
    setSelectedId(null);
    window.setTimeout(() => openerRef.current?.focus(), 0);
  }, []);

  const activeSort = sorting[0];
  const params: ListParams = {
    ...filters, page, pageSize,
    sortBy: activeSort?.id ?? 'publishedAt',
    sortOrder: activeSort?.desc === false ? 'asc' : 'desc',
  };
  const list = useQuery({
    queryKey: ['directives', params],
    queryFn: () => fetchDirectives(params),
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<DirectiveRow>[]>(() => [
    { accessorKey: 'priority', header: 'Priority', size: 88, cell: ({ row }) => {
      const priority = row.original.priority;
      return <span className={`text-xs font-semibold uppercase tracking-wide ${priority === 'CRITICAL' ? 'text-rose-800' : priority === 'HIGH' ? 'text-amber-800' : 'text-slate-600'}`}>{label(priority)}</span>;
    } },
    { id: 'authority', header: 'Authority', size: 128, enableSorting: false, cell: ({ row }) => <div className="min-w-0">
      <div className="font-semibold text-slate-700">{row.original.authority.code}</div>
      <div className="truncate text-[11px] text-slate-500" title={row.original.authority.name}>{row.original.authority.name}</div>
    </div> },
    { accessorKey: 'title', header: 'Directive', size: 350, cell: ({ row }) => <div className="min-w-0">
      <div className="font-mono text-[11px] font-medium text-slate-500">{row.original.reference}</div>
      <button type="button" title={row.original.title} disabled={list.isPlaceholderData} onClick={() => { setSelectedId(row.original.id); }}
        className="mt-0.5 block max-w-full truncate text-left text-[13px] font-semibold leading-5 text-slate-800 hover:text-slate-950 hover:underline focus:outline-none focus:underline focus:ring-2 focus:ring-slate-500 disabled:cursor-wait">
        {row.original.title}
      </button>
    </div> },
    { accessorKey: 'publishedAt', header: 'Published', size: 112, cell: ({ getValue }) => <span className="tabular-nums text-slate-600">{formatDate(getValue<string>())}</span> },
    { accessorKey: 'effectiveAt', header: 'Effective', size: 112, cell: ({ row }) => row.original.effectiveAt
      ? <span className="tabular-nums text-slate-600">{formatDate(row.original.effectiveAt)}</span>
      : <span title="Effective date missing from source" className="font-medium text-amber-800">Not supplied</span> },
    { accessorKey: 'status', header: 'Status', size: 130, cell: ({ row }) => <span className={row.original.status === 'NEEDS_REVIEW' ? 'font-semibold text-amber-800' : 'text-slate-700'}>{label(row.original.status)}</span> },
    { id: 'actions', header: 'Actions', size: 128, enableSorting: false, cell: ({ row }) => {
      const progress = row.original.actionProgress;
      return <div className="min-w-0">
        <span className="tabular-nums font-medium text-slate-700">{progress.resolved}/{progress.total} resolved</span>
        {progress.needsReview > 0 && <div className="text-[11px] text-amber-800">{progress.needsReview} need review</div>}
      </div>;
    } },
    { id: 'quality', header: 'Quality', size: 132, enableSorting: false, cell: ({ row }) => row.original.issueCount > 0
      ? <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${row.original.highestIssueSeverity === 'ERROR' ? 'text-rose-800' : 'text-amber-800'}`} aria-label={`${row.original.issueCount} ${row.original.highestIssueSeverity?.toLowerCase()} issue${row.original.issueCount === 1 ? '' : 's'}`}>
        <AlertTriangle size={14} aria-hidden="true" /> {row.original.issueCount} {row.original.highestIssueSeverity?.toLowerCase()}
      </span>
      : <span className="text-xs text-slate-400">—</span> },
  ], [list.isPlaceholderData]);

  const table = useReactTable({
    data: list.data?.data ?? [], columns, state: { sorting }, manualSorting: true, manualPagination: true,
    enableSortingRemoval: false, getCoreRowModel: getCoreRowModel(),
    onSortingChange: (updater) => {
      setSorting(typeof updater === 'function' ? updater(sorting) : updater);
      setPage(1);
    },
  });

  const total = list.data?.pagination.total ?? 0;
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const hasFilters = Object.values(filters).some(Boolean) || draft.search !== '' || draft.authority !== '';

  return <div className="min-h-screen bg-slate-50">
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-[1580px] items-center justify-between px-5 py-3 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-800 text-sm font-bold tracking-tight text-white" aria-hidden="true">A</div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-slate-900">Artixio</div>
            <div className="text-[11px] text-slate-500">Regulatory intelligence</div>
          </div>
        </div>
        <span className="rounded border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500">Simulated data</span>
      </div>
    </header>

    <main className="mx-auto max-w-[1580px] px-5 pb-10 pt-6 lg:px-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Triage workspace</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Regulatory directives</h1>
          <p className="mt-1 text-sm text-slate-500">Review source updates, data quality, and required actions.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span role="status" aria-live="polite">{list.isFetching ? 'Updating results…' : list.dataUpdatedAt ? `Updated ${new Date(list.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Awaiting data'}</span>
          <button type="button" onClick={() => list.refetch()} disabled={list.isFetching} className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-50"><RefreshCw size={13} aria-hidden="true" /> Refresh</button>
        </div>
      </div>

      <section aria-label="Directive filters" className="rounded-t-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500"><SlidersHorizontal size={14} aria-hidden="true" /> Filter directives</div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3 md:grid-cols-3 xl:grid-cols-[minmax(200px,2fr)_minmax(125px,1fr)_minmax(140px,1fr)_minmax(115px,.85fr)_minmax(120px,.95fr)_minmax(140px,1fr)_auto] xl:items-end">
          <label className="block min-w-0"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Search</span>
            <span className="relative block"><Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-slate-400" aria-hidden="true" />
              <input value={draft.search} onChange={(event) => setDraft((current) => ({ ...current, search: event.target.value }))} className={`${fieldClass} pl-8`} placeholder="Title, reference, summary" maxLength={120} /></span>
          </label>
          <label className="block min-w-0"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Authority code</span>
            <input value={draft.authority} onChange={(event) => setDraft((current) => ({ ...current, authority: event.target.value }))} className={fieldClass} placeholder="e.g. NMC" maxLength={32} /></label>
          <label className="block min-w-0"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Status</span>
            <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)} className={fieldClass}>
              <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="SUPERSEDED">Superseded</option><option value="WITHDRAWN">Withdrawn</option><option value="NEEDS_REVIEW">Needs review</option>
            </select></label>
          <label className="block min-w-0"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Priority</span>
            <select value={filters.priority} onChange={(event) => setFilter('priority', event.target.value)} className={fieldClass}>
              <option value="">All priorities</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
            </select></label>
          <label className="block min-w-0"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Has issues</span>
            <select value={filters.hasIssues} onChange={(event) => setFilter('hasIssues', event.target.value)} className={fieldClass}>
              <option value="">Any</option><option value="true">Flagged only</option><option value="false">No issues</option>
            </select></label>
          <label className="block min-w-0"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Issue severity</span>
            <select value={filters.issueSeverity} onChange={(event) => setFilter('issueSeverity', event.target.value)} className={fieldClass}>
              <option value="">Any severity</option><option value="ERROR">Error</option><option value="WARNING">Warning</option>
            </select></label>
          <button type="button" onClick={resetFilters} disabled={!hasFilters} className="h-9 whitespace-nowrap rounded px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-40">Clear filters</button>
        </div>
      </section>

      <section aria-label="Directive results" className="overflow-hidden rounded-b-lg border-x border-b border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 text-xs text-slate-500">
          <span><strong className="font-semibold tabular-nums text-slate-800">{total}</strong> matching directive{total === 1 ? '' : 's'}</span>
          <span>{pageSize} per page</span>
        </div>
        <div className="overflow-x-auto">
          <table aria-busy={list.isPlaceholderData} className={`w-full table-fixed border-collapse text-left text-xs ${list.isPlaceholderData ? 'opacity-60' : ''}`} style={{ minWidth: table.getTotalSize() }}>
            <thead className="bg-slate-50 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {table.getHeaderGroups().map((headerGroup) => <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => <th key={header.id} scope="col" style={{ width: header.getSize() }} className="border-b border-slate-200 px-3 py-2.5 font-semibold">
                  {header.column.getCanSort() ? <button type="button" onClick={header.column.getToggleSortingHandler()} aria-label={`Sort by ${String(header.column.columnDef.header)}`} className="inline-flex items-center gap-1 hover:text-slate-900 focus:outline-none focus:underline focus:ring-2 focus:ring-slate-500">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === 'asc' ? <ArrowUp size={12} aria-hidden="true" /> : header.column.getIsSorted() === 'desc' ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUpDown size={12} aria-hidden="true" />}
                  </button> : flexRender(header.column.columnDef.header, header.getContext())}
                </th>)}
              </tr>)}
            </thead>
            <tbody>
              {list.isPending && <tr><td colSpan={columns.length} className="px-4 py-16 text-center text-sm text-slate-500">Loading directives…</td></tr>}
              {list.isError && <tr><td colSpan={columns.length} className="px-4 py-12 text-center">
                <p role="alert" className="text-sm font-medium text-rose-800">Could not load directives. {list.error.message}</p>
                <button type="button" onClick={() => list.refetch()} className="mt-2 text-sm font-semibold text-slate-700 underline">Retry</button>
              </td></tr>}
              {list.isSuccess && table.getRowModel().rows.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-16 text-center">
                <p className="text-sm font-medium text-slate-700">No directives match these filters.</p>
                <p className="mt-1 text-xs text-slate-500">Try a broader search or use Clear filters above.</p>
              </td></tr>}
              {list.isSuccess && table.getRowModel().rows.map((row) => <tr key={row.id}
                onClick={(event) => { if (list.isPlaceholderData) return; openerRef.current = event.currentTarget.querySelector('td button'); setSelectedId(row.original.id); }}
                className={`${list.isPlaceholderData ? 'cursor-wait' : 'cursor-pointer'} border-b border-slate-100 hover:bg-slate-50 ${row.original.highestIssueSeverity === 'ERROR' ? 'border-l-2 border-l-rose-300' : row.original.issueCount > 0 ? 'border-l-2 border-l-amber-300' : 'border-l-2 border-l-transparent'}`}>
                {row.getVisibleCells().map((cell) => <td key={cell.id} style={{ width: cell.column.getSize() }} className="overflow-hidden px-3 py-2.5 align-middle leading-4">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>)}
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
          <span className="tabular-nums">{list.isError ? 'Results unavailable' : total === 0 ? 'No results' : `Showing ${first}–${last} of ${total}`}</span>
          <div className="flex items-center gap-2">
            <span className="mr-1 tabular-nums">Page {page} of {Math.max(1, list.data?.pagination.totalPages ?? 1)}</span>
            <button type="button" aria-label="Previous page" onClick={() => setPage((current) => current - 1)} disabled={page <= 1 || list.isPlaceholderData || list.isFetching}
              className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <button type="button" aria-label="Next page" onClick={() => setPage((current) => current + 1)} disabled={page >= (list.data?.pagination.totalPages ?? 1) || list.isPlaceholderData || list.isFetching}
              className="rounded border border-slate-300 bg-white p-1.5 text-slate-600 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      </section>
      <p className="mt-3 text-xs text-slate-400">Source records are simulated. Quality flags are preserved for review.</p>
    </main>
    {selectedId && <DetailDrawer id={selectedId} onClose={closeDetail} />}
  </div>;
}
