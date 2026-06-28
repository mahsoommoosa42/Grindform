/**
 * @file packages/web/src/client/types.ts
 *
 * Plain, brand-free shapes for the data the client exchanges with the
 * API. These intentionally mirror (a subset of) the server's domain
 * types but use plain `string` ids, so the browser bundle stays free of
 * any server/runtime dependencies.
 */

export type Goal = 'build_muscle' | 'lose_fat' | 'build_endurance' | 'recomp';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type ThemeId = 'pulse' | 'grind' | 'girlypop' | 'minimal';
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type DayActivity = 'rest' | 'pilates' | 'physio' | 'steps' | 'custom';
export type Equipment =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'kettlebell'
  | 'band'
  | 'bodyweight';
export type MuscleGroup =
  | 'glutes'
  | 'hamstrings'
  | 'quads'
  | 'calves'
  | 'back'
  | 'chest'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'core'
  | 'full_body';
export type BlockType = 'warmup' | 'physio' | 'main' | 'accessory' | 'cooldown';

export interface RepScheme {
  readonly sets: number;
  readonly repsLow: number;
  readonly repsHigh: number;
  readonly restSeconds: number;
  readonly perSide: boolean;
}

export interface TimeBudget {
  readonly sessionMinutes: number;
  readonly warmupMinutes: number;
  readonly cooldownMinutes: number;
  readonly physioMinutes: number;
}

export interface ExerciseSlot {
  readonly id: string;
  readonly exerciseSlug: string;
  readonly name: string;
  readonly scheme: RepScheme;
  readonly cue?: string;
}

export interface SessionBlock {
  readonly type: BlockType;
  readonly title: string;
  readonly estMinutes: number;
  readonly slots: readonly ExerciseSlot[];
  readonly note?: string;
}

export interface PlanDay {
  readonly id: string;
  readonly weekday: Weekday;
  readonly activity?: DayActivity;
  readonly label?: string;
  readonly focus: readonly MuscleGroup[];
  readonly blocks: readonly SessionBlock[];
  readonly estMinutes: number;
}

export interface WeeklyPlan {
  readonly id: string;
  readonly goal: Goal;
  readonly experience: Experience;
  readonly variation: 'A' | 'B';
  readonly timeBudget: TimeBudget;
  readonly days: readonly PlanDay[];
}

export interface SlotProgress {
  readonly slotId: string;
  readonly exerciseSlug: string;
  readonly name: string;
  readonly setsPrescribed: number;
  readonly setsLogged: number;
  readonly complete: boolean;
  readonly topSetLoadKg?: number;
}

export interface DayProgress {
  readonly totalSlots: number;
  readonly completeSlots: number;
  readonly percentComplete: number;
  readonly slots: readonly SlotProgress[];
}

export interface Settings {
  readonly theme: ThemeId;
  readonly preferences: Record<string, unknown>;
}

export type Role = 'member' | 'admin';
export type AccountStatus = 'active' | 'disabled';

/** The public projection of an account returned by the API. */
export interface PublicUser {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly status: AccountStatus;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}

/** A row in the admin user list (public user + a plan count). */
export interface AdminUserRow extends PublicUser {
  readonly planCount: number;
}

/** One entry in an account's audit trail, as shown in the admin console. */
export interface AuditRow {
  readonly id: string;
  readonly action: string;
  readonly actorUserId: string | null;
  readonly details: Record<string, unknown>;
  readonly createdAt: string;
}

/** One day's spec in a generate request. */
export interface DaySpecInput {
  readonly weekday: Weekday;
  readonly activity?: DayActivity;
  readonly focus?: MuscleGroup[];
  readonly label?: string;
}

/** The full generate-plan request body. */
export interface GeneratePlanRequest {
  readonly goal: Goal;
  readonly experience: Experience;
  readonly equipment: Equipment[];
  readonly timeBudget: TimeBudget;
  readonly days: DaySpecInput[];
  readonly variation: 'A' | 'B';
  readonly seed?: number;
}
