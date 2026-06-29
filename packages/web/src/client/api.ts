/**
 * @file packages/web/src/client/api.ts
 *
 * Thin typed wrapper over the Grindform JSON API. Every call returns the
 * decoded payload or throws an {@link ApiError} carrying the server's
 * `{ code, message }` envelope, so UI code can surface a useful message.
 */

import type {
  AdminUserRow,
  AuditRow,
  DayProgress,
  GeneratePlanRequest,
  PublicUser,
  Settings,
  ThemeId,
  VolumeSummary,
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

/** Log a single set (its own weight + reps), e.g. one row of a pyramid. */
export const logSet = (body: {
  dayId: string;
  slotId: string;
  exerciseSlug: string;
  setNumber: number;
  reps: number;
  loadKg: number;
  rpe?: number;
}): Promise<{ log: unknown }> =>
  request('/v1/logs', { method: 'POST', body: JSON.stringify(body) });

/** Fetch current completion progress + volume for a day. */
export const getDayProgress = (
  planId: string,
  dayId: string,
): Promise<{ progress: DayProgress; volume: VolumeSummary }> =>
  request(`/v1/plans/${planId}/days/${dayId}/progress`);

/** Fetch the whole-week volume breakdown (kg per muscle group). */
export const getWeekVolume = (planId: string): Promise<{ volume: VolumeSummary }> =>
  request(`/v1/plans/${planId}/volume`);

/** Read persisted settings (theme + preferences). */
export const getSettings = (): Promise<{ settings: Settings }> => request('/v1/settings');

/** Persist the chosen theme. */
export const saveTheme = (theme: ThemeId): Promise<{ settings: Settings }> =>
  request('/v1/settings', { method: 'PATCH', body: JSON.stringify({ theme }) });

/** The current session's user, or `null` when not signed in. */
export const me = (): Promise<{ user: PublicUser | null }> => request('/v1/auth/me');

/** Create an account (with consent) and start a session. */
export const register = (input: {
  email: string;
  password: string;
  acceptTerms: boolean;
}): Promise<{ user: PublicUser }> =>
  request('/v1/auth/register', { method: 'POST', body: JSON.stringify(input) });

/** Sign in with email + password and start a session. */
export const login = (input: { email: string; password: string }): Promise<{ user: PublicUser }> =>
  request('/v1/auth/login', { method: 'POST', body: JSON.stringify(input) });

/** End the current session. */
export const logout = (): Promise<void> => request('/v1/auth/logout', { method: 'POST' });

/** Download a full JSON export of the current account's data (GDPR). */
export const exportAccount = (): Promise<unknown> => request('/v1/account/export');

/** Permanently erase the current account and all its data (GDPR). */
export const deleteAccount = (): Promise<void> => request('/v1/account', { method: 'DELETE' });

/** Admin: list every account with a plan count. */
export const adminListUsers = (): Promise<{ users: AdminUserRow[] }> => request('/v1/admin/users');

/** Admin: fetch one account with its audit trail. */
export const adminGetUser = (id: string): Promise<{ user: PublicUser; audit: AuditRow[] }> =>
  request(`/v1/admin/users/${id}`);

/** Admin: disable an account (revokes its sessions). */
export const adminDisableUser = (id: string): Promise<{ user: PublicUser }> =>
  request(`/v1/admin/users/${id}/disable`, { method: 'POST' });

/** Admin: re-enable a disabled account. */
export const adminEnableUser = (id: string): Promise<{ user: PublicUser }> =>
  request(`/v1/admin/users/${id}/enable`, { method: 'POST' });

/** Admin: manually mark an account's email as verified. */
export const adminVerifyUser = (id: string): Promise<{ user: PublicUser }> =>
  request(`/v1/admin/users/${id}/verify`, { method: 'POST' });

/** Admin: permanently erase an account. */
export const adminDeleteUser = (id: string): Promise<void> =>
  request(`/v1/admin/users/${id}`, { method: 'DELETE' });

/** Verify an email using the raw token from the verification link. */
export const verifyEmail = (token: string): Promise<{ ok: boolean; user: PublicUser | null }> =>
  request('/v1/auth/verify', { method: 'POST', body: JSON.stringify({ token }) });

/** Resend the verification email for the current session's user. */
export const resendVerification = (): Promise<{ ok: boolean }> =>
  request('/v1/auth/resend-verification', { method: 'POST', body: '{}' });
