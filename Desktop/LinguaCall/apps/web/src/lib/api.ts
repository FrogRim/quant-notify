import type { ApiError, ApiResponse } from '@lingua/shared';

const API_BASE = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_API_BASE_URL ?? 'http://localhost:4000';

export function normalizeApiError(error: unknown): ApiError {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    return error as ApiError;
  }
  return { code: 'validation_error', message: 'api_error' };
}

export function describeApiError(error: unknown, context: string): string {
  const apiError = normalizeApiError(error);
  if (apiError.code === 'insufficient_allowance') {
    return 'allowance is exhausted. Upgrade your plan or restore allowance before continuing.';
  }
  if (apiError.code === 'invalid_duration_for_plan') {
    return 'the selected duration is not allowed on the current plan.';
  }
  if (apiError.code === 'conflict') {
    if (context === 'session_create' || context === 'session_update') {
      return `session conflict: ${apiError.message}`;
    }
    return apiError.message;
  }
  if (apiError.code === 'not_found') {
    return `${context.replaceAll('_', ' ')} target no longer exists.`;
  }
  return apiError.message || 'request failed';
}

export function apiClient(getToken: () => Promise<string | null>) {
  const h = async (): Promise<Record<string, string>> => {
    const token = await getToken();
    return {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  };

  async function post<T>(url: string, body: object): Promise<T> {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      credentials: 'include',
      headers: await h(),
      body: JSON.stringify(body)
    });
    const payload = (await res.json()) as ApiResponse<T>;
    if (!payload.ok || !payload.data) {
      throw payload.error ?? ({ code: 'validation_error', message: 'api_error' } as ApiError);
    }
    return payload.data;
  }

  async function patch<T>(url: string, body: object): Promise<T> {
    const res = await fetch(`${API_BASE}${url}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: await h(),
      body: JSON.stringify(body)
    });
    const payload = (await res.json()) as ApiResponse<T>;
    if (!payload.ok || !payload.data) {
      throw payload.error ?? ({ code: 'validation_error', message: 'api_error' } as ApiError);
    }
    return payload.data;
  }

  async function get<T>(url: string): Promise<T> {
    const res = await fetch(`${API_BASE}${url}`, {
      credentials: 'include',
      headers: await h()
    });
    const payload = (await res.json()) as ApiResponse<T>;
    if (!payload.ok) {
      throw payload.error ?? ({ code: 'validation_error', message: 'api_error' } as ApiError);
    }
    return payload.data as T;
  }

  return { post, patch, get, headers: h, base: API_BASE };
}
