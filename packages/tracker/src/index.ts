/**
 * @file packages/tracker/src/index.ts
 *
 * Public barrel for `@grindform/tracker` — set logging, day-progress
 * summaries, and progression suggestions.
 */

export { collectSlots, summariseDay } from './progress.ts';
export type { DayProgress, SlotProgress } from './progress.ts';
export { suggestProgression } from './progression.ts';
export type { ProgressionOptions, ProgressionSuggestion } from './progression.ts';
export {
  getDayProgress,
  getDayVolume,
  getProgressionSuggestion,
  getWeekVolume,
  logCompletedSet,
  markSlotComplete,
} from './track.ts';
export type { LogSetInput, MarkSlotCompleteInput } from './track.ts';
export { summariseDayVolume, summariseWeekVolume } from './volume.ts';
export type { DayLogs, MuscleVolume, VolumeSummary } from './volume.ts';
