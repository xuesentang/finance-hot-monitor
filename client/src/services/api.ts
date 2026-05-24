import type { Hotspot, Keyword, Notification, PaginatedResponse, Stats } from '../types/index.js';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// Keywords
export const keywordsApi = {
  list: () => request<Keyword[]>('/keywords'),
  create: (text: string, type?: string) =>
    request<Keyword>('/keywords', {
      method: 'POST',
      body: JSON.stringify({ text, type }),
    }),
  update: (id: string, data: { text?: string; type?: string; isActive?: boolean }) =>
    request<Keyword>(`/keywords/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  toggle: (id: string) =>
    request<Keyword>(`/keywords/${id}/toggle`, { method: 'PATCH' }),
  remove: (id: string) =>
    request<void>(`/keywords/${id}`, { method: 'DELETE' }),
};

// Hotspots
export const hotspotsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<PaginatedResponse<Hotspot>>(`/hotspots${qs}`);
  },
  get: (id: string) => request<Hotspot>(`/hotspots/${id}`),
  stats: () => request<Stats>('/hotspots/stats'),
  remove: (id: string) =>
    request<void>(`/hotspots/${id}`, { method: 'DELETE' }),
  triggerCheck: () =>
    request<{ message: string }>('/check-hotspots', { method: 'POST' }),
};

// Notifications
export const notificationsApi = {
  list: (params?: Record<string, string>) => {
    const qs = params ? '?' + new URLSearchParams(params).toString() : '';
    return request<Notification[]>(`/notifications${qs}`);
  },
  markRead: (id: string) =>
    request<Notification>(`/notifications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    }),
};
