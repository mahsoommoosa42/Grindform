/**
 * @file packages/web/src/client/api.ts
 *
 * Thin typed wrapper over the Grindform JSON API. Every call returns the
 * decoded payload or throws an {@link ApiError} carrying the server's
 * `{ code, message }` envelope, so UI code can surface a useful message.
 */

import type {
  DayProgress,
  GeneratePlanRequest,
  Settings,
  ThemeId,
  WeeklyPlan,
} from './types.ts';

/** An error raised when the API responds with a non-2xx status. */
export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json();
  if (!res.ok) {
    const env = body as ErrorEnvelope;
    throw new ApiError(env.error?.code ?? 'UNKNOWN', env.error?.message ?? 'request failed');
  }
  return body as T;
};

/** Generate + persist a weekly plan. */
export const createPlan = (input: GeneratePlanRequest): Promise<{ plan: WeeklyPlan }> =>
  request('/v1/plans', { method: 'POST', body: JSON.stringify(input) });

/** Fetch a previously generated plan. */
export const getPlan = (planId: string): Promise<{ plan: WeeklyPlan }> =>
  request(`/v1/plans/${planId}`);

/** Mark a whole exercise slot complete in one tap. */
export const completeSlot = (
  planId: string,
  dayId: string,
  slotId: string,
  body: { loadKg: number; reps?: number; rpe?: number },
): Promise<{ progress: DayProgress }> =>
  request(`/v1/plans/${planId}/days/${dayId}/slots/${slotId}/complete`, {
    method: 'POST',
    body: JSON.stringify(body),
  });

/** Fetch current completion progress for a day. */
export const getDayProgress = (planId: string, dayId: string): Promise<{ progress: DayProgress }> =>
  request(`/v1/plans/${planId}/days/${dayId}/progress`);

/** Read persisted settings (theme + preferences). */
export const getSettings = (): Promise<{ settings: Settings }> => request('/v1/settings');

/** Persist the chosen theme. */
export const saveTheme = (theme: ThemeId): Promise<{ settings: Settings }> =>
  request('/v1/settings', { method: 'PATCH', body: JSON.stringify({ theme }) });
