/**
 * @file packages/web/src/client/main.ts
 *
 * The Grindform single-page client: one Lit element, `<gf-app>`, that
 * drives plan generation, the weekly view, the in-session tracker, and
 * live theme switching. Components render into (open) shadow DOM and pick
 * up theme colours via the `--gf-*` custom properties on :root, so a
 * theme change restyles everything with no per-component code.
 *
 * Authored without decorators to stay friendly to the repo's strict
 * `useDefineForClassFields` TS config: reactive fields are declared with
 * `declare` and initialised in the constructor.
 */

import { css, html, LitElement, nothing, svg } from 'lit';
import type { SVGTemplateResult, TemplateResult } from 'lit';

import {
  estimateOneRepMax,
  expandSets,
  GOAL_PROFILES,
  loadGoalForGoal,
  prescribeLoad,
  profileForGoal,
} from '@grindform/loadcalc';
import type { LoadGoal, Prescription } from '@grindform/loadcalc';

import * as api from './api.ts';
import { ApiError } from './api.ts';
import type {
  AdminUserRow,
  AuditRow,
  CatalogExercise,
  CustomExercise,
  DayProgress,
  DaySpecInput,
  Equipment,
  ExerciseRef,
  ExerciseRole,
  ExerciseSlot,
  Experience,
  ExternalActivity,
  ExternalSession,
  Goal,
  MuscleGroup,
  PlanDay,
  PublicUser,
  SessionBlock,
  SessionSpecInput,
  TimeBudget,
  TrainingSession,
  ThemeId,
  VolumeSummary,
  WeeklyPlan,
  Weekday,
} from './types.ts';

/** Display labels for external activities. */
const ACTIVITY_LABELS: Record<ExternalActivity, string> = {
  run: 'Run',
  walk: 'Walk',
  cycle: 'Cycle',
  swim: 'Swim',
  pilates: 'Pilates',
  physio: 'Physio',
  mobility: 'Mobility',
  sport: 'Sport',
  custom: 'Other',
};

const THEMES: readonly { id: ThemeId; label: string }[] = [
  { id: 'pulse', label: 'Pulse' },
  { id: 'grind', label: 'Grind' },
  { id: 'girlypop', label: 'Girly Pop' },
  { id: 'minimal', label: 'Minimal' },
];

/** Stroke icons for the nav tabs (shown in the mobile bottom bar). */
const svgBase = (paths: SVGTemplateResult): SVGTemplateResult => svg`
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    ${paths}
  </svg>
`;
const ICON_BUILD = svgBase(svg`<path d="M4 9v6M7 6v12M17 6v12M20 9v6M7 12h10" />`);
const ICON_WEEK = svgBase(
  svg`<rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" />`,
);
const ICON_CALC = svgBase(
  svg`<rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h4" />`,
);
const ICON_EXERCISES = svgBase(
  svg`<path d="M3 12h2M19 12h2M7 8v8M17 8v8M7 12h10" /><rect x="5" y="9" width="2" height="6" rx="1" /><rect x="17" y="9" width="2" height="6" rx="1" />`,
);

const GOALS: readonly { id: Goal; label: string }[] = [
  { id: 'build_muscle', label: 'Build muscle' },
  { id: 'lose_fat', label: 'Lose fat' },
  { id: 'build_endurance', label: 'Build endurance' },
  { id: 'recomp', label: 'Recomp' },
];

const EXPERIENCES: readonly Experience[] = ['beginner', 'intermediate', 'advanced'];

const EQUIPMENT: readonly Equipment[] = [
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebell',
  'band',
  'bodyweight',
];

const MUSCLES: readonly MuscleGroup[] = [
  'glutes',
  'hamstrings',
  'quads',
  'calves',
  'back',
  'chest',
  'shoulders',
  'biceps',
  'triceps',
  'core',
  'full_body',
];

const EXERCISE_ROLES: readonly ExerciseRole[] = ['main', 'accessory', 'conditioning', 'mobility'];

const WEEKDAYS: readonly { id: Weekday; label: string }[] = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' },
];

const ACTIVITIES: readonly ExternalActivity[] = [
  'run',
  'walk',
  'cycle',
  'swim',
  'pilates',
  'physio',
  'mobility',
  'sport',
  'custom',
];

/** Where the physio block can sit in a training session (mirrors core's PHYSIO_POSITIONS). */
const PHYSIO_POSITIONS: readonly string[] = [
  'Before warm-up',
  'After warm-up',
  'After main lift',
  'After accessories',
  'At the end',
];

/** A training session being configured in the generator form. */
interface TrainingSessionConfig {
  kind: 'training';
  focus: MuscleGroup[];
  /** Per-session overrides; `null` means "use the plan-wide default". */
  sessionMinutes: number | null;
  physioMinutes: number | null;
  physioPosition: number;
}

/** An external (self-tracked) session being configured in the generator form. */
interface ExternalSessionConfig {
  kind: 'external';
  activity: ExternalActivity;
  plannedMinutes: number;
}

type SessionConfig = TrainingSessionConfig | ExternalSessionConfig;

/** A day's editable configuration: an ordered list of sessions (empty = rest). */
interface DayConfig {
  weekday: Weekday;
  sessions: SessionConfig[];
}

/** A fresh training-session config with no per-session time overrides. */
const newTrainingConfig = (focus: MuscleGroup[]): TrainingSessionConfig => ({
  kind: 'training',
  focus,
  sessionMinutes: null,
  physioMinutes: null,
  physioPosition: 0,
});

/** A fresh external-session config with a sensible default duration. */
const newExternalConfig = (activity: ExternalActivity = 'run'): ExternalSessionConfig => ({
  kind: 'external',
  activity,
  plannedMinutes: 30,
});

const DEFAULT_DAYS: readonly DayConfig[] = [
  { weekday: 'mon', sessions: [newTrainingConfig(['glutes', 'hamstrings'])] },
  { weekday: 'tue', sessions: [newTrainingConfig(['back', 'biceps'])] },
  { weekday: 'wed', sessions: [newExternalConfig('pilates')] },
  { weekday: 'thu', sessions: [newTrainingConfig(['quads', 'shoulders'])] },
  { weekday: 'fri', sessions: [newTrainingConfig(['chest', 'triceps'])] },
  { weekday: 'sat', sessions: [newTrainingConfig(['glutes', 'core'])] },
  { weekday: 'sun', sessions: [] },
];

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

const weekdayLabel = (w: Weekday): string => WEEKDAYS.find((d) => d.id === w)?.label ?? w;

/** One editable set row in the tracker (warm-up or working). */
interface EditableSet {
  readonly kind: 'warmup' | 'working';
  /** Target/actual weight in kg; `null` until known. */
  weight: number | null;
  /** Target/actual reps; `null` until known. */
  reps: number | null;
  /** Local tick for warm-up sets (not logged to the server / volume). */
  warmupDone: boolean;
}

/** Per-slot tracker state: the recent set, options, and the set rows. */
interface SlotUiState {
  /** Recent best set weight, used to estimate 1RM and prescribe load. */
  recentWeight: number | null;
  recentReps: number | null;
  pyramid: boolean;
  warmups: number;
  sets: EditableSet[];
}

/** Default warm-up sets: a couple for heavy mains, none for accessories. */
const defaultWarmups = (slot: ExerciseSlot): number => (slot.pyramid === true ? 2 : 0);

/** localStorage key for a remembered recent set, keyed by exercise. */
const recentKey = (slug: string): string => `gf.recent.${slug}`;

/** Read a remembered recent set for an exercise, if any. */
const readRecent = (slug: string): { weight: number; reps: number } | null => {
  try {
    const raw = globalThis.localStorage?.getItem(recentKey(slug));
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { weight, reps } = parsed as Record<string, unknown>;
    if (typeof weight === 'number' && typeof reps === 'number') return { weight, reps };
    return null;
  } catch {
    return null;
  }
};

/** Remember a recent set for an exercise so the prescription pre-fills next time. */
const writeRecent = (slug: string, weight: number, reps: number): void => {
  try {
    globalThis.localStorage?.setItem(recentKey(slug), JSON.stringify({ weight, reps }));
  } catch {
    /* storage unavailable (private mode / quota) — non-fatal */
  }
};

/** Locally-tracked completion state for an external session, keyed by its id. */
interface ExternalLog {
  done: boolean;
  actualMinutes: number | null;
}

/** localStorage key for an external session's tracked completion. */
const externalKey = (sessionId: string): string => `gf.ext.${sessionId}`;

/** Read an external session's tracked state (done + actual minutes), if any. */
const readExternal = (sessionId: string): ExternalLog => {
  try {
    const raw = globalThis.localStorage?.getItem(externalKey(sessionId));
    if (raw === null || raw === undefined) return { done: false, actualMinutes: null };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { done: false, actualMinutes: null };
    const { done, actualMinutes } = parsed as Record<string, unknown>;
    return {
      done: done === true,
      actualMinutes: typeof actualMinutes === 'number' ? actualMinutes : null,
    };
  } catch {
    return { done: false, actualMinutes: null };
  }
};

/** Persist an external session's tracked state so it survives reloads. */
const writeExternal = (sessionId: string, log: ExternalLog): void => {
  try {
    globalThis.localStorage?.setItem(externalKey(sessionId), JSON.stringify(log));
  } catch {
    /* storage unavailable — non-fatal */
  }
};

/**
 * Build the set rows for a slot: optional warm-ups + working sets, with
 * weights pre-filled from the recent-set 1RM (when known) and the day's
 * goal band. Pyramids ramp weight up / reps down across the working sets.
 */
const buildSetRows = (
  slot: ExerciseSlot,
  goal: Goal,
  recentWeight: number | null,
  recentReps: number | null,
  pyramid: boolean,
  warmups: number,
): EditableSet[] => {
  const hasRecent =
    recentWeight !== null && recentWeight > 0 && recentReps !== null && recentReps >= 1;
  const oneRepMax = hasRecent
    ? estimateOneRepMax({ weight: recentWeight, reps: recentReps })
    : undefined;
  const intensity = profileForGoal(loadGoalForGoal(goal)).intensity;
  const planned = expandSets({
    workingSets: slot.scheme.sets,
    repsLow: slot.scheme.repsLow,
    repsHigh: slot.scheme.repsHigh,
    intensity,
    pyramid,
    warmupSets: warmups,
    ...(oneRepMax === undefined ? {} : { oneRepMax }),
  });
  return planned.map((p) => ({
    kind: p.kind,
    weight: p.weightKg ?? null,
    reps: p.reps,
    warmupDone: false,
  }));
};

/** The working set rows of a slot, in order (warm-ups excluded). */
const workingRows = (state: SlotUiState): EditableSet[] =>
  state.sets.filter((s) => s.kind === 'working');

/**
 * The exercise-picker overlay state, opened when the user swaps an exercise
 * in a slot or adds an extra one to a training session. `slotId` is set when
 * swapping; `sessionId` when adding.
 */
interface PickerState {
  readonly mode: 'swap' | 'add';
  readonly dayId: string;
  readonly slotId?: string;
  readonly sessionId?: string;
}

/** The "create a custom exercise" form's editable fields. */
interface CustomForm {
  name: string;
  primaryMuscles: MuscleGroup[];
  equipment: Equipment[];
  role: ExerciseRole;
  unilateral: boolean;
  cue: string;
}

/** A fresh, empty custom-exercise form. */
const emptyCustomForm = (): CustomForm => ({
  name: '',
  primaryMuscles: [],
  equipment: ['bodyweight'],
  role: 'accessory',
  unilateral: false,
  cue: '',
});

/** Compact "3 × 8–12" prescription label for a slot (with a /side marker). */
const schemeLabel = (slot: ExerciseSlot): string => {
  const r = slot.scheme;
  const reps = r.repsLow === r.repsHigh ? `${r.repsLow}` : `${r.repsLow}–${r.repsHigh}`;
  return `${r.sets} × ${reps}${r.perSide ? '/side' : ''}`;
};

/** The whole Grindform UI. */
export class GfApp extends LitElement {
  static override properties = {
    authStatus: { state: true },
    user: { state: true },
    authMode: { state: true },
    authEmail: { state: true },
    authPassword: { state: true },
    authConsent: { state: true },
    authError: { state: true },
    authBusy: { state: true },
    accountMenuOpen: { state: true },
    showPrivacy: { state: true },
    adminUsers: { state: true },
    adminDetail: { state: true },
    adminError: { state: true },
    theme: { state: true },
    view: { state: true },
    goal: { state: true },
    experience: { state: true },
    equipment: { state: true },
    sessionMinutes: { state: true },
    warmupMinutes: { state: true },
    cooldownMinutes: { state: true },
    physioMinutes: { state: true },
    variation: { state: true },
    days: { state: true },
    plan: { state: true },
    selectedDayId: { state: true },
    progress: { state: true },
    dayVolume: { state: true },
    weekVolume: { state: true },
    slotState: { state: true },
    externalState: { state: true },
    busy: { state: true },
    error: { state: true },
    calcExercise: { state: true },
    calcWeight: { state: true },
    calcReps: { state: true },
    calcGoal: { state: true },
    catalog: { state: true },
    customExercises: { state: true },
    exerciseSearch: { state: true },
    exerciseMuscle: { state: true },
    customForm: { state: true },
    customBusy: { state: true },
    customError: { state: true },
    picker: { state: true },
    pickerSearch: { state: true },
    pickerBusy: { state: true },
    pickerError: { state: true },
  };

  declare authStatus: 'loading' | 'auth' | 'ready';
  declare user: PublicUser | null;
  declare authMode: 'login' | 'register';
  declare authEmail: string;
  declare authPassword: string;
  declare authConsent: boolean;
  declare authError: string | null;
  declare authBusy: boolean;
  declare accountMenuOpen: boolean;
  declare showPrivacy: boolean;
  declare adminUsers: AdminUserRow[] | null;
  declare adminDetail: { user: PublicUser; audit: AuditRow[] } | null;
  declare adminError: string | null;
  declare theme: ThemeId;
  declare view: 'generate' | 'week' | 'admin' | 'calculator' | 'exercises';
  declare goal: Goal;
  declare experience: Experience;
  declare equipment: Equipment[];
  declare sessionMinutes: number;
  declare warmupMinutes: number;
  declare cooldownMinutes: number;
  declare physioMinutes: number;
  declare variation: 'A' | 'B';
  declare days: DayConfig[];
  declare plan: WeeklyPlan | null;
  declare selectedDayId: string | null;
  declare progress: Record<string, DayProgress>;
  /** Per-day volume summaries, keyed by day id. */
  declare dayVolume: Record<string, VolumeSummary>;
  /** Whole-week volume summary for the current plan. */
  declare weekVolume: VolumeSummary | null;
  /** Per-slot tracker state (recent set, options, set rows), keyed by slot id. */
  declare slotState: Record<string, SlotUiState>;
  /** Locally-tracked external-session state, keyed by plan-session id. */
  declare externalState: Record<string, ExternalLog>;
  declare busy: boolean;
  declare error: string | null;
  /** Load-calculator inputs (client-side only; never persisted). */
  declare calcExercise: string;
  declare calcWeight: number;
  declare calcReps: number;
  declare calcGoal: LoadGoal;
  /** The built-in exercise catalog (shared global index), loaded lazily. */
  declare catalog: CatalogExercise[];
  /** The account's custom exercises (never part of the global index). */
  declare customExercises: CustomExercise[];
  /** Free-text filter for the Exercises view + the swap/add picker. */
  declare exerciseSearch: string;
  /** Muscle-group filter for the Exercises view (`'all'` = no filter). */
  declare exerciseMuscle: MuscleGroup | 'all';
  /** The custom-exercise creation form. */
  declare customForm: CustomForm;
  declare customBusy: boolean;
  declare customError: string | null;
  /** The open swap/add picker, or `null` when closed. */
  declare picker: PickerState | null;
  declare pickerSearch: string;
  declare pickerBusy: boolean;
  declare pickerError: string | null;

  constructor() {
    super();
    this.authStatus = 'loading';
    this.user = null;
    this.authMode = 'login';
    this.authEmail = '';
    this.authPassword = '';
    this.authConsent = false;
    this.authError = null;
    this.authBusy = false;
    this.accountMenuOpen = false;
    this.showPrivacy = false;
    this.adminUsers = null;
    this.adminDetail = null;
    this.adminError = null;
    this.theme = readInitialTheme();
    this.view = 'generate';
    this.goal = 'build_muscle';
    this.experience = 'intermediate';
    this.equipment = [...EQUIPMENT];
    this.sessionMinutes = 60;
    this.warmupMinutes = 8;
    this.cooldownMinutes = 5;
    this.physioMinutes = 0;
    this.variation = 'A';
    this.days = DEFAULT_DAYS.map((d) => ({
      weekday: d.weekday,
      sessions: d.sessions.map((s) =>
        s.kind === 'training' ? { ...s, focus: [...s.focus] } : { ...s },
      ),
    }));
    this.plan = null;
    this.selectedDayId = null;
    this.progress = {};
    this.dayVolume = {};
    this.weekVolume = null;
    this.slotState = {};
    this.externalState = {};
    this.busy = false;
    this.error = null;
    this.calcExercise = '';
    this.calcWeight = 60;
    this.calcReps = 8;
    this.calcGoal = 'hypertrophy';
    this.catalog = [];
    this.customExercises = [];
    this.exerciseSearch = '';
    this.exerciseMuscle = 'all';
    this.customForm = emptyCustomForm();
    this.customBusy = false;
    this.customError = null;
    this.picker = null;
    this.pickerSearch = '';
    this.pickerBusy = false;
    this.pickerError = null;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.bootstrap();
  }

  /** Resolve the current session, then gate the app on whether we're signed in. */
  private async bootstrap(): Promise<void> {
    try {
      const { user } = await api.me();
      if (user !== null) {
        this.enterApp(user);
        return;
      }
    } catch {
      /* Treat any failure as "not signed in" and show the auth screen. */
    }
    this.authStatus = 'auth';
  }

  private enterApp(user: PublicUser): void {
    this.user = user;
    this.authStatus = 'ready';
    void this.syncSettings();
    void this.loadExercises();
  }

  /** Load the catalog (once) + the account's custom exercises. */
  private async loadExercises(): Promise<void> {
    try {
      const [{ exercises: catalog }, { exercises: custom }] = await Promise.all([
        this.catalog.length === 0
          ? api.listExercises()
          : Promise.resolve({ exercises: this.catalog }),
        api.listCustomExercises(),
      ]);
      this.catalog = catalog;
      this.customExercises = custom;
    } catch {
      /* Non-fatal: the picker/Exercises view will simply show what loaded. */
    }
  }

  private async syncSettings(): Promise<void> {
    try {
      const { settings } = await api.getSettings();
      this.applyTheme(settings.theme);
    } catch {
      /* Offline or first run: keep the locally-stored theme. */
    }
  }

  private async onSubmitAuth(): Promise<void> {
    const email = this.authEmail.trim();
    if (email === '' || this.authPassword === '') {
      this.authError = 'Enter your email and password.';
      return;
    }
    if (this.authMode === 'register' && !this.authConsent) {
      this.authError = 'Please accept the privacy terms to create an account.';
      return;
    }
    this.authBusy = true;
    this.authError = null;
    try {
      const { user } =
        this.authMode === 'register'
          ? await api.register({
              email,
              password: this.authPassword,
              acceptTerms: this.authConsent,
            })
          : await api.login({ email, password: this.authPassword });
      this.authPassword = '';
      this.authConsent = false;
      this.enterApp(user);
    } catch (err) {
      this.authError = err instanceof ApiError ? err.message : 'Something went wrong. Try again.';
    } finally {
      this.authBusy = false;
    }
  }

  private async onLogout(): Promise<void> {
    try {
      await api.logout();
    } catch {
      /* ignore: clear local state regardless */
    }
    this.resetToAuth();
  }

  private resetToAuth(): void {
    this.user = null;
    this.plan = null;
    this.progress = {};
    this.dayVolume = {};
    this.weekVolume = null;
    this.slotState = {};
    this.selectedDayId = null;
    this.accountMenuOpen = false;
    this.adminUsers = null;
    this.adminDetail = null;
    this.catalog = [];
    this.customExercises = [];
    this.picker = null;
    this.customForm = emptyCustomForm();
    this.view = 'generate';
    this.authMode = 'login';
    this.authStatus = 'auth';
  }

  private async onExport(): Promise<void> {
    this.accountMenuOpen = false;
    try {
      const data = await api.exportAccount();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'grindform-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      this.error = err instanceof ApiError ? err.message : 'Could not export your data.';
    }
  }

  private async onDeleteAccount(): Promise<void> {
    this.accountMenuOpen = false;
    const confirmed =
      typeof window === 'undefined'
        ? true
        : window.confirm(
            'Permanently delete your account and all your plans? This cannot be undone.',
          );
    if (!confirmed) return;
    try {
      await api.deleteAccount();
      this.resetToAuth();
    } catch (err) {
      this.error = err instanceof ApiError ? err.message : 'Could not delete your account.';
    }
  }

  private async openAdmin(): Promise<void> {
    this.accountMenuOpen = false;
    this.view = 'admin';
    this.adminDetail = null;
    this.adminError = null;
    try {
      const { users } = await api.adminListUsers();
      this.adminUsers = users;
    } catch (err) {
      this.adminError = err instanceof ApiError ? err.message : 'Could not load users.';
    }
  }

  private async openAdminUser(id: string): Promise<void> {
    try {
      this.adminDetail = await api.adminGetUser(id);
    } catch (err) {
      this.adminError = err instanceof ApiError ? err.message : 'Could not load that user.';
    }
  }

  private async onAdminToggleStatus(row: PublicUser): Promise<void> {
    try {
      if (row.status === 'active') await api.adminDisableUser(row.id);
      else await api.adminEnableUser(row.id);
      await this.refreshAdmin(row.id);
    } catch (err) {
      this.adminError = err instanceof ApiError ? err.message : 'Could not update that account.';
    }
  }

  private async onAdminDeleteUser(id: string): Promise<void> {
    const confirmed =
      typeof window === 'undefined' ? true : window.confirm('Permanently delete this account?');
    if (!confirmed) return;
    try {
      await api.adminDeleteUser(id);
      this.adminDetail = null;
      const { users } = await api.adminListUsers();
      this.adminUsers = users;
    } catch (err) {
      this.adminError = err instanceof ApiError ? err.message : 'Could not delete that account.';
    }
  }

  private async refreshAdmin(detailId: string): Promise<void> {
    const { users } = await api.adminListUsers();
    this.adminUsers = users;
    if (this.adminDetail !== null) await this.openAdminUser(detailId);
  }

  private applyTheme(theme: ThemeId): void {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('gf-theme', theme);
    } catch {
      /* ignore storage failures */
    }
  }

  private onThemeChange(e: Event): void {
    const theme = (e.target as HTMLSelectElement).value as ThemeId;
    this.applyTheme(theme);
    void api.saveTheme(theme).catch(() => undefined);
  }

  private toggleEquipment(item: Equipment): void {
    this.equipment = this.equipment.includes(item)
      ? this.equipment.filter((e) => e !== item)
      : [...this.equipment, item];
  }

  /** Append a session of the given kind to a day. */
  private addSession(weekday: Weekday, kind: 'training' | 'external'): void {
    const fresh: SessionConfig = kind === 'training' ? newTrainingConfig([]) : newExternalConfig();
    this.days = this.days.map((d) =>
      d.weekday === weekday ? { ...d, sessions: [...d.sessions, fresh] } : d,
    );
  }

  /** Remove the session at `index` from a day. */
  private removeSession(weekday: Weekday, index: number): void {
    this.days = this.days.map((d) =>
      d.weekday === weekday ? { ...d, sessions: d.sessions.filter((_, i) => i !== index) } : d,
    );
  }

  /** Replace the session at `index` in a day via an updater. */
  private updateSession(
    weekday: Weekday,
    index: number,
    update: (s: SessionConfig) => SessionConfig,
  ): void {
    this.days = this.days.map((d) =>
      d.weekday === weekday
        ? { ...d, sessions: d.sessions.map((s, i) => (i === index ? update(s) : s)) }
        : d,
    );
  }

  private toggleSessionFocus(weekday: Weekday, index: number, muscle: MuscleGroup): void {
    this.updateSession(weekday, index, (s) => {
      if (s.kind !== 'training') return s;
      const focus = s.focus.includes(muscle)
        ? s.focus.filter((m) => m !== muscle)
        : [...s.focus, muscle];
      return { ...s, focus };
    });
  }

  private buildRequest(): DaySpecInput[] {
    return this.days.map(
      (d): DaySpecInput => ({
        weekday: d.weekday,
        sessions: d.sessions.map((s): SessionSpecInput => {
          if (s.kind === 'external') {
            return {
              kind: 'external',
              activity: s.activity,
              label: ACTIVITY_LABELS[s.activity],
              plannedMinutes: s.plannedMinutes,
            };
          }
          const focus = s.focus.length > 0 ? s.focus : (['full_body'] as MuscleGroup[]);
          const overridden =
            s.sessionMinutes !== null || s.physioMinutes !== null || s.physioPosition !== 0;
          const timeBudget: TimeBudget | undefined = overridden
            ? {
                sessionMinutes: s.sessionMinutes ?? this.sessionMinutes,
                warmupMinutes: this.warmupMinutes,
                cooldownMinutes: this.cooldownMinutes,
                physioMinutes: s.physioMinutes ?? this.physioMinutes,
                physioPosition: s.physioPosition,
              }
            : undefined;
          return { kind: 'training', focus, ...(timeBudget === undefined ? {} : { timeBudget }) };
        }),
      }),
    );
  }

  private async onGenerate(): Promise<void> {
    if (this.equipment.length === 0) {
      this.error = 'Pick at least one piece of equipment.';
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      const { plan } = await api.createPlan({
        goal: this.goal,
        experience: this.experience,
        equipment: this.equipment,
        timeBudget: {
          sessionMinutes: this.sessionMinutes,
          warmupMinutes: this.warmupMinutes,
          cooldownMinutes: this.cooldownMinutes,
          physioMinutes: this.physioMinutes,
          physioPosition: 0,
        },
        days: this.buildRequest(),
        variation: this.variation,
        seed: Math.floor(Math.random() * 0x7fffffff),
      });
      this.plan = plan;
      this.progress = {};
      this.dayVolume = {};
      this.weekVolume = null;
      this.slotState = {};
      this.selectedDayId = null;
      this.view = 'week';
    } catch (err) {
      this.error = err instanceof ApiError ? err.message : 'Could not generate a plan.';
    } finally {
      this.busy = false;
    }
  }

  /** Seed per-slot tracker state for a day (recent set, options, set rows). */
  private initSlotState(day: PlanDay): void {
    const next: Record<string, SlotUiState> = { ...this.slotState };
    const blocks = day.sessions.flatMap((s) => (s.kind === 'training' ? s.blocks : []));
    for (const block of blocks) {
      for (const slot of block.slots) {
        if (next[slot.id] !== undefined) continue;
        const recent = readRecent(slot.exerciseSlug);
        const pyramid = slot.pyramid ?? false;
        const warmups = defaultWarmups(slot);
        const recentWeight = recent?.weight ?? null;
        const recentReps = recent?.reps ?? null;
        next[slot.id] = {
          recentWeight,
          recentReps,
          pyramid,
          warmups,
          sets: buildSetRows(slot, this.goalForDay(), recentWeight, recentReps, pyramid, warmups),
        };
      }
    }
    this.slotState = next;
  }

  /** The current plan's goal, defaulting to the form goal before a plan exists. */
  private goalForDay(): Goal {
    return this.plan?.goal ?? this.goal;
  }

  private openTracker(dayId: string): void {
    this.selectedDayId = dayId;
    const day = this.plan?.days.find((d) => d.id === dayId);
    if (day !== undefined) {
      this.initSlotState(day);
      this.initExternalState(day);
    }
    void this.refreshProgress(dayId);
  }

  /** Hydrate the reactive external-session state for a day from localStorage. */
  private initExternalState(day: PlanDay): void {
    const next: Record<string, ExternalLog> = { ...this.externalState };
    for (const s of day.sessions) {
      if (s.kind === 'external' && next[s.id] === undefined) next[s.id] = readExternal(s.id);
    }
    this.externalState = next;
  }

  /** The tracked state for an external session (reactive copy, falling back to storage). */
  private externalLog(sessionId: string): ExternalLog {
    return this.externalState[sessionId] ?? readExternal(sessionId);
  }

  /** Persist + reactively update an external session's tracked state. */
  private setExternal(sessionId: string, log: ExternalLog): void {
    writeExternal(sessionId, log);
    this.externalState = { ...this.externalState, [sessionId]: log };
  }

  private toggleExternalDone(session: ExternalSession): void {
    const cur = this.externalLog(session.id);
    this.setExternal(session.id, {
      done: !cur.done,
      actualMinutes:
        !cur.done && cur.actualMinutes === null ? session.plannedMinutes : cur.actualMinutes,
    });
  }

  private setExternalMinutes(sessionId: string, raw: string): void {
    const cur = this.externalLog(sessionId);
    this.setExternal(sessionId, { ...cur, actualMinutes: raw === '' ? null : Number(raw) });
  }

  private closeTracker(): void {
    this.selectedDayId = null;
  }

  private async refreshProgress(dayId: string): Promise<void> {
    if (this.plan === null) return;
    try {
      const { progress, volume } = await api.getDayProgress(this.plan.id, dayId);
      this.progress = { ...this.progress, [dayId]: progress };
      this.dayVolume = { ...this.dayVolume, [dayId]: volume };
    } catch {
      /* leave previous progress in place */
    }
    void this.refreshWeekVolume();
  }

  private async refreshWeekVolume(): Promise<void> {
    if (this.plan === null) return;
    try {
      const { volume } = await api.getWeekVolume(this.plan.id);
      this.weekVolume = volume;
    } catch {
      /* leave previous week volume in place */
    }
  }

  // -------------------------------------------------------------------------
  // Plan editing: swap / add / remove an exercise (no regeneration).
  // -------------------------------------------------------------------------

  /** Open the exercise picker to swap the exercise in `slotId`. */
  private openSwap(dayId: string, slotId: string): void {
    this.picker = { mode: 'swap', dayId, slotId };
    this.pickerSearch = '';
    this.pickerError = null;
  }

  /** Open the exercise picker to add an extra exercise to a training session. */
  private openAdd(dayId: string, sessionId: string): void {
    this.picker = { mode: 'add', dayId, sessionId };
    this.pickerSearch = '';
    this.pickerError = null;
  }

  private closePicker(): void {
    this.picker = null;
    this.pickerBusy = false;
    this.pickerError = null;
  }

  /** Apply a plan returned by an edit endpoint, refreshing derived state. */
  private applyEditedPlan(plan: WeeklyPlan): void {
    this.plan = plan;
    const open = this.selectedDayId;
    if (open !== null) {
      const day = plan.days.find((d) => d.id === open);
      if (day !== undefined) this.initSlotState(day);
      void this.refreshProgress(open);
    } else {
      void this.refreshWeekVolume();
    }
  }

  /** Resolve the picker's chosen exercise and call the matching edit endpoint. */
  private async chooseExercise(ref: ExerciseRef): Promise<void> {
    const picker = this.picker;
    if (picker === null || this.plan === null) return;
    this.pickerBusy = true;
    this.pickerError = null;
    try {
      const { plan } =
        picker.mode === 'swap'
          ? await api.swapSlot(this.plan.id, picker.dayId, picker.slotId as string, ref)
          : await api.addSlot(this.plan.id, picker.dayId, picker.sessionId as string, ref);
      this.applyEditedPlan(plan);
      this.closePicker();
    } catch (err) {
      this.pickerError = err instanceof ApiError ? err.message : 'Could not update the plan.';
      this.pickerBusy = false;
    }
  }

  /** Remove an exercise slot from a day (after a confirm). */
  private async onRemoveSlot(dayId: string, slotId: string): Promise<void> {
    if (this.plan === null) return;
    try {
      const { plan } = await api.removeSlot(this.plan.id, dayId, slotId);
      this.applyEditedPlan(plan);
    } catch (err) {
      this.error = err instanceof ApiError ? err.message : 'Could not remove the exercise.';
    }
  }

  // -------------------------------------------------------------------------
  // Custom exercises (per-account; excluded from the global index).
  // -------------------------------------------------------------------------

  private updateCustomForm(patch: Partial<CustomForm>): void {
    this.customForm = { ...this.customForm, ...patch };
  }

  private toggleCustomMuscle(muscle: MuscleGroup): void {
    const has = this.customForm.primaryMuscles.includes(muscle);
    this.updateCustomForm({
      primaryMuscles: has
        ? this.customForm.primaryMuscles.filter((m) => m !== muscle)
        : [...this.customForm.primaryMuscles, muscle],
    });
  }

  private toggleCustomEquipment(item: Equipment): void {
    const has = this.customForm.equipment.includes(item);
    this.updateCustomForm({
      equipment: has
        ? this.customForm.equipment.filter((e) => e !== item)
        : [...this.customForm.equipment, item],
    });
  }

  private async onCreateCustom(): Promise<void> {
    const form = this.customForm;
    if (form.name.trim().length < 2) {
      this.customError = 'Give the exercise a name (at least 2 characters).';
      return;
    }
    if (form.primaryMuscles.length === 0) {
      this.customError = 'Pick at least one primary muscle.';
      return;
    }
    if (form.equipment.length === 0) {
      this.customError = 'Pick at least one piece of equipment.';
      return;
    }
    this.customBusy = true;
    this.customError = null;
    try {
      const { exercise } = await api.createCustomExercise({
        name: form.name.trim(),
        primaryMuscles: form.primaryMuscles,
        equipment: form.equipment,
        role: form.role,
        unilateral: form.unilateral,
        ...(form.cue.trim() === '' ? {} : { cue: form.cue.trim() }),
      });
      this.customExercises = [...this.customExercises, exercise];
      this.customForm = emptyCustomForm();
    } catch (err) {
      this.customError = err instanceof ApiError ? err.message : 'Could not save the exercise.';
    } finally {
      this.customBusy = false;
    }
  }

  private async onDeleteCustom(id: string): Promise<void> {
    try {
      await api.deleteCustomExercise(id);
      this.customExercises = this.customExercises.filter((e) => e.id !== id);
    } catch (err) {
      this.customError = err instanceof ApiError ? err.message : 'Could not delete the exercise.';
    }
  }

  /** Recompute a slot's set rows after its recent set / options change. */
  private rebuildSlot(slot: ExerciseSlot, mutate: (s: SlotUiState) => void): void {
    const current = this.slotState[slot.id];
    if (current === undefined) return;
    const next: SlotUiState = {
      ...current,
      sets: current.sets.map((s) => ({ ...s })),
    };
    mutate(next);
    next.sets = buildSetRows(
      slot,
      this.goalForDay(),
      next.recentWeight,
      next.recentReps,
      next.pyramid,
      next.warmups,
    );
    this.slotState = { ...this.slotState, [slot.id]: next };
  }

  private onRecentInput(
    slot: ExerciseSlot,
    field: 'recentWeight' | 'recentReps',
    raw: string,
  ): void {
    const value = raw === '' ? null : Number(raw);
    this.rebuildSlot(slot, (s) => {
      s[field] = value;
    });
  }

  private onTogglePyramid(slot: ExerciseSlot, on: boolean): void {
    this.rebuildSlot(slot, (s) => {
      s.pyramid = on;
    });
  }

  private onWarmupCount(slot: ExerciseSlot, count: number): void {
    const clamped = Math.max(0, Math.min(4, count));
    this.rebuildSlot(slot, (s) => {
      s.warmups = clamped;
    });
  }

  /** Edit one set row's weight or reps in place (no rebuild). */
  private onSetInput(slotId: string, index: number, field: 'weight' | 'reps', raw: string): void {
    const current = this.slotState[slotId];
    if (current === undefined) return;
    const value = raw === '' ? null : Number(raw);
    const sets = current.sets.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    this.slotState = { ...this.slotState, [slotId]: { ...current, sets } };
  }

  /** Toggle a warm-up row's local "done" tick (warm-ups aren't logged). */
  private onToggleWarmup(slotId: string, index: number): void {
    const current = this.slotState[slotId];
    if (current === undefined) return;
    const sets = current.sets.map((s, i) =>
      i === index ? { ...s, warmupDone: !s.warmupDone } : s,
    );
    this.slotState = { ...this.slotState, [slotId]: { ...current, sets } };
  }

  /**
   * Log the next outstanding working set of a slot, using that row's
   * weight + reps. Working sets are logged in order; the server's
   * `setsLogged` count drives which rows show as done.
   */
  private async onLogSet(dayId: string, slot: ExerciseSlot, workingIndex: number): Promise<void> {
    if (this.plan === null) return;
    const state = this.slotState[slot.id];
    if (state === undefined) return;
    const row = workingRows(state)[workingIndex];
    if (row === undefined) return;
    const loadKg = row.weight ?? 0;
    const reps = row.reps ?? slot.scheme.repsHigh;
    this.busy = true;
    this.error = null;
    try {
      await api.logSet({
        dayId,
        slotId: slot.id,
        exerciseSlug: slot.exerciseSlug,
        setNumber: workingIndex + 1,
        reps,
        loadKg,
      });
      // Remember the heaviest working set as the "recent set" for next time.
      if (loadKg > 0) writeRecent(slot.exerciseSlug, loadKg, reps);
      await this.refreshProgress(dayId);
    } catch (err) {
      this.error = err instanceof ApiError ? err.message : 'Could not save that set.';
    } finally {
      this.busy = false;
    }
  }

  override render(): TemplateResult {
    if (this.authStatus === 'loading') {
      return html`<div class="splash" data-testid="splash">Loading…</div>`;
    }
    if (this.authStatus === 'auth') {
      return this.renderAuth();
    }
    return html`
      ${this.renderHeader()}
      <main class="content">
        ${this.error !== null
          ? html`<div class="banner error" role="alert" data-testid="error">${this.error}</div>`
          : nothing}
        ${this.renderMain()}
      </main>
      ${this.selectedDayId !== null ? this.renderTracker() : nothing}
      ${this.picker !== null ? this.renderPicker() : nothing}
      ${this.showPrivacy ? this.renderPrivacy() : nothing}
    `;
  }

  private renderMain(): TemplateResult {
    if (this.view === 'admin') return this.renderAdmin();
    if (this.view === 'week') return this.renderWeek();
    if (this.view === 'calculator') return this.renderCalculator();
    if (this.view === 'exercises') return this.renderExercises();
    return this.renderGenerator();
  }

  /** Compute the prescription for the current inputs, or null if invalid. */
  private get prescription(): Prescription | null {
    if (!Number.isFinite(this.calcWeight) || this.calcWeight <= 0) return null;
    if (!Number.isInteger(this.calcReps) || this.calcReps < 1) return null;
    return prescribeLoad({ weight: this.calcWeight, reps: this.calcReps, goal: this.calcGoal });
  }

  private renderCalculator(): TemplateResult {
    const rx = this.prescription;
    return html`
      <section class="panel" data-testid="calculator">
        <h1>Load calculator</h1>
        <p class="lede">
          Enter a recent set and your goal. Grindform estimates your one-rep max (Epley) and
          prescribes a working weight, rep range and sets to match.
        </p>

        <div class="grid">
          <label class="field">
            <span>Exercise (optional)</span>
            <input
              type="text"
              data-testid="calc-exercise"
              placeholder="e.g. Back squat"
              .value=${this.calcExercise}
              @input=${(e: Event) => {
                this.calcExercise = (e.target as HTMLInputElement).value;
              }}
            />
          </label>
          <label class="field">
            <span>Weight lifted (kg)</span>
            <input
              type="number"
              inputmode="decimal"
              min="1"
              step="2.5"
              data-testid="calc-weight"
              .value=${String(this.calcWeight)}
              @input=${(e: Event) => {
                this.calcWeight = Number((e.target as HTMLInputElement).value);
              }}
            />
          </label>
          <label class="field">
            <span>Reps completed</span>
            <input
              type="number"
              inputmode="numeric"
              min="1"
              max="30"
              step="1"
              data-testid="calc-reps"
              .value=${String(this.calcReps)}
              @input=${(e: Event) => {
                this.calcReps = Number((e.target as HTMLInputElement).value);
              }}
            />
          </label>
          <label class="field">
            <span>Goal</span>
            <select
              data-testid="calc-goal"
              @change=${(e: Event) => {
                this.calcGoal = (e.target as HTMLSelectElement).value as LoadGoal;
              }}
            >
              ${GOAL_PROFILES.map(
                (p) =>
                  html`<option value=${p.goal} ?selected=${p.goal === this.calcGoal}>
                    ${p.label}
                  </option>`,
              )}
            </select>
          </label>
        </div>

        ${rx === null
          ? html`<p class="blocked-note" data-testid="calc-invalid">
              Enter a positive weight and a whole number of reps (1 or more).
            </p>`
          : html`
              <div class="calc-result" data-testid="calc-result">
                <div class="calc-headline">
                  <span class="calc-label">Estimated 1RM</span>
                  <strong data-testid="calc-onerm">${rx.oneRepMax} kg</strong>
                </div>
                <div class="calc-prescription">
                  <span class="calc-label">
                    ${this.calcExercise.trim() === '' ? 'Working set' : this.calcExercise.trim()}
                  </span>
                  <strong data-testid="calc-prescription">
                    ${rx.sets} × ${rx.repsLow}–${rx.repsHigh} reps @ ${rx.workingWeight} kg
                  </strong>
                  <span class="calc-note" data-testid="calc-intensity">
                    ${rx.intensityPct}% of 1RM
                  </span>
                </div>
              </div>
            `}
      </section>
    `;
  }

  private renderAuth(): TemplateResult {
    const isRegister = this.authMode === 'register';
    return html`
      <div class="auth-wrap" data-testid="auth">
        <section class="auth-card">
          <div class="brand center">
            <span class="logo">◣</span>
            <span class="wordmark">Grind<em>form</em></span>
          </div>
          <h1>${isRegister ? 'Create your account' : 'Welcome back'}</h1>
          <p class="lede">Plan and track your training week.</p>
          ${this.authError !== null
            ? html`<div class="banner error" role="alert" data-testid="auth-error">
                ${this.authError}
              </div>`
            : nothing}
          <form
            @submit=${(e: Event) => {
              e.preventDefault();
              void this.onSubmitAuth();
            }}
          >
            <label class="field">
              <span>Email</span>
              <input
                type="email"
                autocomplete="email"
                data-testid="auth-email"
                .value=${this.authEmail}
                @input=${(e: Event) => {
                  this.authEmail = (e.target as HTMLInputElement).value;
                }}
              />
            </label>
            <label class="field">
              <span>Password</span>
              <input
                type="password"
                autocomplete=${isRegister ? 'new-password' : 'current-password'}
                data-testid="auth-password"
                .value=${this.authPassword}
                @input=${(e: Event) => {
                  this.authPassword = (e.target as HTMLInputElement).value;
                }}
              />
            </label>
            ${isRegister
              ? html`<label class="consent">
                  <input
                    type="checkbox"
                    data-testid="auth-consent"
                    .checked=${this.authConsent}
                    @change=${(e: Event) => {
                      this.authConsent = (e.target as HTMLInputElement).checked;
                    }}
                  />
                  <span
                    >I agree to the
                    <button
                      type="button"
                      class="link"
                      data-testid="open-privacy"
                      @click=${() => {
                        this.showPrivacy = true;
                      }}
                    >
                      privacy terms</button
                    >.</span
                  >
                </label>`
              : nothing}
            <button class="cta" type="submit" data-testid="auth-submit" ?disabled=${this.authBusy}>
              ${this.authBusy ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}
            </button>
          </form>
          <p class="switch">
            ${isRegister ? 'Already have an account?' : 'New to Grindform?'}
            <button
              type="button"
              class="link"
              data-testid="auth-switch"
              @click=${() => {
                this.authMode = isRegister ? 'login' : 'register';
                this.authError = null;
              }}
            >
              ${isRegister ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </section>
        ${this.showPrivacy ? this.renderPrivacy() : nothing}
      </div>
    `;
  }

  private renderPrivacy(): TemplateResult {
    return html`
      <div class="overlay" data-testid="privacy" @click=${this.closePrivacy}>
        <div class="sheet" @click=${(e: Event) => e.stopPropagation()}>
          <header class="sheet-head">
            <h2>Privacy &amp; your data</h2>
            <button class="icon" data-testid="privacy-close" @click=${this.closePrivacy}>✕</button>
          </header>
          <div class="prose">
            <p>
              Grindform stores only what it needs to run your training: your email, a securely
              hashed password, your generated plans, and the sets you log.
            </p>
            <ul>
              <li>Your data is scoped to your account — no one else can see it.</li>
              <li>Export everything as JSON at any time from the account menu.</li>
              <li>Delete your account and all associated data permanently, whenever you like.</li>
              <li>Admin actions on accounts are recorded in an audit log for accountability.</li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  private closePrivacy = (): void => {
    this.showPrivacy = false;
  };

  private renderHeader(): TemplateResult {
    return html`
      <header class="topbar">
        <div class="brand" data-testid="brand">
          <span class="logo">◣</span>
          <span class="wordmark">Grind<em>form</em></span>
        </div>
        ${this.renderNav()} ${this.renderAccountControl()}
      </header>
    `;
  }

  /**
   * The primary views. Rendered inline in the header on wide screens and
   * repositioned by CSS into a fixed bottom tab bar on phones.
   */
  private renderNav(): TemplateResult {
    return html`
      <nav class="nav" data-testid="nav">
        <button
          class=${this.view === 'generate' ? 'tab active' : 'tab'}
          data-testid="nav-generate"
          @click=${() => {
            this.view = 'generate';
          }}
        >
          <span class="tab-icon" aria-hidden="true">${ICON_BUILD}</span>
          <span class="tab-label">Build</span>
        </button>
        <button
          class=${this.view === 'week' ? 'tab active' : 'tab'}
          data-testid="nav-week"
          ?disabled=${this.plan === null}
          @click=${() => {
            if (this.plan !== null) this.view = 'week';
          }}
        >
          <span class="tab-icon" aria-hidden="true">${ICON_WEEK}</span>
          <span class="tab-label">My week</span>
        </button>
        <button
          class=${this.view === 'exercises' ? 'tab active' : 'tab'}
          data-testid="nav-exercises"
          @click=${() => {
            this.view = 'exercises';
          }}
        >
          <span class="tab-icon" aria-hidden="true">${ICON_EXERCISES}</span>
          <span class="tab-label">Exercises</span>
        </button>
        <button
          class=${this.view === 'calculator' ? 'tab active' : 'tab'}
          data-testid="nav-calculator"
          @click=${() => {
            this.view = 'calculator';
          }}
        >
          <span class="tab-icon" aria-hidden="true">${ICON_CALC}</span>
          <span class="tab-label">Load calc</span>
        </button>
      </nav>
    `;
  }

  private renderAccountControl(): TemplateResult {
    const user = this.user;
    if (user === null) return html`${nothing}`;
    return html`
      <div class="account">
        <button
          class="avatar"
          data-testid="account-button"
          aria-haspopup="menu"
          aria-expanded=${this.accountMenuOpen}
          @click=${() => {
            this.accountMenuOpen = !this.accountMenuOpen;
          }}
        >
          ${user.email.charAt(0).toUpperCase()}
        </button>
        ${this.accountMenuOpen
          ? html`<div class="menu" data-testid="account-menu" role="menu">
              <p class="menu-email" data-testid="account-email">${user.email}</p>
              <label class="menu-theme">
                <span>Theme</span>
                <select data-testid="theme-picker" @change=${this.onThemeChange}>
                  ${THEMES.map(
                    (t) =>
                      html`<option value=${t.id} ?selected=${t.id === this.theme}>
                        ${t.label}
                      </option>`,
                  )}
                </select>
              </label>
              <div class="menu-sep" role="separator"></div>
              ${user.role === 'admin'
                ? html`<button
                    class="menu-item"
                    data-testid="open-admin"
                    @click=${() => void this.openAdmin()}
                  >
                    Admin console
                  </button>`
                : nothing}
              <button
                class="menu-item"
                data-testid="open-privacy-menu"
                @click=${() => {
                  this.accountMenuOpen = false;
                  this.showPrivacy = true;
                }}
              >
                Privacy &amp; data
              </button>
              <button
                class="menu-item"
                data-testid="export-data"
                @click=${() => void this.onExport()}
              >
                Export my data
              </button>
              <button
                class="menu-item danger"
                data-testid="delete-account"
                @click=${() => void this.onDeleteAccount()}
              >
                Delete account
              </button>
              <button class="menu-item" data-testid="logout" @click=${() => void this.onLogout()}>
                Log out
              </button>
            </div>`
          : nothing}
      </div>
    `;
  }

  private renderAdmin(): TemplateResult {
    const users = this.adminUsers;
    return html`
      <section class="panel" data-testid="admin">
        <div class="week-head">
          <h1>Admin console</h1>
          <button class="ghost" data-testid="admin-refresh" @click=${() => void this.openAdmin()}>
            Refresh ↻
          </button>
        </div>
        ${this.adminError !== null
          ? html`<div class="banner error" role="alert" data-testid="admin-error">
              ${this.adminError}
            </div>`
          : nothing}
        ${users === null
          ? html`<p>Loading users…</p>`
          : html`
              <div class="table-wrap">
                <table class="admin-table" data-testid="admin-users">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Plans</th>
                      <th>Last login</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    ${users.map(
                      (u) => html`
                        <tr data-testid=${`admin-row-${u.id}`}>
                          <td>${u.email}</td>
                          <td>${u.role}</td>
                          <td>
                            <span class=${u.status === 'active' ? 'pill ok' : 'pill off'}>
                              ${u.status}
                            </span>
                          </td>
                          <td>${u.planCount}</td>
                          <td>${u.lastLoginAt === null ? '—' : u.lastLoginAt.slice(0, 10)}</td>
                          <td>
                            <button
                              class="link"
                              data-testid=${`admin-view-${u.id}`}
                              @click=${() => void this.openAdminUser(u.id)}
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      `,
                    )}
                  </tbody>
                </table>
              </div>
            `}
        ${this.adminDetail !== null ? this.renderAdminDetail(this.adminDetail) : nothing}
      </section>
    `;
  }

  private renderAdminDetail(detail: { user: PublicUser; audit: AuditRow[] }): TemplateResult {
    const u = detail.user;
    return html`
      <div class="admin-detail" data-testid="admin-detail">
        <h2>${u.email}</h2>
        <div class="admin-actions">
          <button
            class="ghost"
            data-testid="admin-toggle-status"
            @click=${() => void this.onAdminToggleStatus(u)}
          >
            ${u.status === 'active' ? 'Disable account' : 'Enable account'}
          </button>
          <button
            class="ghost danger"
            data-testid="admin-delete"
            @click=${() => void this.onAdminDeleteUser(u.id)}
          >
            Delete account
          </button>
        </div>
        <h3>Audit trail</h3>
        <ul class="audit" data-testid="admin-audit">
          ${detail.audit.map(
            (a) =>
              html`<li>
                <code>${a.action}</code>
                <span class="audit-time">${a.createdAt.slice(0, 19).replace('T', ' ')}</span>
              </li>`,
          )}
        </ul>
      </div>
    `;
  }

  private renderGenerator(): TemplateResult {
    return html`
      <section class="panel" data-testid="generator">
        <h1>Plan your week</h1>
        <p class="lede">
          Pick a goal and a weekly shape. Block out days for Pilates or Physio, reserve warm-up,
          cool-down and a first-15-minutes physio slot — Grindform fills in the rest.
        </p>

        <div class="grid">
          <label class="field">
            <span>Goal</span>
            <select
              data-testid="goal"
              @change=${(e: Event) => {
                this.goal = (e.target as HTMLSelectElement).value as Goal;
              }}
            >
              ${GOALS.map(
                (g) =>
                  html`<option value=${g.id} ?selected=${g.id === this.goal}>${g.label}</option>`,
              )}
            </select>
          </label>

          <label class="field">
            <span>Experience</span>
            <select
              data-testid="experience"
              @change=${(e: Event) => {
                this.experience = (e.target as HTMLSelectElement).value as Experience;
              }}
            >
              ${EXPERIENCES.map(
                (x) =>
                  html`<option value=${x} ?selected=${x === this.experience}>
                    ${titleCase(x)}
                  </option>`,
              )}
            </select>
          </label>

          <label class="field">
            <span>Variation</span>
            <select
              data-testid="variation"
              @change=${(e: Event) => {
                this.variation = (e.target as HTMLSelectElement).value as 'A' | 'B';
              }}
            >
              <option value="A" ?selected=${this.variation === 'A'}>A week</option>
              <option value="B" ?selected=${this.variation === 'B'}>B week</option>
            </select>
          </label>
        </div>

        <fieldset class="block">
          <legend>Default time budget (minutes)</legend>
          <p class="hint">
            Applies to every training session unless you override it per session below.
          </p>
          <div class="grid">
            ${this.renderNumber('Session', 'sessionMinutes', this.sessionMinutes, 20, 180)}
            ${this.renderNumber('Warm-up', 'warmupMinutes', this.warmupMinutes, 0, 30)}
            ${this.renderNumber('Cool-down', 'cooldownMinutes', this.cooldownMinutes, 0, 30)}
            ${this.renderNumber('Physio', 'physioMinutes', this.physioMinutes, 0, 30)}
          </div>
        </fieldset>

        <fieldset class="block">
          <legend>Equipment</legend>
          <div class="chips" data-testid="equipment">
            ${EQUIPMENT.map(
              (item) => html`
                <button
                  type="button"
                  class=${this.equipment.includes(item) ? 'chip on' : 'chip'}
                  data-testid=${`equipment-${item}`}
                  aria-pressed=${this.equipment.includes(item)}
                  @click=${() => this.toggleEquipment(item)}
                >
                  ${titleCase(item)}
                </button>
              `,
            )}
          </div>
        </fieldset>

        <fieldset class="block">
          <legend>Your week</legend>
          <div class="days">${this.days.map((d) => this.renderDayConfig(d))}</div>
        </fieldset>

        <button
          class="cta"
          data-testid="generate"
          ?disabled=${this.busy}
          @click=${() => void this.onGenerate()}
        >
          ${this.busy ? 'Generating…' : 'Generate my week'}
        </button>
      </section>
    `;
  }

  private renderNumber(
    label: string,
    key: 'sessionMinutes' | 'warmupMinutes' | 'cooldownMinutes' | 'physioMinutes',
    value: number,
    min: number,
    max: number,
  ): TemplateResult {
    return html`
      <label class="field">
        <span>${label}</span>
        <input
          type="number"
          inputmode="numeric"
          data-testid=${`time-${key}`}
          min=${min}
          max=${max}
          .value=${String(value)}
          @input=${(e: Event) => {
            this[key] = Number((e.target as HTMLInputElement).value);
          }}
        />
      </label>
    `;
  }

  private renderDayConfig(day: DayConfig): TemplateResult {
    return html`
      <div class="day-row" data-testid=${`dayrow-${day.weekday}`}>
        <div class="day-head">
          <strong>${weekdayLabel(day.weekday)}</strong>
          <div class="session-add">
            <button
              type="button"
              class="ghost small"
              data-testid=${`add-training-${day.weekday}`}
              @click=${() => this.addSession(day.weekday, 'training')}
            >
              + Training
            </button>
            <button
              type="button"
              class="ghost small"
              data-testid=${`add-external-${day.weekday}`}
              @click=${() => this.addSession(day.weekday, 'external')}
            >
              + Activity
            </button>
          </div>
        </div>
        ${day.sessions.length === 0
          ? html`<p class="blocked-note" data-testid=${`rest-${day.weekday}`}>
              Rest day — no sessions.
            </p>`
          : html`<div class="session-list">
              ${day.sessions.map((s, i) => this.renderSessionConfig(day.weekday, i, s))}
            </div>`}
      </div>
    `;
  }

  private renderSessionConfig(weekday: Weekday, index: number, s: SessionConfig): TemplateResult {
    const removeBtn = html`
      <button
        type="button"
        class="session-remove"
        data-testid=${`remove-session-${weekday}-${index}`}
        aria-label="Remove session"
        @click=${() => this.removeSession(weekday, index)}
      >
        ✕
      </button>
    `;
    if (s.kind === 'external') {
      return html`
        <div class="session-cfg external" data-testid=${`session-${weekday}-${index}`}>
          <div class="session-cfg-head">
            <span class="session-tag ext">Activity</span>
            ${removeBtn}
          </div>
          <div class="grid">
            <label class="field">
              <span>Type</span>
              <select
                data-testid=${`session-activity-${weekday}-${index}`}
                @change=${(e: Event) => {
                  const activity = (e.target as HTMLSelectElement).value as ExternalActivity;
                  this.updateSession(weekday, index, (cur) =>
                    cur.kind === 'external' ? { ...cur, activity } : cur,
                  );
                }}
              >
                ${ACTIVITIES.map(
                  (a) =>
                    html`<option value=${a} ?selected=${s.activity === a}>
                      ${ACTIVITY_LABELS[a]}
                    </option>`,
                )}
              </select>
            </label>
            <label class="field">
              <span>Minutes</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                max="600"
                data-testid=${`session-minutes-${weekday}-${index}`}
                .value=${String(s.plannedMinutes)}
                @input=${(e: Event) => {
                  const plannedMinutes = Number((e.target as HTMLInputElement).value);
                  this.updateSession(weekday, index, (cur) =>
                    cur.kind === 'external' ? { ...cur, plannedMinutes } : cur,
                  );
                }}
              />
            </label>
          </div>
        </div>
      `;
    }
    return html`
      <div class="session-cfg training" data-testid=${`session-${weekday}-${index}`}>
        <div class="session-cfg-head">
          <span class="session-tag">Training</span>
          ${removeBtn}
        </div>
        <div class="chips small" data-testid=${`session-focus-${weekday}-${index}`}>
          ${MUSCLES.map(
            (m) => html`
              <button
                type="button"
                class=${s.focus.includes(m) ? 'chip on' : 'chip'}
                data-testid=${`focus-${weekday}-${index}-${m}`}
                aria-pressed=${s.focus.includes(m)}
                @click=${() => this.toggleSessionFocus(weekday, index, m)}
              >
                ${titleCase(m)}
              </button>
            `,
          )}
        </div>
        <details class="time-override">
          <summary data-testid=${`time-override-${weekday}-${index}`}>Custom time & physio</summary>
          <div class="grid">
            <label class="field">
              <span>Session min</span>
              <input
                type="number"
                inputmode="numeric"
                min="20"
                max="180"
                placeholder=${String(this.sessionMinutes)}
                data-testid=${`override-session-${weekday}-${index}`}
                .value=${s.sessionMinutes === null ? '' : String(s.sessionMinutes)}
                @input=${(e: Event) => {
                  const raw = (e.target as HTMLInputElement).value;
                  const sessionMinutes = raw === '' ? null : Number(raw);
                  this.updateSession(weekday, index, (cur) =>
                    cur.kind === 'training' ? { ...cur, sessionMinutes } : cur,
                  );
                }}
              />
            </label>
            <label class="field">
              <span>Physio min</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                max="30"
                placeholder=${String(this.physioMinutes)}
                data-testid=${`override-physio-${weekday}-${index}`}
                .value=${s.physioMinutes === null ? '' : String(s.physioMinutes)}
                @input=${(e: Event) => {
                  const raw = (e.target as HTMLInputElement).value;
                  const physioMinutes = raw === '' ? null : Number(raw);
                  this.updateSession(weekday, index, (cur) =>
                    cur.kind === 'training' ? { ...cur, physioMinutes } : cur,
                  );
                }}
              />
            </label>
            <label class="field">
              <span>Physio placement</span>
              <select
                data-testid=${`override-physio-pos-${weekday}-${index}`}
                @change=${(e: Event) => {
                  const physioPosition = Number((e.target as HTMLSelectElement).value);
                  this.updateSession(weekday, index, (cur) =>
                    cur.kind === 'training' ? { ...cur, physioPosition } : cur,
                  );
                }}
              >
                ${PHYSIO_POSITIONS.map(
                  (label, pos) =>
                    html`<option value=${pos} ?selected=${s.physioPosition === pos}>
                      ${label}
                    </option>`,
                )}
              </select>
            </label>
          </div>
        </details>
      </div>
    `;
  }

  private renderWeek(): TemplateResult {
    if (this.plan === null) {
      return html`<section class="panel"><p>No plan yet. Build one first.</p></section>`;
    }
    const plan = this.plan;
    return html`
      <section class="panel" data-testid="week">
        <div class="week-head">
          <h1>${titleCase(plan.goal)} · Week ${plan.variation}</h1>
          <button class="ghost" data-testid="rebuild" @click=${() => void this.onGenerate()}>
            Boredom swap ↻
          </button>
        </div>
        <div class="week-grid">${plan.days.map((d) => this.renderDayCard(d))}</div>
        ${this.renderVolumeCard('Week volume', this.weekVolume, 'week-volume')}
      </section>
    `;
  }

  /** A "kg per muscle group" reference card for a day or the week. */
  private renderVolumeCard(
    title: string,
    volume: VolumeSummary | null | undefined,
    testid: string,
  ): TemplateResult {
    if (volume === undefined || volume === null || volume.totalKg === 0) return html`${nothing}`;
    return html`
      <div class="volume" data-testid=${testid}>
        <h3>${title}</h3>
        <p class="volume-total">
          <strong data-testid=${`${testid}-total`}>${volume.totalKg.toLocaleString()} kg</strong>
          total moved
        </p>
        <ul class="volume-list">
          ${volume.perMuscle.map(
            (m) =>
              html`<li>
                <span class="vm-name">${titleCase(m.muscle)}</span>
                <span class="vm-kg">${m.kg.toLocaleString()} kg</span>
              </li>`,
          )}
        </ul>
      </div>
    `;
  }

  private renderDayCard(day: PlanDay): TemplateResult {
    const prog = this.progress[day.id];
    const rest = day.sessions.length === 0;
    const hasTraining = day.sessions.some((s) => s.kind === 'training');
    return html`
      <article class=${rest ? 'card rest' : 'card'} data-testid=${`card-${day.weekday}`}>
        <header class="card-head">
          <h2>${weekdayLabel(day.weekday)}</h2>
          <span class="mins">${day.estMinutes}m</span>
        </header>
        ${rest
          ? html`<p class="activity" data-testid=${`rest-card-${day.weekday}`}>Rest day</p>`
          : html`
              <div class="session-cards" data-testid=${`sessions-${day.weekday}`}>
                ${day.sessions.map((s) =>
                  s.kind === 'training'
                    ? this.renderTrainingSessionCard(day.id, s)
                    : this.renderExternalSessionCard(s),
                )}
              </div>
              ${hasTraining && prog !== undefined
                ? html`<div class="bar" data-testid=${`bar-${day.weekday}`} aria-label="progress">
                    <span style=${`width:${prog.percentComplete}%`}></span>
                  </div>`
                : nothing}
              <button
                class="ghost full"
                data-testid=${`track-${day.weekday}`}
                @click=${() => this.openTracker(day.id)}
              >
                ${hasTraining ? 'Track session' : 'Track activity'}
              </button>
            `}
      </article>
    `;
  }

  /**
   * A single training session on a day card: focus, then each block with its
   * exercises listed inline (name + sets×reps), each editable via swap/remove,
   * plus an "Add exercise" action for the session.
   */
  private renderTrainingSessionCard(dayId: string, s: TrainingSession): TemplateResult {
    return html`
      <div class="session-card training" data-testid=${`session-card-${s.id}`}>
        <p class="focus">${s.focus.map((m) => titleCase(m)).join(' · ')}</p>
        <ul class="blocks">
          ${s.blocks.map((b) => this.renderBlock(dayId, b))}
        </ul>
        <button
          class="add-ex"
          data-testid=${`add-exercise-${s.id}`}
          @click=${() => this.openAdd(dayId, s.id)}
        >
          + Add exercise
        </button>
      </div>
    `;
  }

  /** One block of a session: its title/minutes, then any exercise slots. */
  private renderBlock(dayId: string, b: SessionBlock): TemplateResult {
    return html`
      <li class="block">
        <div class="block-head">
          <span class="btag ${b.type}">${b.title}</span>
          <span class="block-min">${b.estMinutes}m</span>
        </div>
        ${b.slots.length > 0
          ? html`<ul class="slots">
              ${b.slots.map((slot) => this.renderSlotRow(dayId, slot))}
            </ul>`
          : nothing}
      </li>
    `;
  }

  /** One exercise inside a block: name + sets×reps, with swap/remove actions. */
  private renderSlotRow(dayId: string, slot: ExerciseSlot): TemplateResult {
    const custom = slot.exerciseSlug.startsWith('custom-');
    return html`
      <li class="slot-row" data-testid=${`week-slot-${slot.id}`}>
        <div class="slot-info">
          <span class="slot-name">${slot.name}</span>
          ${custom
            ? html`<span class="custom-tag" title="Your custom exercise">custom</span>`
            : nothing}
          ${slot.superset !== undefined
            ? html`<span class="ss-tag">SS ${slot.superset.group}${slot.superset.order}</span>`
            : nothing}
          <span class="slot-scheme">${schemeLabel(slot)}</span>
        </div>
        <div class="slot-actions">
          <button
            class="mini"
            data-testid=${`swap-${slot.id}`}
            title="Swap this exercise"
            @click=${() => this.openSwap(dayId, slot.id)}
          >
            ↻
          </button>
          <button
            class="mini danger"
            data-testid=${`remove-${slot.id}`}
            title="Remove this exercise"
            @click=${() => void this.onRemoveSlot(dayId, slot.id)}
          >
            ✕
          </button>
        </div>
      </li>
    `;
  }

  /** A single external session shown on a day card: activity + planned minutes. */
  private renderExternalSessionCard(s: ExternalSession): TemplateResult {
    const log = this.externalLog(s.id);
    return html`
      <div
        class=${log.done ? 'session-card external done' : 'session-card external'}
        data-testid=${`session-card-${s.id}`}
      >
        <p class="activity">
          <span class="btag physio">${s.label ?? ACTIVITY_LABELS[s.activity]}</span>
          ${s.plannedMinutes}m planned${log.done ? html` · done ✓` : nothing}
        </p>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // Exercises view: the common-workout index + custom exercises.
  // -------------------------------------------------------------------------

  /** Catalog entries matching the Exercises view's search + muscle filter. */
  private get filteredCatalog(): CatalogExercise[] {
    const q = this.exerciseSearch.trim().toLowerCase();
    return this.catalog.filter((e) => {
      const muscleOk =
        this.exerciseMuscle === 'all' || e.primaryMuscles.includes(this.exerciseMuscle);
      const textOk = q === '' || e.name.toLowerCase().includes(q);
      return muscleOk && textOk;
    });
  }

  private renderExercises(): TemplateResult {
    const list = this.filteredCatalog;
    return html`
      <section class="panel" data-testid="exercises">
        <h1>Exercises</h1>
        <p class="lede">
          Browse the ${this.catalog.length}-move common-workout index, or add your own. Custom
          exercises are private to your account and never join the shared index.
        </p>
        <div class="ex-filters">
          <input
            type="search"
            placeholder="Search exercises…"
            data-testid="exercise-search"
            .value=${this.exerciseSearch}
            @input=${(e: Event) => {
              this.exerciseSearch = (e.target as HTMLInputElement).value;
            }}
          />
          <select
            data-testid="exercise-muscle"
            @change=${(e: Event) => {
              this.exerciseMuscle = (e.target as HTMLSelectElement).value as MuscleGroup | 'all';
            }}
          >
            <option value="all">All muscles</option>
            ${MUSCLES.map(
              (m) =>
                html`<option value=${m} ?selected=${this.exerciseMuscle === m}>
                  ${titleCase(m)}
                </option>`,
            )}
          </select>
        </div>

        ${this.customExercises.length > 0
          ? html`
              <h2 class="ex-subhead">Your custom exercises</h2>
              <ul class="ex-list" data-testid="custom-list">
                ${this.customExercises.map((e) => this.renderCustomRow(e))}
              </ul>
            `
          : nothing}

        <h2 class="ex-subhead">Common index (${list.length})</h2>
        <ul class="ex-list" data-testid="catalog-list">
          ${list.length === 0
            ? html`<li class="ex-empty">No exercises match your filter.</li>`
            : list.map((e) => this.renderCatalogRow(e))}
        </ul>

        ${this.renderCustomForm()}
      </section>
    `;
  }

  private renderCatalogRow(e: CatalogExercise): TemplateResult {
    return html`
      <li class="ex-row" data-testid=${`catalog-${e.slug}`}>
        <div class="ex-main">
          <span class="ex-name">${e.name}</span>
          <span class="ex-meta">
            ${e.primaryMuscles.map((m) => titleCase(m)).join(', ')} · ${titleCase(e.role)}
          </span>
        </div>
        <span class="ex-equip">${e.equipment.map((q) => titleCase(q)).join(', ')}</span>
      </li>
    `;
  }

  private renderCustomRow(e: CustomExercise): TemplateResult {
    return html`
      <li class="ex-row custom" data-testid=${`custom-${e.id}`}>
        <div class="ex-main">
          <span class="ex-name">${e.name} <span class="custom-tag">custom</span></span>
          <span class="ex-meta">
            ${e.primaryMuscles.map((m) => titleCase(m)).join(', ')} · ${titleCase(e.role)}
          </span>
        </div>
        <button
          class="mini danger"
          data-testid=${`delete-custom-${e.id}`}
          title="Delete this custom exercise"
          @click=${() => void this.onDeleteCustom(e.id)}
        >
          ✕
        </button>
      </li>
    `;
  }

  /** The form for creating a new custom exercise. */
  private renderCustomForm(): TemplateResult {
    const f = this.customForm;
    return html`
      <div class="custom-form" data-testid="custom-form">
        <h2 class="ex-subhead">Add a custom exercise</h2>
        ${this.customError !== null
          ? html`<div class="banner error" role="alert" data-testid="custom-error">
              ${this.customError}
            </div>`
          : nothing}
        <label class="field">
          <span>Name</span>
          <input
            type="text"
            data-testid="custom-name"
            maxlength="80"
            .value=${f.name}
            @input=${(e: Event) =>
              this.updateCustomForm({ name: (e.target as HTMLInputElement).value })}
          />
        </label>
        <fieldset class="chips">
          <legend>Primary muscles</legend>
          ${MUSCLES.map(
            (m) =>
              html`<button
                type="button"
                class=${f.primaryMuscles.includes(m) ? 'chip on' : 'chip'}
                data-testid=${`custom-muscle-${m}`}
                @click=${() => this.toggleCustomMuscle(m)}
              >
                ${titleCase(m)}
              </button>`,
          )}
        </fieldset>
        <fieldset class="chips">
          <legend>Equipment</legend>
          ${EQUIPMENT.map(
            (item) =>
              html`<button
                type="button"
                class=${f.equipment.includes(item) ? 'chip on' : 'chip'}
                data-testid=${`custom-equip-${item}`}
                @click=${() => this.toggleCustomEquipment(item)}
              >
                ${titleCase(item)}
              </button>`,
          )}
        </fieldset>
        <label class="field">
          <span>Role</span>
          <select
            data-testid="custom-role"
            @change=${(e: Event) =>
              this.updateCustomForm({
                role: (e.target as HTMLSelectElement).value as ExerciseRole,
              })}
          >
            ${EXERCISE_ROLES.map(
              (r) => html`<option value=${r} ?selected=${f.role === r}>${titleCase(r)}</option>`,
            )}
          </select>
        </label>
        <label class="check">
          <input
            type="checkbox"
            data-testid="custom-unilateral"
            .checked=${f.unilateral}
            @change=${(e: Event) =>
              this.updateCustomForm({ unilateral: (e.target as HTMLInputElement).checked })}
          />
          <span>Unilateral (one side at a time)</span>
        </label>
        <label class="field">
          <span>Cue (optional)</span>
          <input
            type="text"
            data-testid="custom-cue"
            maxlength="200"
            .value=${f.cue}
            @input=${(e: Event) =>
              this.updateCustomForm({ cue: (e.target as HTMLInputElement).value })}
          />
        </label>
        <button
          class="primary"
          data-testid="custom-save"
          ?disabled=${this.customBusy}
          @click=${() => void this.onCreateCustom()}
        >
          ${this.customBusy ? 'Saving…' : 'Save exercise'}
        </button>
      </div>
    `;
  }

  // -------------------------------------------------------------------------
  // The swap/add exercise picker overlay.
  // -------------------------------------------------------------------------

  private renderPicker(): TemplateResult {
    const picker = this.picker;
    if (picker === null) return html`${nothing}`;
    const q = this.pickerSearch.trim().toLowerCase();
    const match = (name: string): boolean => q === '' || name.toLowerCase().includes(q);
    const customHits = this.customExercises.filter((e) => match(e.name));
    const catalogHits = this.catalog.filter((e) => match(e.name));
    return html`
      <div class="overlay" data-testid="picker" @click=${() => this.closePicker()}>
        <div class="sheet" @click=${(e: Event) => e.stopPropagation()}>
          <header class="sheet-head">
            <h2>${picker.mode === 'swap' ? 'Swap exercise' : 'Add exercise'}</h2>
            <button class="icon" data-testid="picker-close" @click=${() => this.closePicker()}>
              ✕
            </button>
          </header>
          ${this.pickerError !== null
            ? html`<div class="banner error" role="alert" data-testid="picker-error">
                ${this.pickerError}
              </div>`
            : nothing}
          <input
            type="search"
            class="picker-search"
            placeholder="Search exercises…"
            data-testid="picker-search"
            .value=${this.pickerSearch}
            @input=${(e: Event) => {
              this.pickerSearch = (e.target as HTMLInputElement).value;
            }}
          />
          <div class="picker-list">
            ${customHits.length > 0
              ? html`<p class="picker-group">Your exercises</p>
                  ${customHits.map((e) =>
                    this.renderPickerOption(e.name, true, { source: 'custom', id: e.id }),
                  )}`
              : nothing}
            <p class="picker-group">Common index</p>
            ${catalogHits.length === 0
              ? html`<p class="ex-empty">No matches.</p>`
              : catalogHits.map((e) =>
                  this.renderPickerOption(e.name, false, { source: 'catalog', slug: e.slug }),
                )}
          </div>
        </div>
      </div>
    `;
  }

  private renderPickerOption(name: string, custom: boolean, ref: ExerciseRef): TemplateResult {
    const key = ref.source === 'custom' ? ref.id : ref.slug;
    return html`
      <button
        class="picker-option"
        data-testid=${`pick-${key}`}
        ?disabled=${this.pickerBusy}
        @click=${() => void this.chooseExercise(ref)}
      >
        <span>${name}</span>
        ${custom ? html`<span class="custom-tag">custom</span>` : nothing}
      </button>
    `;
  }

  private renderTracker(): TemplateResult {
    const plan = this.plan;
    const day = plan?.days.find((d) => d.id === this.selectedDayId);
    if (plan === undefined || plan === null || day === undefined) return html`${nothing}`;
    const prog = this.progress[day.id];
    const hasTraining = day.sessions.some((s) => s.kind === 'training');
    return html`
      <div class="overlay" data-testid="tracker" @click=${this.onOverlayClick}>
        <div class="sheet" @click=${(e: Event) => e.stopPropagation()}>
          <header class="sheet-head">
            <h2>${weekdayLabel(day.weekday)} session</h2>
            <button class="icon" data-testid="tracker-close" @click=${this.closeTracker}>✕</button>
          </header>
          ${hasTraining && prog !== undefined
            ? html`<div class="bar big" data-testid="tracker-bar">
                  <span style=${`width:${prog.percentComplete}%`}></span>
                </div>
                <p class="pct" data-testid="tracker-pct">${prog.percentComplete}% complete</p>`
            : nothing}
          <div class="track-list">
            ${day.sessions.map((s, i) => this.renderTrackSession(day.id, s, i))}
          </div>
          ${this.renderVolumeCard('Today’s volume', this.dayVolume[day.id], 'day-volume')}
          ${this.renderVolumeCard('Week volume so far', this.weekVolume, 'tracker-week-volume')}
        </div>
      </div>
    `;
  }

  /** Render one session inside the tracker: training blocks or an external log. */
  private renderTrackSession(
    dayId: string,
    s: TrainingSession | ExternalSession,
    index: number,
  ): TemplateResult {
    if (s.kind === 'external') {
      const log = this.externalLog(s.id);
      return html`
        <div class="track-session external" data-testid=${`track-session-${s.id}`}>
          <h3>${s.label ?? ACTIVITY_LABELS[s.activity]} · ${s.plannedMinutes}m planned</h3>
          <div class="ext-track">
            <label class="field">
              <span>Actual minutes</span>
              <input
                type="number"
                inputmode="numeric"
                min="0"
                max="600"
                data-testid=${`ext-minutes-${s.id}`}
                .value=${log.actualMinutes === null ? '' : String(log.actualMinutes)}
                @input=${(e: Event) =>
                  this.setExternalMinutes(s.id, (e.target as HTMLInputElement).value)}
              />
            </label>
            <button
              class=${log.done ? 'cta done' : 'cta'}
              data-testid=${`ext-done-${s.id}`}
              @click=${() => this.toggleExternalDone(s)}
            >
              ${log.done ? 'Done ✓' : 'Mark done'}
            </button>
          </div>
        </div>
      `;
    }
    const heading =
      s.label ?? `Session ${index + 1} · ${s.focus.map((m) => titleCase(m)).join(' · ')}`;
    return html`
      <div class="track-session training" data-testid=${`track-session-${s.id}`}>
        <h3 class="session-heading">${heading}</h3>
        ${s.blocks.map((b) => this.renderTrackBlock(dayId, b))}
      </div>
    `;
  }

  private renderTrackBlock(dayId: string, block: SessionBlock): TemplateResult {
    if (block.slots.length === 0) {
      return html`<div class="track-block">
        <h3>${block.title}</h3>
        ${block.note !== undefined ? html`<p class="note">${block.note}</p>` : nothing}
      </div>`;
    }
    return html`
      <div class="track-block">
        <h3>${block.title}</h3>
        ${block.slots.map((slot) => this.renderTrackSlot(dayId, slot))}
      </div>
    `;
  }

  /** One exercise in the tracker: recent set, options, and per-set rows. */
  private renderTrackSlot(dayId: string, slot: ExerciseSlot): TemplateResult {
    const state = this.slotState[slot.id];
    if (state === undefined) return html`${nothing}`;
    const sp = this.progress[dayId]?.slots.find((s) => s.slotId === slot.id);
    const loggedWorking = sp?.setsLogged ?? 0;
    const done = sp?.complete ?? false;
    const ss = slot.superset;
    let workingSeen = -1;
    return html`
      <div class=${done ? 'slot done' : 'slot'} data-testid=${`slot-${slot.id}`}>
        <div class="slot-name">
          <strong>${slot.name}</strong>
          ${ss !== undefined
            ? html`<span class="superset" data-testid=${`superset-${slot.id}`}
                >Superset ${ss.group}${ss.order} · back-to-back</span
              >`
            : nothing}
          <small
            >${slot.scheme.sets}×${slot.scheme.repsLow}-${slot.scheme.repsHigh}${slot.scheme.perSide
              ? '/side'
              : ''}</small
          >
        </div>

        <div class="slot-recent">
          <label
            >Recent set
            <input
              type="number"
              inputmode="decimal"
              placeholder="kg"
              .value=${state.recentWeight === null ? '' : String(state.recentWeight)}
              data-testid=${`recent-weight-${slot.id}`}
              @input=${(e: Event) =>
                this.onRecentInput(slot, 'recentWeight', (e.target as HTMLInputElement).value)}
          /></label>
          <span class="times">×</span>
          <label
            ><span class="sr-only">recent reps</span>
            <input
              type="number"
              inputmode="numeric"
              placeholder="reps"
              .value=${state.recentReps === null ? '' : String(state.recentReps)}
              data-testid=${`recent-reps-${slot.id}`}
              @input=${(e: Event) =>
                this.onRecentInput(slot, 'recentReps', (e.target as HTMLInputElement).value)}
          /></label>
          ${this.renderEstimate(state)}
        </div>

        <div class="slot-opts">
          <label class="opt"
            ><input
              type="checkbox"
              ?checked=${state.pyramid}
              data-testid=${`pyramid-${slot.id}`}
              @change=${(e: Event) =>
                this.onTogglePyramid(slot, (e.target as HTMLInputElement).checked)}
            />Pyramid</label
          >
          <label class="opt"
            >Warm-ups
            <input
              type="number"
              inputmode="numeric"
              min="0"
              max="4"
              .value=${String(state.warmups)}
              data-testid=${`warmups-${slot.id}`}
              @input=${(e: Event) =>
                this.onWarmupCount(slot, Number((e.target as HTMLInputElement).value))}
          /></label>
        </div>

        <ol class="set-rows">
          ${state.sets.map((row, index) => {
            if (row.kind === 'working') workingSeen += 1;
            const workingIndex = workingSeen;
            return this.renderSetRow(dayId, slot, row, index, workingIndex, loggedWorking);
          })}
        </ol>
      </div>
    `;
  }

  /** A short "1RM ≈ … → … kg" estimate line for the prescribed working load. */
  private renderEstimate(state: SlotUiState): TemplateResult {
    if (state.recentWeight === null || state.recentReps === null) return html`${nothing}`;
    if (state.recentWeight <= 0 || state.recentReps < 1) return html`${nothing}`;
    const orm = Math.round(
      estimateOneRepMax({ weight: state.recentWeight, reps: state.recentReps }),
    );
    return html`<small class="estimate">1RM ≈ ${orm} kg</small>`;
  }

  private renderSetRow(
    dayId: string,
    slot: ExerciseSlot,
    row: EditableSet,
    index: number,
    workingIndex: number,
    loggedWorking: number,
  ): TemplateResult {
    const isWarmup = row.kind === 'warmup';
    const logged = !isWarmup && workingIndex < loggedWorking;
    const isNext = !isWarmup && workingIndex === loggedWorking;
    const label = isWarmup ? 'W' : `Set ${workingIndex + 1}`;
    return html`
      <li class=${logged || (isWarmup && row.warmupDone) ? 'set-row done' : 'set-row'}>
        <span class="set-label ${isWarmup ? 'warmup' : ''}">${label}</span>
        <input
          type="number"
          inputmode="decimal"
          placeholder="kg"
          ?disabled=${logged}
          .value=${row.weight === null ? '' : String(row.weight)}
          data-testid=${`set-weight-${slot.id}-${index}`}
          @input=${(e: Event) =>
            this.onSetInput(slot.id, index, 'weight', (e.target as HTMLInputElement).value)}
        />
        <span class="times">×</span>
        <input
          type="number"
          inputmode="numeric"
          placeholder="reps"
          ?disabled=${logged}
          .value=${row.reps === null ? '' : String(row.reps)}
          data-testid=${`set-reps-${slot.id}-${index}`}
          @input=${(e: Event) =>
            this.onSetInput(slot.id, index, 'reps', (e.target as HTMLInputElement).value)}
        />
        ${isWarmup
          ? html`<button
              class=${row.warmupDone ? 'done-btn on' : 'done-btn'}
              data-testid=${`warmup-done-${slot.id}-${index}`}
              @click=${() => this.onToggleWarmup(slot.id, index)}
            >
              ${row.warmupDone ? '✓' : 'Ready'}
            </button>`
          : html`<button
              class="done-btn"
              data-testid=${`log-set-${slot.id}-${workingIndex}`}
              ?disabled=${this.busy || logged || !isNext}
              @click=${() => void this.onLogSet(dayId, slot, workingIndex)}
            >
              ${logged ? 'Done ✓' : 'Log'}
            </button>`}
      </li>
    `;
  }

  private onOverlayClick = (): void => {
    this.closeTracker();
  };

  static override styles = css`
    :host {
      display: block;
      min-height: 100vh;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    button:focus-visible {
      outline: 2px solid var(--gf-accent);
      outline-offset: 2px;
    }
    .topbar {
      position: sticky;
      top: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      padding-top: calc(12px + env(safe-area-inset-top));
      background: var(--gf-surface);
      border-bottom: 1px solid var(--gf-border);
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--gf-font-script);
      font-weight: 600;
      font-size: 1.3rem;
      letter-spacing: -0.01em;
    }
    .logo {
      color: var(--gf-accent);
    }
    .wordmark {
      font-style: italic;
    }
    .wordmark em {
      font-style: normal;
      color: var(--gf-accent);
    }
    .nav {
      display: flex;
      gap: 6px;
      margin-left: auto;
    }
    .tab {
      appearance: none;
      border: 1px solid transparent;
      background: transparent;
      color: var(--gf-muted);
      font: inherit;
      font-weight: 600;
      padding: 10px 14px;
      min-height: 44px;
      border-radius: var(--gf-radius-sm);
      cursor: pointer;
      transition:
        background var(--gf-speed) var(--gf-ease),
        color var(--gf-speed) var(--gf-ease);
    }
    .tab:hover:not(:disabled) {
      color: var(--gf-text);
      background: var(--gf-hover);
    }
    .tab.active {
      color: var(--gf-text);
      background: var(--gf-surface-2);
      box-shadow: inset 0 0 0 1px var(--gf-border);
    }
    .tab:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .tab-icon {
      display: none;
    }
    .tab-icon svg {
      width: 22px;
      height: 22px;
      display: block;
    }
    .menu-theme select,
    .field select,
    .field input,
    .day-head select {
      font: inherit;
      color: var(--gf-text);
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius-sm);
      padding: 10px 12px;
      min-height: 44px;
      transition:
        border-color var(--gf-speed) var(--gf-ease),
        box-shadow var(--gf-speed) var(--gf-ease);
    }
    .menu-theme select:focus-visible,
    .field select:focus-visible,
    .field input:focus-visible,
    .day-head select:focus-visible,
    .slot-recent input:focus-visible,
    .slot-opts input:focus-visible,
    .set-row input:focus-visible {
      outline: none;
      border-color: var(--gf-accent);
      box-shadow: 0 0 0 3px var(--gf-ring);
    }
    .content {
      max-width: 1080px;
      margin: 0 auto;
      padding: 16px;
      padding-bottom: calc(48px + env(safe-area-inset-bottom));
    }
    .panel {
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius-lg);
      padding: 22px;
      box-shadow: var(--gf-shadow-sm);
    }
    h1 {
      margin: 0 0 6px;
      font-family: var(--gf-font-script);
      font-weight: 600;
      font-size: 1.7rem;
      letter-spacing: -0.015em;
    }
    .lede {
      color: var(--gf-muted);
      margin: 0 0 18px;
      max-width: 60ch;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-weight: 600;
      font-size: 0.9rem;
    }
    .field > span {
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--gf-muted);
    }
    .block {
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 14px;
      margin: 18px 0;
    }
    legend {
      padding: 0 6px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--gf-muted);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      appearance: none;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid var(--gf-border);
      background: var(--gf-surface);
      color: var(--gf-text-soft);
      border-radius: var(--gf-radius-pill);
      padding: 8px 14px;
      min-height: 40px;
      transition:
        background var(--gf-speed) var(--gf-ease),
        color var(--gf-speed) var(--gf-ease),
        border-color var(--gf-speed) var(--gf-ease);
    }
    .chip:hover {
      border-color: var(--gf-accent);
      color: var(--gf-text);
    }
    .chip.on {
      background: var(--gf-accent);
      color: var(--gf-accent-text);
      border-color: var(--gf-accent);
    }
    .chip.on:hover {
      background: var(--gf-accent-2);
      color: var(--gf-accent-text);
    }
    .chips.small .chip {
      font-size: 0.82rem;
      padding: 6px 10px;
      min-height: 36px;
    }
    .days {
      display: grid;
      gap: 12px;
    }
    .day-row {
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 12px;
    }
    .day-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 8px;
    }
    .blocked-note {
      color: var(--gf-muted);
      margin: 4px 0 0;
      font-size: 0.9rem;
    }
    .hint {
      color: var(--gf-muted);
      margin: -4px 0 10px;
      font-size: 0.8rem;
    }
    .session-add {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .ghost.small {
      min-height: 34px;
      padding: 4px 10px;
      font-size: 0.78rem;
    }
    .session-list {
      display: grid;
      gap: 10px;
    }
    .session-cfg {
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius-sm);
      padding: 10px;
      background: var(--gf-surface-2, var(--gf-surface));
    }
    .session-cfg-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 8px;
    }
    .session-tag {
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--gf-accent-text, #fff);
      background: var(--gf-accent);
      border-radius: var(--gf-radius-pill);
      padding: 3px 10px;
    }
    .session-tag.ext {
      background: var(--gf-accent-2, var(--gf-accent));
    }
    .session-remove {
      appearance: none;
      border: 1px solid var(--gf-border);
      background: var(--gf-surface);
      color: var(--gf-muted);
      border-radius: var(--gf-radius-sm);
      cursor: pointer;
      min-height: 32px;
      min-width: 32px;
      font-size: 0.9rem;
      line-height: 1;
    }
    .session-remove:hover {
      border-color: var(--gf-accent);
      color: var(--gf-accent);
    }
    .time-override {
      margin-top: 8px;
    }
    .time-override > summary {
      cursor: pointer;
      font-size: 0.78rem;
      font-weight: 700;
      color: var(--gf-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      list-style: revert;
    }
    .time-override .grid {
      margin-top: 10px;
    }
    .session-cards {
      display: grid;
      gap: 10px;
      margin-bottom: 10px;
    }
    .session-card {
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius-sm);
      padding: 10px;
      background: var(--gf-surface-2, var(--gf-surface));
    }
    .session-card.external.done,
    .session-card.external {
      border-left: 3px solid var(--gf-accent-2, var(--gf-accent));
    }
    .session-card.external.done {
      border-left-color: var(--gf-good, #16a34a);
    }
    .track-session {
      margin-bottom: 8px;
    }
    .track-session > .session-heading {
      margin: 4px 0 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--gf-border);
      font-size: 1rem;
    }
    .ext-track {
      display: flex;
      align-items: flex-end;
      gap: 10px;
      flex-wrap: wrap;
    }
    .ext-track .field {
      flex: 1 1 120px;
    }
    .ext-track .cta {
      flex: 0 0 auto;
    }
    .calc-result {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      margin-top: 18px;
    }
    @media (max-width: 560px) {
      .calc-result {
        grid-template-columns: 1fr;
      }
      /* Phone layout: the header carries only the brand + account avatar (the
         theme picker now lives inside the account menu), and the three primary
         views move into a fixed bottom tab bar that's easy to reach one-handed.
         z-index stays below the tracker/privacy overlay (20) so modals cover it. */
      .nav {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 10;
        margin: 0;
        gap: 2px;
        padding: 6px 8px;
        padding-bottom: calc(6px + env(safe-area-inset-bottom));
        background: var(--gf-surface);
        border-top: 1px solid var(--gf-border);
        box-shadow: 0 -2px 12px rgb(0 0 0 / 8%);
      }
      .nav .tab {
        flex: 1 1 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        min-width: 0;
        min-height: 48px;
        padding: 6px 4px;
        font-size: 0.72rem;
        font-weight: 600;
      }
      .nav .tab.active {
        background: transparent;
        box-shadow: none;
        color: var(--gf-accent);
      }
      .tab-icon {
        display: block;
      }
      /* With the nav moved to the bottom bar, nothing else in the header uses
         margin-left:auto, so anchor the account control to the right edge —
         otherwise its right:0 dropdown opens past the left of the viewport. */
      .account {
        margin-left: auto;
      }
      /* Leave room so the fixed bottom bar never covers page content. */
      .content {
        padding-bottom: calc(84px + env(safe-area-inset-bottom));
      }
      /* The set-row grid already keeps the log button inside the sheet at 430px;
         tighten the gap and label/button tracks so the inputs get more room. */
      .set-row {
        grid-template-columns: 2.25rem minmax(0, 1fr) auto minmax(0, 1fr) 4rem;
        gap: 6px;
      }
    }
    .calc-headline,
    .calc-prescription {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 16px;
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      background: var(--gf-surface-2);
    }
    .calc-prescription {
      border-color: var(--gf-accent);
      background: var(--gf-accent-soft);
    }
    .calc-label {
      color: var(--gf-muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .calc-headline strong {
      font-size: 1.9rem;
      letter-spacing: -0.02em;
    }
    .calc-prescription strong {
      font-size: 1.25rem;
      color: var(--gf-accent);
    }
    .calc-note {
      color: var(--gf-muted);
      font-size: 0.85rem;
    }
    .cta {
      appearance: none;
      width: 100%;
      font: inherit;
      font-weight: 700;
      font-size: 1.02rem;
      cursor: pointer;
      border: none;
      border-radius: var(--gf-radius-sm);
      padding: 16px;
      min-height: 52px;
      background: var(--gf-text);
      color: var(--gf-bg);
      box-shadow: var(--gf-shadow-sm);
      transition:
        transform var(--gf-speed) var(--gf-ease),
        opacity var(--gf-speed) var(--gf-ease),
        box-shadow var(--gf-speed) var(--gf-ease);
    }
    .cta:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: var(--gf-shadow);
    }
    .cta:active:not(:disabled) {
      transform: translateY(0);
    }
    .cta:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .banner.error {
      background: color-mix(in srgb, var(--gf-danger) 18%, var(--gf-surface));
      border: 1px solid var(--gf-danger);
      color: var(--gf-text);
      padding: 12px 14px;
      border-radius: var(--gf-radius);
      margin-bottom: 14px;
    }
    .week-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
      gap: 10px;
    }
    .week-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }
    .card {
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      box-shadow: var(--gf-shadow-sm);
      transition:
        transform var(--gf-speed) var(--gf-ease),
        box-shadow var(--gf-speed) var(--gf-ease);
    }
    .card:hover {
      transform: translateY(-2px);
      box-shadow: var(--gf-shadow);
    }
    .card.blocked {
      opacity: 0.85;
      border-style: dashed;
    }
    .card-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }
    .card-head h2 {
      margin: 0;
      font-family: var(--gf-font-script);
      font-weight: 600;
      font-size: 1.15rem;
      letter-spacing: -0.01em;
    }
    .mins {
      color: var(--gf-muted);
      font-family: var(--gf-font-mono);
      font-size: 0.78rem;
    }
    .activity {
      font-weight: 700;
      color: var(--gf-accent);
      margin: 6px 0;
    }
    .focus {
      color: var(--gf-muted);
      margin: 0;
      font-size: 0.85rem;
    }
    .blocks {
      list-style: none;
      margin: 4px 0;
      padding: 0;
      display: grid;
      gap: 4px;
      font-size: 0.82rem;
    }
    .btag {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 999px;
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      font-weight: 600;
    }
    /* Inline exercises on a day card */
    .block {
      display: grid;
      gap: 3px;
    }
    .block-head {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .block-min {
      color: var(--gf-muted);
      font-size: 0.78rem;
    }
    .slots {
      list-style: none;
      margin: 0 0 2px;
      padding: 0 0 0 2px;
      display: grid;
      gap: 3px;
    }
    .slot-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      min-width: 0;
      padding: 4px 6px;
      border-radius: var(--gf-radius-sm);
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
    }
    .slot-info {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 4px 6px;
      min-width: 0;
    }
    .slot-name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .slot-scheme {
      color: var(--gf-muted);
      font-size: 0.78rem;
      white-space: nowrap;
    }
    .custom-tag {
      font-size: 0.62rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 1px 5px;
      border-radius: 999px;
      color: var(--gf-accent);
      background: var(--gf-accent-soft, var(--gf-hover));
      border: 1px solid var(--gf-accent);
    }
    .ss-tag {
      font-size: 0.66rem;
      font-weight: 700;
      color: var(--gf-muted);
    }
    .slot-actions {
      display: flex;
      gap: 4px;
      flex: none;
    }
    .mini {
      appearance: none;
      font: inherit;
      cursor: pointer;
      width: 30px;
      height: 30px;
      min-width: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--gf-radius-sm);
      background: var(--gf-bg);
      color: var(--gf-text);
      border: 1px solid var(--gf-border);
      line-height: 1;
    }
    .mini:hover {
      background: var(--gf-hover);
    }
    .mini.danger {
      color: var(--gf-danger, #c0322b);
    }
    .add-ex {
      appearance: none;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      align-self: start;
      margin-top: 2px;
      padding: 4px 10px;
      border-radius: 999px;
      background: transparent;
      color: var(--gf-accent);
      border: 1px dashed var(--gf-accent);
    }
    .add-ex:hover {
      background: var(--gf-hover);
    }
    /* Exercises view */
    .ex-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 8px 0 12px;
    }
    .ex-filters input,
    .ex-filters select {
      flex: 1 1 140px;
      min-width: 0;
    }
    .ex-subhead {
      font-size: 0.95rem;
      margin: 16px 0 6px;
    }
    .ex-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 6px;
    }
    .ex-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      min-width: 0;
      padding: 8px 10px;
      border-radius: var(--gf-radius-sm);
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
    }
    .ex-main {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .ex-name {
      font-weight: 600;
      overflow-wrap: anywhere;
    }
    .ex-meta {
      color: var(--gf-muted);
      font-size: 0.78rem;
    }
    .ex-equip {
      color: var(--gf-muted);
      font-size: 0.74rem;
      text-align: right;
      flex: none;
      max-width: 40%;
    }
    .ex-empty {
      color: var(--gf-muted);
      font-size: 0.85rem;
    }
    .custom-form {
      margin-top: 20px;
      padding: 14px;
      border-radius: var(--gf-radius);
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      display: grid;
      gap: 10px;
    }
    .custom-form .field {
      display: grid;
      gap: 4px;
    }
    .custom-form .field > span {
      font-size: 0.82rem;
      font-weight: 600;
    }
    .custom-form .check {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
    }
    /* Picker overlay list */
    .picker-search {
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 10px;
    }
    .picker-list {
      display: grid;
      gap: 4px;
      max-height: 55vh;
      overflow-y: auto;
    }
    .picker-group {
      margin: 8px 0 2px;
      font-size: 0.74rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--gf-muted);
    }
    .picker-option {
      appearance: none;
      font: inherit;
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 44px;
      padding: 8px 12px;
      border-radius: var(--gf-radius-sm);
      background: var(--gf-bg);
      color: var(--gf-text);
      border: 1px solid var(--gf-border);
    }
    .picker-option:hover {
      background: var(--gf-hover);
    }
    .picker-option[disabled] {
      opacity: 0.5;
      cursor: default;
    }
    .bar {
      height: 8px;
      border-radius: 999px;
      background: var(--gf-surface);
      overflow: hidden;
      border: 1px solid var(--gf-border);
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--gf-success);
    }
    .bar.big {
      height: 12px;
    }
    .ghost {
      appearance: none;
      font: inherit;
      font-weight: 600;
      cursor: pointer;
      background: transparent;
      color: var(--gf-text);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius-sm);
      padding: 10px 14px;
      min-height: 44px;
      transition:
        background var(--gf-speed) var(--gf-ease),
        border-color var(--gf-speed) var(--gf-ease),
        transform var(--gf-speed) var(--gf-ease);
    }
    .ghost:hover {
      background: var(--gf-hover);
      border-color: var(--gf-text-soft);
    }
    .ghost:active {
      transform: translateY(1px);
    }
    .ghost.full {
      width: 100%;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(8, 8, 10, 0.5);
      backdrop-filter: blur(3px);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      z-index: 20;
    }
    .sheet {
      background: var(--gf-surface);
      width: min(640px, 100%);
      max-height: 90vh;
      overflow: auto;
      border-radius: var(--gf-radius-lg) var(--gf-radius-lg) 0 0;
      padding: 18px;
      padding-bottom: calc(18px + env(safe-area-inset-bottom));
      box-shadow: var(--gf-shadow-lg);
    }
    @media (min-width: 720px) {
      .overlay {
        align-items: center;
      }
      .sheet {
        border-radius: var(--gf-radius-lg);
      }
    }
    .sheet-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .sheet-head h2 {
      margin: 0;
      font-family: var(--gf-font-script);
      font-weight: 600;
      letter-spacing: -0.01em;
    }
    .icon {
      appearance: none;
      cursor: pointer;
      background: var(--gf-surface-2);
      border: 1px solid var(--gf-border);
      color: var(--gf-text);
      border-radius: var(--gf-radius-pill);
      width: 44px;
      height: 44px;
      font-size: 1rem;
      transition:
        background var(--gf-speed) var(--gf-ease),
        color var(--gf-speed) var(--gf-ease);
    }
    .icon:hover {
      background: var(--gf-hover);
      color: var(--gf-accent);
    }
    .pct {
      color: var(--gf-muted);
      margin: 6px 0 12px;
    }
    .track-block {
      margin-bottom: 16px;
    }
    .track-block h3 {
      margin: 0 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--gf-muted);
    }
    .note {
      color: var(--gf-muted);
      margin: 0;
      font-size: 0.9rem;
    }
    .slot {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      margin-bottom: 10px;
    }
    .slot.done {
      border-color: var(--gf-success);
      background: color-mix(in srgb, var(--gf-success) 12%, var(--gf-surface));
    }
    .slot-name {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .slot-name small {
      color: var(--gf-muted);
    }
    .superset {
      align-self: flex-start;
      font-size: 0.68rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--gf-text);
      background: var(--gf-highlight-soft);
      border: 1px solid var(--gf-highlight);
      border-radius: 999px;
      padding: 2px 8px;
    }
    .slot-recent,
    .slot-opts {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      color: var(--gf-text-soft);
    }
    .slot-recent label,
    .slot-opts label.opt {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .slot-opts .opt input[type='checkbox'] {
      width: 18px;
      height: 18px;
      accent-color: var(--gf-accent);
    }
    .estimate {
      color: var(--gf-muted);
      font-weight: 600;
    }
    .times {
      color: var(--gf-muted);
    }
    .set-rows {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    /* A fixed grid keeps every set row's columns aligned regardless of label,
       value, or button-text width: [label] [kg] [×] [reps] [log]. minmax(0,1fr)
       lets the kg/reps inputs shrink without overflowing the sheet at 430px. */
    .set-row {
      display: grid;
      grid-template-columns: 2.75rem minmax(0, 1fr) auto minmax(0, 1fr) 4.5rem;
      align-items: center;
      gap: 8px;
    }
    .set-row.done {
      opacity: 0.7;
    }
    .set-label {
      justify-self: start;
      font-size: 0.74rem;
      font-weight: 700;
      color: var(--gf-muted);
    }
    .set-label.warmup {
      color: var(--gf-accent-2);
    }
    .set-row .times {
      justify-self: center;
    }
    .set-row .done-btn {
      width: 100%;
    }
    .volume {
      border: 1px solid var(--gf-border);
      border-left: 4px solid var(--gf-highlight);
      border-radius: var(--gf-radius);
      padding: 12px 14px;
      margin-top: 12px;
      background: var(--gf-surface-2);
    }
    .volume h3 {
      margin: 0 0 6px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--gf-accent);
    }
    .volume-total {
      margin: 0 0 8px;
      color: var(--gf-text-soft);
    }
    .volume-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .volume-list li {
      display: flex;
      justify-content: space-between;
      font-size: 0.9rem;
    }
    .vm-kg {
      font-weight: 700;
      color: var(--gf-text);
    }
    .slot-recent input,
    .slot-opts input,
    .set-row input {
      width: 72px;
      font: inherit;
      color: var(--gf-text);
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius-sm);
      padding: 8px;
      min-height: 44px;
      transition:
        border-color var(--gf-speed) var(--gf-ease),
        box-shadow var(--gf-speed) var(--gf-ease);
    }
    .slot-opts input[type='number'] {
      width: 56px;
    }
    /* In the grid the kg/reps inputs fill their tracks instead of a fixed width. */
    .set-row input {
      width: 100%;
      min-width: 0;
    }
    .done-btn {
      appearance: none;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      background: var(--gf-accent);
      color: var(--gf-accent-text);
      border: none;
      border-radius: var(--gf-radius-sm);
      padding: 10px 12px;
      min-height: 44px;
      transition:
        background var(--gf-speed) var(--gf-ease),
        transform var(--gf-speed) var(--gf-ease);
    }
    .done-btn:hover:not(:disabled) {
      background: var(--gf-accent-2);
      transform: translateY(-1px);
    }
    .done-btn:disabled {
      opacity: 0.6;
    }
    .splash {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: var(--gf-muted);
      font-weight: 600;
    }
    .auth-wrap {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }
    .auth-card {
      width: 100%;
      max-width: 420px;
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius-lg);
      padding: 28px;
      box-shadow: var(--gf-shadow-sm);
    }
    .brand.center {
      justify-content: center;
      margin-bottom: 12px;
    }
    .auth-card form {
      display: flex;
      flex-direction: column;
      gap: 14px;
      margin-top: 16px;
    }
    .consent {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      color: var(--gf-muted);
      font-size: 0.92rem;
    }
    .consent input {
      margin-top: 3px;
      width: 18px;
      height: 18px;
    }
    .link {
      appearance: none;
      background: none;
      border: none;
      padding: 0;
      font: inherit;
      color: var(--gf-accent);
      font-weight: 600;
      cursor: pointer;
      text-decoration: underline;
    }
    .switch {
      margin-top: 16px;
      color: var(--gf-muted);
      text-align: center;
    }
    .account {
      position: relative;
    }
    .avatar {
      width: 40px;
      height: 40px;
      min-height: 40px;
      border-radius: 50%;
      border: 1px solid var(--gf-border);
      background: var(--gf-surface-2);
      color: var(--gf-text);
      font-weight: 700;
      cursor: pointer;
    }
    .menu {
      position: absolute;
      right: 0;
      top: calc(100% + 8px);
      z-index: 20;
      min-width: 220px;
      max-width: calc(100vw - 24px);
      background: var(--gf-surface);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius-sm);
      box-shadow: var(--gf-shadow-sm);
      padding: 6px;
      display: flex;
      flex-direction: column;
    }
    .menu-email {
      margin: 4px 10px 8px;
      color: var(--gf-muted);
      font-size: 0.85rem;
      word-break: break-all;
    }
    .menu-theme {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 4px 10px 8px;
    }
    .menu-theme > span {
      text-transform: uppercase;
      letter-spacing: 0.1em;
      font-size: 0.7rem;
      font-weight: 700;
      color: var(--gf-muted);
    }
    .menu-sep {
      height: 1px;
      margin: 4px 6px;
      background: var(--gf-border);
    }
    .menu-item {
      appearance: none;
      text-align: left;
      background: none;
      border: none;
      font: inherit;
      color: var(--gf-text);
      padding: 10px 10px;
      min-height: 44px;
      border-radius: var(--gf-radius-sm);
      cursor: pointer;
    }
    .menu-item:hover {
      background: var(--gf-hover);
    }
    .menu-item.danger,
    .ghost.danger {
      color: #c0392b;
    }
    /* Let the multi-column user table scroll sideways inside its panel rather
       than push the whole page wider than the phone viewport. */
    .table-wrap {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .admin-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 0.92rem;
    }
    .admin-table th,
    .admin-table td {
      white-space: nowrap;
    }
    .admin-table th,
    .admin-table td {
      text-align: left;
      padding: 10px 8px;
      border-bottom: 1px solid var(--gf-border);
    }
    .admin-table th {
      color: var(--gf-muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .pill {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
    }
    .pill.ok {
      background: color-mix(in srgb, var(--gf-accent) 18%, transparent);
      color: var(--gf-accent);
    }
    .pill.off {
      background: color-mix(in srgb, #c0392b 18%, transparent);
      color: #c0392b;
    }
    .admin-detail {
      margin-top: 22px;
      padding-top: 18px;
      border-top: 1px solid var(--gf-border);
    }
    .admin-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin: 10px 0 18px;
    }
    .audit {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .audit li {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 10px;
      background: var(--gf-surface-2);
      border-radius: var(--gf-radius-sm);
    }
    .audit-time {
      color: var(--gf-muted);
      font-size: 0.85rem;
    }
    .prose {
      color: var(--gf-text);
      line-height: 1.55;
    }
    .prose ul {
      padding-left: 20px;
    }
  `;
}

function readInitialTheme(): ThemeId {
  try {
    const saved = localStorage.getItem('gf-theme');
    if (THEMES.some((t) => t.id === saved)) {
      return saved as ThemeId;
    }
  } catch {
    /* ignore */
  }
  return 'pulse';
}

customElements.define('gf-app', GfApp);

declare global {
  interface HTMLElementTagNameMap {
    'gf-app': GfApp;
  }
}
