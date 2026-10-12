import type { ApiError } from './types';

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options?.headers },
  });
  const payload: unknown = await response.json();

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload.error as { message?: string }).message || '요청에 실패했습니다.')
        : '요청에 실패했습니다.';
    const error: ApiError = Object.assign(new Error(message), {
      payload,
      status: response.status,
    });
    throw error;
  }

  return payload as T;
}
