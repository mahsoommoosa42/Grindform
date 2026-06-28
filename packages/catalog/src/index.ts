/**
 * @file packages/catalog/src/index.ts
 *
 * Public barrel for `@grindform/catalog` — the exercise library and the
 * read/filter helpers over it.
 */

export type { Exercise } from './types.ts';
export { EXERCISES } from './exercises.ts';
export {
  allExercises,
  exercisesForMuscle,
  filterExercises,
  getExercise,
  meetsExperience,
  requireExercise,
} from './query.ts';
export type { FilterCriteria } from './query.ts';
