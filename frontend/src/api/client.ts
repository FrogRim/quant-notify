const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

let tossUserKey = '';

export function setUserKey(key: string) {
  tossUserKey = key;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-toss-user-key': tossUserKey,
      ...(options.headers as Record<string, string> | undefined ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API Error ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  login: (userKey: string) =>
    request('/users', { method: 'POST', body: JSON.stringify({ tossUserKey: userKey }) }),

  parseHarness: (input: string) =>
    request('/harnesses/parse', { method: 'POST', body: JSON.stringify({ input }) }),

  getHarnesses: () => request<unknown[]>('/harnesses'),

  createHarness: (data: object) =>
    request('/harnesses', { method: 'POST', body: JSON.stringify(data) }),

  toggleHarness: (id: string, active: boolean) =>
    request(`/harnesses/${id}`, { method: 'PATCH', body: JSON.stringify({ active }) }),

  deleteHarness: (id: string) =>
    request(`/harnesses/${id}`, { method: 'DELETE' }),

  getAlerts: () => request<unknown[]>('/alerts'),

  clickAlert: (id: string) =>
    request(`/alerts/${id}/click`, { method: 'POST' }),
};
