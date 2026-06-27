/**
 * @file packages/core/src/result.ts
 *
 * `Result<T, E>` — a discriminated-union "either success or error" type
 * for explicit error handling at module boundaries.
 *
 * JavaScript exceptions are invisible in function signatures; a `Result`
 * makes the error path part of the type so the compiler enforces
 * handling. Return `Result` when the error is a legitimate domain
 * outcome the caller must react to; throw a {@link GrindformError} for
 * unexpected programmer mistakes that should unwind to the HTTP edge.
 */

/** Successful result wrapping a value of type `T`. */
export type Ok<T> = { readonly ok: true; readonly value: T };

/** Failed result wrapping an error of type `E`. */
export type Err<E> = { readonly ok: false; readonly error: E };

/** Either success ({@link Ok}) or failure ({@link Err}); `ok` discriminates. */
export type Result<T, E> = Ok<T> | Err<E>;

/** Wrap a value in a successful {@link Result}. */
export const ok = <T>(value: T): Ok<T> => ({ ok: true, value });

/** Wrap an error in a failed {@link Result}. */
export const err = <E>(error: E): Err<E> => ({ ok: false, error });

/** Narrows `r` to {@link Ok}<T> when true. */
export const isOk = <T, E>(r: Result<T, E>): r is Ok<T> => r.ok;

/** Narrows `r` to {@link Err}<E> when true. */
export const isErr = <T, E>(r: Result<T, E>): r is Err<E> => !r.ok;

/** If `r` is {@link Ok}, transform its value with `f`; otherwise pass the error through. */
export const mapResult = <T, U, E>(r: Result<T, E>, f: (value: T) => U): Result<U, E> =>
  r.ok ? ok(f(r.value)) : r;

/** If `r` is {@link Err}, transform its error with `f`; otherwise pass the value through. */
export const mapErr = <T, E, F>(r: Result<T, E>, f: (error: E) => F): Result<T, F> =>
  r.ok ? r : err(f(r.error));

/**
 * Return `r.value` if `r` is {@link Ok}; throw otherwise. Use sparingly
 * — prefer narrowing with {@link isOk} / {@link isErr}.
 *
 * @throws Error if `r` is {@link Err}.
 */
export const unwrap = <T, E>(r: Result<T, E>): T => {
  if (r.ok) return r.value;
  throw new Error(`unwrap on err: ${String(r.error)}`);
};

/** Return `r.value` if `r` is {@link Ok}; otherwise return `fallback`. Never throws. */
export const unwrapOr = <T, E>(r: Result<T, E>, fallback: T): T => (r.ok ? r.value : fallback);

/**
 * Return `r.error` if `r` is {@link Err}; throw otherwise. Mostly useful
 * in tests.
 *
 * @throws Error if `r` is {@link Ok}.
 */
export const unwrapErr = <T, E>(r: Result<T, E>): E => {
  if (!r.ok) return r.error;
  throw new Error(`unwrapErr on ok: ${String(r.value)}`);
};
