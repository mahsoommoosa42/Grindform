/**
 * @file packages/core/src/errors.ts
 *
 * Domain error taxonomy for Grindform.
 *
 * Every failure mode the API surfaces is one of a small, finite set of
 * error classes defined here. Each declares a stable machine-readable
 * `code` and an `httpStatus`, so the HTTP layer never has to guess. The
 * `message` is safe to show end users; richer internal context goes in
 * `details` (logged server-side only).
 */

/** Stable, machine-readable error code. Frontends branch on this. */
export type ErrorCode =
  | 'VALIDATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL';

/** Optional structured context attached to a domain error. Never put secrets here. */
export type ErrorDetails = Record<string, unknown>;

/** The exact JSON shape the HTTP layer sends to clients. */
export interface ErrorPayload {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: ErrorDetails;
}

/**
 * Base class for every domain error. Subclasses fix `code` and
 * `httpStatus` to literal types. Don't instantiate directly.
 */
export abstract class GrindformError extends Error {
  /** Stable machine-readable identifier for this error class. */
  abstract readonly code: ErrorCode;

  /** HTTP status the API layer should respond with. */
  abstract readonly httpStatus: number;

  /** Optional structured context, included in the wire payload. */
  readonly details: ErrorDetails | undefined;

  constructor(message: string, details?: ErrorDetails) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}

/** Input failed schema or business-rule validation. HTTP 400. */
export class ValidationError extends GrindformError {
  override readonly code = 'VALIDATION' as const;
  override readonly httpStatus = 400;
}

/** Caller is not authenticated. HTTP 401. */
export class UnauthorizedError extends GrindformError {
  override readonly code = 'UNAUTHORIZED' as const;
  override readonly httpStatus = 401;
}

/** Caller is authenticated but lacks permission. HTTP 403. */
export class ForbiddenError extends GrindformError {
  override readonly code = 'FORBIDDEN' as const;
  override readonly httpStatus = 403;
}

/** The requested resource doesn't exist (or isn't visible). HTTP 404. */
export class NotFoundError extends GrindformError {
  override readonly code = 'NOT_FOUND' as const;
  override readonly httpStatus = 404;
}

/** The request collides with current resource state. HTTP 409. */
export class ConflictError extends GrindformError {
  override readonly code = 'CONFLICT' as const;
  override readonly httpStatus = 409;
}

/** The caller exceeded a rate limit. HTTP 429. */
export class RateLimitedError extends GrindformError {
  override readonly code = 'RATE_LIMITED' as const;
  override readonly httpStatus = 429;
}

/** Type guard: true iff `e` is one of our domain error subclasses. */
export const isGrindformError = (e: unknown): e is GrindformError => e instanceof GrindformError;

/**
 * Serialise any thrown value into a stable {@link ErrorPayload}. Known
 * {@link GrindformError}s reflect verbatim; anything else collapses to a
 * generic `INTERNAL` payload so server internals never leak.
 */
export const toErrorPayload = (e: unknown): ErrorPayload => {
  if (isGrindformError(e)) {
    return e.details
      ? { code: e.code, message: e.message, details: e.details }
      : { code: e.code, message: e.message };
  }
  return { code: 'INTERNAL', message: 'Internal error' };
};
