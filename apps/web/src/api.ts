/**
 * Browser API client. It sends current table state to the server and turns
 * HTTP failures into short messages the UI can show beside the failed action.
 */
import type { ActionItem, DirectiveDetail, DirectiveList, ListParams } from './types';

const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

// Keep network and API error wording consistent across list, detail, and PATCH.
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, init);
  } catch {
    throw new Error('Cannot reach the API. Check that the backend is running.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message || `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

// Send filters and page state to the backend rather than filtering a cached list.
export function fetchDirectives(params: ListParams): Promise<DirectiveList> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== '') query.set(key, String(value));
  }
  return request<DirectiveList>(`/directives?${query.toString()}`);
}

// Detail includes source evidence and issues omitted from the dense list row.
export async function fetchDirective(id: string): Promise<DirectiveDetail> {
  const response = await request<{ data: DirectiveDetail }>(`/directives/${encodeURIComponent(id)}`);
  return response.data;
}

// The PATCH response is confirmation; the UI does not invent resolution timestamps.
export async function patchActionStatus(id: string, status: 'PENDING' | 'IN_PROGRESS' | 'RESOLVED'): Promise<ActionItem> {
  const response = await request<{ data: ActionItem }>(`/action-items/${encodeURIComponent(id)}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
  });
  return response.data;
}
