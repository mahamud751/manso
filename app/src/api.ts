import { Platform } from 'react-native';

export const API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let token: string | null = null;
export function setToken(next: string | null) {
  token = next;
}

async function request<T>(path: string, options: RequestInit & { query?: Record<string, string | undefined> } = {}): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : `${API_URL}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value) url.searchParams.set(key, value);
    }
  }
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
  let response: Response;
  try {
    response = await fetch(url.toString(), { ...options, headers });
  } catch {
    throw new ApiError(0, 'You appear to be offline.', 'OFFLINE');
  }
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(response.status, body?.message || 'Request failed', body?.code || 'REQUEST_FAILED');
  }
  return body as T;
}

export const api = {
  config: () => request<Record<string, unknown>>('/v1/config'),
  branches: (q?: string) => request<import('./types').Branch[]>('/v1/branches', { query: { q } }),
  products: (branchId: string, q?: string, kind?: string) =>
    request<import('./types').Product[]>('/v1/products', { query: { branchId, q, kind } }),
  product: (id: string, branchId: string) =>
    request<import('./types').Product>(`/v1/products/${id}`, { query: { branchId } }),
  policy: (slug: string) => request<{ title: import('./types').Localized; body: import('./types').Localized }>(`/v1/policies/${slug}`),
  otp: (phone: string) => request<{ phone: string; expiresInSeconds: number; resendAfterSeconds: number; debugCode?: string }>('/v1/auth/otp', { method: 'POST', body: JSON.stringify({ phone }) }),
  verify: (phone: string, code: string) =>
    request<{ accessToken: string; user: import('./types').User }>('/v1/auth/verify', { method: 'POST', body: JSON.stringify({ phone, code }) }),
  me: () => request<import('./types').User>('/v1/auth/me'),
  updateMe: (body: Record<string, unknown>) => request<import('./types').User>('/v1/account', { method: 'PATCH', body: JSON.stringify(body) }),
  addresses: () => request<import('./types').Address[]>('/v1/addresses'),
  addAddress: (body: Record<string, unknown>) => request<import('./types').Address>('/v1/addresses', { method: 'POST', body: JSON.stringify(body) }),
  consents: () => request<import('./types').Consent>('/v1/consents'),
  updateConsents: (body: Partial<import('./types').Consent>) =>
    request<import('./types').Consent>('/v1/consents', { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAccount: () => request<{ deleted: boolean }>('/v1/account/delete', { method: 'POST', body: JSON.stringify({}) }),
  basket: () => request<import('./types').Basket>('/v1/basket'),
  setItem: (body: { branchId: string; productId: string; grams: number; optionId?: string; note?: string }) =>
    request<import('./types').Basket>('/v1/basket/items', { method: 'POST', body: JSON.stringify(body) }),
  slots: (branchId: string, mode: string) =>
    request<import('./types').SlotOffer>('/v1/slots', { query: { branchId, mode } }),
  quote: (body: Record<string, unknown>) => request<import('./types').Quote>('/v1/checkout/holds', { method: 'POST', body: JSON.stringify(body) }),
  quoteById: (id: string) => request<import('./types').Quote>(`/v1/checkout/holds/${id}`),
  order: (body: Record<string, unknown>, idempotencyKey: string) =>
    request<import('./types').Order>('/v1/orders', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Idempotency-Key': idempotencyKey },
    }),
  orders: (scope: string) => request<import('./types').Order[]>('/v1/orders', { query: { scope } }),
  orderById: (id: string) => request<import('./types').Order>(`/v1/orders/${id}`),
  cancel: (id: string) => request<import('./types').Order>(`/v1/orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({}) }),
  reorder: (id: string) => request<{ basket: import('./types').Basket; warnings: string[] }>(`/v1/orders/${id}/reorder`, { method: 'POST', body: JSON.stringify({}) }),
  sandbox: (orderId: string, outcome: 'PAID' | 'FAILED') =>
    request<{ order: import('./types').Order }>('/v1/payments/sandbox/complete', { method: 'POST', body: JSON.stringify({ orderId, outcome }) }),
  support: (body: Record<string, unknown>) => request<Record<string, unknown>>('/v1/support', { method: 'POST', body: JSON.stringify(body) }),
  orderSupport: (id: string, body: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/v1/orders/${id}/support`, { method: 'POST', body: JSON.stringify(body) }),
  sessions: (branchId?: string) => request<import('./types').LiveSession[]>('/v1/live/sessions', { query: { branchId } }),
  session: (id: string) => request<import('./types').LiveSession>(`/v1/live/sessions/${id}`),
  heartbeat: (id: string, viewerKey: string) =>
    request<import('./types').LiveSession>(`/v1/live/sessions/${id}/heartbeat`, { method: 'POST', body: JSON.stringify({ viewerKey }) }),
  ask: (id: string, message: string) =>
    request<{ id: string }>(`/v1/live/sessions/${id}/questions`, { method: 'POST', body: JSON.stringify({ message }) }),
  replays: (branchId?: string) => request<import('./types').Replay[]>('/v1/replays', { query: { branchId } }),
  replay: (id: string) => request<import('./types').Replay>(`/v1/replays/${id}`),
  viewReplay: (id: string) => request<import('./types').Replay>(`/v1/replays/${id}/view`, { method: 'POST', body: JSON.stringify({}) }),
  notifications: () => request<import('./types').Notice[]>('/v1/notifications'),
  readNotification: (id: string) => request(`/v1/notifications/${id}/read`, { method: 'POST', body: JSON.stringify({}) }),
};
