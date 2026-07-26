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
  CatalogExercise,
  CustomExercise,
  CustomExerciseInput,
  DayProgress,
  ExerciseRef,
  GeneratePlanRequest,
  CreateProgramRequest,
  ProgramSummary,
  ProgramWeekSummary,
  PublicUser,
  Settings,
  ThemeId,
  VolumeSummary,
  WeeklyPlan,
  PlanSummary,
  WeekAssignment,
  WeekResolution,
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

export const createProgram = (
  input: CreateProgramRequest,
): Promise<{ program: ProgramSummary & { weeks: ProgramWeekSummary[] } }> =>
  request('/v1/programs', { method: 'POST', body: JSON.stringify(input) });

export const listPrograms = (): Promise<{ programs: ProgramSummary[] }> => request('/v1/programs');

export const markProgramBreak = (programId: string, weekStart: string): Promise<unknown> =>
  request(`/v1/programs/${programId}/weeks/${weekStart}/break`, {
    method: 'POST',
    body: JSON.stringify({}),
  });

export const unmarkProgramBreak = (programId: string, weekStart: string): Promise<unknown> =>
  request(`/v1/programs/${programId}/weeks/${weekStart}/break`, { method: 'DELETE' });

export const deleteProgram = (programId: string): Promise<void> =>
  request(`/v1/programs/${programId}`, { method: 'DELETE' });

/** Fetch a previously generated plan. */
export const getPlan = (planId: string): Promise<{ plan: WeeklyPlan }> =>
  request(`/v1/plans/${planId}`);

export const listPlans = (): Promise<{ plans: PlanSummary[] }> => request('/v1/plans');

export const resolveWeek = (weekStart: string): Promise<WeekResolution> =>
  request(`/v1/weeks/${weekStart}`);

export const listWeekAssignments = (
  from: string,
  to: string,
): Promise<{ assignments: WeekAssignment[] }> =>
  request(`/v1/weeks?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export const assignWeek = (
  weekStart: string,
  planId: string,
): Promise<{ assignment: WeekAssignment }> =>
  request(`/v1/weeks/${weekStart}`, {
    method: 'PUT',
    body: JSON.stringify({ planId }),
  });

export const unassignWeek = (weekStart: string): Promise<void> =>
  request(`/v1/weeks/${weekStart}`, { method: 'DELETE' });

export const setDefaultPlan = (planId: string): Promise<{ ok: boolean }> =>
  request(`/v1/plans/${planId}/default`, { method: 'PUT' });

export const clearDefaultPlan = (planId: string): Promise<void> =>
  request(`/v1/plans/${planId}/default`, { method: 'DELETE' });

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

/** List the built-in catalog exercises (the shared global index). */
export const listExercises = (): Promise<{ exercises: CatalogExercise[] }> =>
  request('/v1/exercises');

/** List the current account's custom exercises. */
export const listCustomExercises = (): Promise<{ exercises: CustomExercise[] }> =>
  request('/v1/exercises/custom');

/** Create a custom exercise for the current account. */
export const createCustomExercise = (
  input: CustomExerciseInput,
): Promise<{ exercise: CustomExercise }> =>
  request('/v1/exercises/custom', { method: 'POST', body: JSON.stringify(input) });

/** Delete one of the current account's custom exercises. */
export const deleteCustomExercise = (id: string): Promise<void> =>
  request(`/v1/exercises/custom/${id}`, { method: 'DELETE' });

/** Swap the exercise occupying a slot for another (catalog or custom). */
export const swapSlot = (
  planId: string,
  dayId: string,
  slotId: string,
  exercise: ExerciseRef,
): Promise<{ plan: WeeklyPlan }> =>
  request(`/v1/plans/${planId}/days/${dayId}/slots/${slotId}/swap`, {
    method: 'PUT',
    body: JSON.stringify({ exercise }),
  });

/** Add an extra exercise to a training session on a day. */
export const addSlot = (
  planId: string,
  dayId: string,
  sessionId: string,
  exercise: ExerciseRef,
): Promise<{ plan: WeeklyPlan }> =>
  request(`/v1/plans/${planId}/days/${dayId}/slots`, {
    method: 'POST',
    body: JSON.stringify({ sessionId, exercise }),
  });

/** Remove an exercise slot from a day. */
export const removeSlot = (
  planId: string,
  dayId: string,
  slotId: string,
): Promise<{ plan: WeeklyPlan }> =>
  request(`/v1/plans/${planId}/days/${dayId}/slots/${slotId}`, { method: 'DELETE' });

/**
 * Restore a day's sessions to a prior snapshot. Powers undo/redo of the
 * swap/add/remove edits — the client holds the snapshots and replays the
 * one whose day changed.
 */
export const restoreDaySessions = (
  planId: string,
  dayId: string,
  sessions: WeeklyPlan['days'][number]['sessions'],
): Promise<{ plan: WeeklyPlan }> =>
  request(`/v1/plans/${planId}/days/${dayId}/sessions`, {
    method: 'PUT',
    body: JSON.stringify({ sessions }),
  });

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
