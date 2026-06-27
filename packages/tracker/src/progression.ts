/**
 * @file packages/tracker/src/progression.ts
 *
 * Pure progressive-overload heuristic: look at recent logged sessions for
 * an exercise and decide whether it's time to add weight. The rule is the
 * classic "double progression" — once you hit the top of the rep range
 * for all prescribed sets at a given load across enough sessions, bump
 * the load.
 */

import type { RepScheme } from '@grindform/core';
import type { SetLog } from '@grindform/db';

/** Tunables for {@link suggestProgression}. */
export interface ProgressionOptions {
  /** Consecutive qualifying sessions required before suggesting more load. */
  readonly sessionsRequired?: number;
  /** Load increment to suggest, in kg. */
  readonly incrementKg?: number;
}

/** The recommendation returned to the UI. */
export interface ProgressionSuggestion {
  readonly suggestLoadIncrease: boolean;
  readonly reason: string;
  /** The load the recent sessions were performed at, if any history exists. */
  readonly currentTopLoadKg?: number;
  /** The recommended next load, present only when suggesting an increase. */
  readonly suggestedLoadKg?: number;
}

/** One day's worth of sets, reduced to the numbers the heuristic needs. */
interface SessionSummary {
  readonly day: string;
  readonly load: number;
  readonly sets: number;
  readonly minReps: number;
}

const DEFAULT_SESSIONS_REQUIRED = 2;
const DEFAULT_INCREMENT_KG = 2.5;

/** Round to two decimals (avoids float noise on 2.5kg jumps). */
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Group logs by calendar day (UTC) and reduce each to a {@link SessionSummary}. */
const summariseSessions = (history: readonly SetLog[]): SessionSummary[] => {
  const byDay = new Map<string, SetLog[]>();
  for (const log of history) {
    const key = log.completedAt.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    if (bucket === undefined) {
      byDay.set(key, [log]);
    } else {
      bucket.push(log);
    }
  }
  const sessions = [...byDay.entries()].map(
    ([day, logs]): SessionSummary => ({
      day,
      load: Math.max(...logs.map((l) => l.loadKg)),
      sets: logs.length,
      minReps: Math.min(...logs.map((l) => l.reps)),
    }),
  );
  return sessions.sort((a, b) => (a.day < b.day ? 1 : -1));
};

/**
 * Decide whether to suggest a load increase for an exercise given its
 * recent {@link SetLog} history and the prescribed {@link RepScheme}.
 */
export const suggestProgression = (
  history: readonly SetLog[],
  scheme: RepScheme,
  options: ProgressionOptions = {},
): ProgressionSuggestion => {
  const required = options.sessionsRequired ?? DEFAULT_SESSIONS_REQUIRED;
  const increment = options.incrementKg ?? DEFAULT_INCREMENT_KG;

  if (history.length === 0) {
    return { suggestLoadIncrease: false, reason: 'No sets logged yet for this exercise.' };
  }

  const sessions = summariseSessions(history);
  const top = sessions[0] as SessionSummary;

  if (sessions.length < required) {
    return {
      suggestLoadIncrease: false,
      reason: `Log ${required} sessions at the same load to gauge progression.`,
      currentTopLoadKg: top.load,
    };
  }

  const recent = sessions.slice(0, required);
  const load = top.load;
  const allReady = recent.every(
    (s) => s.load === load && s.sets >= scheme.sets && s.minReps >= scheme.repsHigh,
  );

  if (allReady) {
    return {
      suggestLoadIncrease: true,
      reason: `Hit ${scheme.repsHigh} reps for ${scheme.sets} sets across ${required} sessions — add weight.`,
      currentTopLoadKg: load,
      suggestedLoadKg: round2(load + increment),
    };
  }

  return {
    suggestLoadIncrease: false,
    reason: 'Keep building reps at the current load before adding weight.',
    currentTopLoadKg: load,
  };
};
