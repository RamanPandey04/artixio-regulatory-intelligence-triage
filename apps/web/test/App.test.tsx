/** UI behavior at the API boundary, including refetch and mutation timing. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import type { ActionItem, DirectiveDetail, DirectiveList, DirectiveRow } from '../src/types';

const directiveId = '11111111-1111-4111-8111-111111111111';
const actionId = '22222222-2222-4222-8222-222222222222';

const row: DirectiveRow = {
  id: directiveId, reference: 'NMC-2026-001', title: 'Clinical reporting notice',
  sourceStatus: 'ACTIVE / WITHDRAWN', status: 'NEEDS_REVIEW', priority: 'HIGH',
  publishedAt: '2026-01-01T00:00:00.000Z', effectiveAt: null,
  authority: { code: 'NMC', name: 'National Medicines Commission', jurisdiction: 'United Kingdom' },
  issueCount: 1, highestIssueSeverity: 'ERROR',
  actionProgress: { total: 1, resolved: 0, inProgress: 0, pending: 1, needsReview: 0 },
};
const action: ActionItem = {
  id: actionId, sourceId: 'ACT-1', title: 'Assess reporting', sourceStatus: 'PENDING',
  status: 'PENDING', important: true, dueAt: '2027-01-01T00:00:00.000Z',
  resolvedAt: null, statusHistory: [],
};
const detail: DirectiveDetail = {
  ...row, summary: 'Review the reporting requirements.', sourceSystem: 'ARTIXIO_SIMULATED_FEED',
  sourceId: 'SIM-001', rawSource: { sourceStatus: 'ACTIVE / WITHDRAWN', title: 'Raw\u0007 title' },
  issues: [{ id: 'issue-1', code: 'CONFLICTING_SOURCE_STATUS', severity: 'ERROR', field: 'sourceStatus',
    rawValue: 'ACTIVE / WITHDRAWN', explanation: 'Source status cannot be mapped unambiguously.' }],
  actions: [action],
};

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}

function listResponse(data: DirectiveRow[] = [row]): DirectiveList {
  return { data, pagination: { page: 1, pageSize: 25, total: data.length, totalPages: data.length ? 1 : 0 } };
}

function renderApp() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
}

describe('triage page', () => {
  it('renders table data and a visible quality indicator', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(listResponse())));
    renderApp();
    expect(await screen.findByRole('button', { name: 'Clinical reporting notice' })).toBeInTheDocument();
    expect(screen.getByText('NMC-2026-001')).toBeInTheDocument();
    expect(screen.getByLabelText('1 error issue')).toBeInTheDocument();
    expect(screen.getByText('Not supplied')).toBeInTheDocument();
  });

  it('sends status and debounced search filters to the API', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      urls.push(input);
      return jsonResponse(listResponse());
    }));
    renderApp();
    await screen.findByRole('button', { name: 'Clinical reporting notice' });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'NEEDS_REVIEW' } });
    await waitFor(() => expect(urls.some((url) => url.includes('status=NEEDS_REVIEW'))).toBe(true));
    const search = screen.getByPlaceholderText('Title, reference, summary');
    await userEvent.type(search, 'clinical');
    await waitFor(() => expect(urls.some((url) => url.includes('search=clinical') && url.includes('status=NEEDS_REVIEW'))).toBe(true));
    expect(urls.some((url) => url.includes('search=c&'))).toBe(false);
  });

  it('keeps filters when moving to another server page', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      urls.push(input);
      const page = new URL(input, 'http://localhost').searchParams.get('page') === '2' ? 2 : 1;
      return jsonResponse({ data: [row], pagination: { page, pageSize: 25, total: 50, totalPages: 2 } });
    }));
    renderApp();
    await screen.findByRole('button', { name: 'Clinical reporting notice' });
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'NEEDS_REVIEW' } });
    await waitFor(() => expect(urls.some((url) => url.includes('status=NEEDS_REVIEW'))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(urls.some((url) => url.includes('page=2') && url.includes('status=NEEDS_REVIEW'))).toBe(true));
  });

  it('does not open a stale row while a filtered page is loading', async () => {
    // Hold the filtered response so the previous page remains as placeholder data.
    let finishFilter: ((response: Response) => void) | undefined;
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      if (input.includes('hasIssues=true')) return new Promise<Response>((resolve) => { finishFilter = resolve; });
      if (input.includes(`/directives/${directiveId}`)) return jsonResponse({ data: detail });
      return jsonResponse(listResponse());
    }));
    renderApp();
    await screen.findByRole('button', { name: 'Clinical reporting notice' });
    fireEvent.change(screen.getByLabelText('Has issues'), { target: { value: 'true' } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clinical reporting notice' })).toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: 'Clinical reporting notice' }).closest('tr')!);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    finishFilter?.(jsonResponse(listResponse()));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Clinical reporting notice' })).toBeEnabled());
    await userEvent.click(screen.getByRole('button', { name: 'Clinical reporting notice' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('opens detail with quality issues and preserves source data in the audit section', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => input.includes(`/directives/${directiveId}`)
      ? jsonResponse({ data: detail }) : jsonResponse(listResponse())));
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Clinical reporting notice' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Source status cannot be mapped unambiguously.')).toBeInTheDocument();
    expect(within(dialog).getByText('Assess reporting')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByText('Source record / audit data'));
    expect(within(dialog).getByText('ACTIVE / WITHDRAWN')).toBeInTheDocument();
  });

  it('waits for PATCH confirmation, then refreshes detail and list', async () => {
    let resolvePatch: ((response: Response) => void) | undefined;
    let resolved = false;
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return new Promise<Response>((resolve) => { resolvePatch = resolve; });
      if (input.includes(`/directives/${directiveId}`)) {
        const updated = resolved ? { ...action, status: 'RESOLVED' as const, resolvedAt: '2026-10-06T12:00:00.000Z',
          statusHistory: [{ id: 'history-1', previousStatus: 'PENDING' as const, newStatus: 'RESOLVED' as const, changedAt: '2026-10-06T12:00:00.000Z' }] } : action;
        return jsonResponse({ data: { ...detail, actions: [updated] } });
      }
      return jsonResponse(listResponse(resolved ? [{ ...row, actionProgress: { ...row.actionProgress, pending: 0, resolved: 1 } }] : [row]));
    });
    vi.stubGlobal('fetch', fetchMock);
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Clinical reporting notice' }));
    const control = await screen.findByLabelText('Status for Assess reporting');
    await userEvent.selectOptions(control, 'RESOLVED');
    expect(control).toBeDisabled();
    expect(control).toHaveValue('PENDING');
    expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(true);
    resolved = true;
    resolvePatch?.(jsonResponse({ data: { ...action, status: 'RESOLVED', resolvedAt: '2026-10-06T12:00:00.000Z' } }));
    await waitFor(() => expect(screen.getByLabelText('Status for Assess reporting')).toHaveValue('RESOLVED'));
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes(`/directives/${directiveId}`))).toHaveLength(2);
    expect(fetchMock.mock.calls.filter((call) => String(call[0]).includes('/directives?'))).toHaveLength(2);
  });

  it('shows a PATCH failure and retains the confirmed status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return jsonResponse({ error: { code: 'CONFLICT', message: 'Action status changed; refresh and retry.' } }, 409);
      return input.includes(`/directives/${directiveId}`) ? jsonResponse({ data: detail }) : jsonResponse(listResponse());
    }));
    renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Clinical reporting notice' }));
    await userEvent.selectOptions(await screen.findByLabelText('Status for Assess reporting'), 'RESOLVED');
    expect(await screen.findByRole('alert')).toHaveTextContent('Update failed: Action status changed; refresh and retry.');
    expect(screen.getByLabelText('Status for Assess reporting')).toHaveValue('PENDING');
  });

  it('shows an empty result after filtering', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string) => jsonResponse(input.includes('hasIssues=false') ? listResponse([]) : listResponse())));
    renderApp();
    await screen.findByRole('button', { name: 'Clinical reporting notice' });
    fireEvent.change(screen.getByLabelText('Has issues'), { target: { value: 'false' } });
    expect(await screen.findByText('No directives match these filters.')).toBeInTheDocument();
  });
});
