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

import { css, html, LitElement, nothing } from 'lit';
import type { TemplateResult } from 'lit';

import { GOAL_PROFILES, prescribeLoad } from '@grindform/loadcalc';
import type { LoadGoal, Prescription } from '@grindform/loadcalc';

import * as api from './api.ts';
import { ApiError } from './api.ts';
import type {
  AdminUserRow,
  AuditRow,
  DayActivity,
  DayProgress,
  DaySpecInput,
  Equipment,
  Experience,
  Goal,
  MuscleGroup,
  PlanDay,
  PublicUser,
  ThemeId,
  WeeklyPlan,
  Weekday,
} from './types.ts';

const THEMES: readonly { id: ThemeId; label: string }[] = [
  { id: 'pulse', label: 'Pulse' },
  { id: 'grind', label: 'Grind Mindset' },
  { id: 'girlypop', label: 'Girly Pop' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'midnight', label: 'Midnight' },
];

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

const WEEKDAYS: readonly { id: Weekday; label: string }[] = [
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
  { id: 'sun', label: 'Sunday' },
];

const ACTIVITIES: readonly DayActivity[] = ['rest', 'pilates', 'physio', 'steps', 'custom'];

/** A day's editable configuration in the generator form. */
interface DayConfig {
  weekday: Weekday;
  /** Either a generated training day, or a blocked preplanned activity. */
  mode: 'train' | DayActivity;
  focus: MuscleGroup[];
}

const DEFAULT_DAYS: readonly DayConfig[] = [
  { weekday: 'mon', mode: 'train', focus: ['glutes', 'hamstrings'] },
  { weekday: 'tue', mode: 'train', focus: ['back', 'biceps'] },
  { weekday: 'wed', mode: 'pilates', focus: [] },
  { weekday: 'thu', mode: 'train', focus: ['quads', 'shoulders'] },
  { weekday: 'fri', mode: 'train', focus: ['chest', 'triceps'] },
  { weekday: 'sat', mode: 'train', focus: ['glutes', 'core'] },
  { weekday: 'sun', mode: 'rest', focus: [] },
];

const titleCase = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ');

const weekdayLabel = (w: Weekday): string => WEEKDAYS.find((d) => d.id === w)?.label ?? w;

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
    busy: { state: true },
    error: { state: true },
    calcExercise: { state: true },
    calcWeight: { state: true },
    calcReps: { state: true },
    calcGoal: { state: true },
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
  declare view: 'generate' | 'week' | 'admin' | 'calculator';
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
  declare busy: boolean;
  declare error: string | null;
  /** Load-calculator inputs (client-side only; never persisted). */
  declare calcExercise: string;
  declare calcWeight: number;
  declare calcReps: number;
  declare calcGoal: LoadGoal;

  /** Transient per-slot tracker inputs; not reactive (read on submit). */
  private slotInputs: Record<string, { loadKg?: number; reps?: number }> = {};

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
    this.days = DEFAULT_DAYS.map((d) => ({ ...d, focus: [...d.focus] }));
    this.plan = null;
    this.selectedDayId = null;
    this.progress = {};
    this.busy = false;
    this.error = null;
    this.calcExercise = '';
    this.calcWeight = 60;
    this.calcReps = 8;
    this.calcGoal = 'hypertrophy';
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
    this.selectedDayId = null;
    this.accountMenuOpen = false;
    this.adminUsers = null;
    this.adminDetail = null;
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

  private setDayMode(weekday: Weekday, mode: 'train' | DayActivity): void {
    this.days = this.days.map((d) => (d.weekday === weekday ? { ...d, mode } : d));
  }

  private toggleFocus(weekday: Weekday, muscle: MuscleGroup): void {
    this.days = this.days.map((d) => {
      if (d.weekday !== weekday) return d;
      const focus = d.focus.includes(muscle)
        ? d.focus.filter((m) => m !== muscle)
        : [...d.focus, muscle];
      return { ...d, focus };
    });
  }

  private buildRequest(): DaySpecInput[] {
    return this.days.map((d): DaySpecInput => {
      if (d.mode === 'train') {
        const focus = d.focus.length > 0 ? d.focus : (['full_body'] as MuscleGroup[]);
        return { weekday: d.weekday, focus };
      }
      return { weekday: d.weekday, activity: d.mode, label: titleCase(d.mode) };
    });
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
        },
        days: this.buildRequest(),
        variation: this.variation,
        seed: Math.floor(Math.random() * 0x7fffffff),
      });
      this.plan = plan;
      this.progress = {};
      this.selectedDayId = null;
      this.view = 'week';
    } catch (err) {
      this.error = err instanceof ApiError ? err.message : 'Could not generate a plan.';
    } finally {
      this.busy = false;
    }
  }

  private openTracker(dayId: string): void {
    this.selectedDayId = dayId;
    void this.refreshProgress(dayId);
  }

  private closeTracker(): void {
    this.selectedDayId = null;
  }

  private async refreshProgress(dayId: string): Promise<void> {
    if (this.plan === null) return;
    try {
      const { progress } = await api.getDayProgress(this.plan.id, dayId);
      this.progress = { ...this.progress, [dayId]: progress };
    } catch {
      /* leave previous progress in place */
    }
  }

  private onSlotInput(slotId: string, field: 'loadKg' | 'reps', value: string): void {
    const current = this.slotInputs[slotId] ?? {};
    const parsed = value === '' ? undefined : Number(value);
    this.slotInputs = { ...this.slotInputs, [slotId]: { ...current, [field]: parsed } };
  }

  private async onCompleteSlot(dayId: string, slotId: string): Promise<void> {
    if (this.plan === null) return;
    const input = this.slotInputs[slotId] ?? {};
    this.busy = true;
    this.error = null;
    try {
      const { progress } = await api.completeSlot(this.plan.id, dayId, slotId, {
        loadKg: input.loadKg ?? 0,
        ...(input.reps === undefined ? {} : { reps: input.reps }),
      });
      this.progress = { ...this.progress, [dayId]: progress };
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
      ${this.showPrivacy ? this.renderPrivacy() : nothing}
    `;
  }

  private renderMain(): TemplateResult {
    if (this.view === 'admin') return this.renderAdmin();
    if (this.view === 'week') return this.renderWeek();
    if (this.view === 'calculator') return this.renderCalculator();
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
        <nav class="nav">
          <button
            class=${this.view === 'generate' ? 'tab active' : 'tab'}
            data-testid="nav-generate"
            @click=${() => {
              this.view = 'generate';
            }}
          >
            Build
          </button>
          <button
            class=${this.view === 'week' ? 'tab active' : 'tab'}
            data-testid="nav-week"
            ?disabled=${this.plan === null}
            @click=${() => {
              if (this.plan !== null) this.view = 'week';
            }}
          >
            My week
          </button>
          <button
            class=${this.view === 'calculator' ? 'tab active' : 'tab'}
            data-testid="nav-calculator"
            @click=${() => {
              this.view = 'calculator';
            }}
          >
            Load calc
          </button>
        </nav>
        <label class="theme">
          <span class="sr-only">Theme</span>
          <select data-testid="theme-picker" @change=${this.onThemeChange}>
            ${THEMES.map(
              (t) =>
                html`<option value=${t.id} ?selected=${t.id === this.theme}>${t.label}</option>`,
            )}
          </select>
        </label>
        ${this.renderAccountControl()}
      </header>
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
          <legend>Time budget (minutes)</legend>
          <div class="grid">
            ${this.renderNumber('Session', 'sessionMinutes', this.sessionMinutes, 20, 180)}
            ${this.renderNumber('Warm-up', 'warmupMinutes', this.warmupMinutes, 0, 30)}
            ${this.renderNumber('Cool-down', 'cooldownMinutes', this.cooldownMinutes, 0, 30)}
            ${this.renderNumber('Physio (first block)', 'physioMinutes', this.physioMinutes, 0, 30)}
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
          <select
            data-testid=${`day-mode-${day.weekday}`}
            @change=${(e: Event) =>
              this.setDayMode(
                day.weekday,
                (e.target as HTMLSelectElement).value as 'train' | DayActivity,
              )}
          >
            <option value="train" ?selected=${day.mode === 'train'}>Training</option>
            ${ACTIVITIES.map(
              (a) => html`<option value=${a} ?selected=${day.mode === a}>${titleCase(a)}</option>`,
            )}
          </select>
        </div>
        ${day.mode === 'train'
          ? html`
              <div class="chips small" data-testid=${`day-focus-${day.weekday}`}>
                ${MUSCLES.map(
                  (m) => html`
                    <button
                      type="button"
                      class=${day.focus.includes(m) ? 'chip on' : 'chip'}
                      data-testid=${`focus-${day.weekday}-${m}`}
                      aria-pressed=${day.focus.includes(m)}
                      @click=${() => this.toggleFocus(day.weekday, m)}
                    >
                      ${titleCase(m)}
                    </button>
                  `,
                )}
              </div>
            `
          : html`<p class="blocked-note">
              Blocked for ${titleCase(day.mode)} — no lifting generated.
            </p>`}
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
      </section>
    `;
  }

  private renderDayCard(day: PlanDay): TemplateResult {
    const prog = this.progress[day.id];
    const blocked = day.activity !== undefined;
    return html`
      <article class=${blocked ? 'card blocked' : 'card'} data-testid=${`card-${day.weekday}`}>
        <header class="card-head">
          <h2>${weekdayLabel(day.weekday)}</h2>
          <span class="mins">${day.estMinutes}m</span>
        </header>
        ${blocked
          ? html`<p class="activity" data-testid=${`activity-${day.weekday}`}>
              ${day.label ?? titleCase(day.activity ?? 'rest')}
            </p>`
          : html`
              <p class="focus">${day.focus.map((m) => titleCase(m)).join(' · ')}</p>
              <ul class="blocks">
                ${day.blocks.map(
                  (b) =>
                    html`<li><span class="btag ${b.type}">${b.title}</span> ${b.estMinutes}m</li>`,
                )}
              </ul>
              ${prog !== undefined
                ? html`<div class="bar" data-testid=${`bar-${day.weekday}`} aria-label="progress">
                    <span style=${`width:${prog.percentComplete}%`}></span>
                  </div>`
                : nothing}
              <button
                class="ghost full"
                data-testid=${`track-${day.weekday}`}
                @click=${() => this.openTracker(day.id)}
              >
                Track session
              </button>
            `}
      </article>
    `;
  }

  private renderTracker(): TemplateResult {
    const plan = this.plan;
    const day = plan?.days.find((d) => d.id === this.selectedDayId);
    if (plan === undefined || plan === null || day === undefined) return html`${nothing}`;
    const prog = this.progress[day.id];
    return html`
      <div class="overlay" data-testid="tracker" @click=${this.onOverlayClick}>
        <div class="sheet" @click=${(e: Event) => e.stopPropagation()}>
          <header class="sheet-head">
            <h2>${weekdayLabel(day.weekday)} session</h2>
            <button class="icon" data-testid="tracker-close" @click=${this.closeTracker}>✕</button>
          </header>
          ${prog !== undefined
            ? html`<div class="bar big" data-testid="tracker-bar">
                  <span style=${`width:${prog.percentComplete}%`}></span>
                </div>
                <p class="pct" data-testid="tracker-pct">${prog.percentComplete}% complete</p>`
            : nothing}
          <div class="track-list">${day.blocks.map((b) => this.renderTrackBlock(day.id, b))}</div>
        </div>
      </div>
    `;
  }

  private renderTrackBlock(dayId: string, block: PlanDay['blocks'][number]): TemplateResult {
    if (block.slots.length === 0) {
      return html`<div class="track-block">
        <h3>${block.title}</h3>
        ${block.note !== undefined ? html`<p class="note">${block.note}</p>` : nothing}
      </div>`;
    }
    const prog = this.progress[dayId];
    return html`
      <div class="track-block">
        <h3>${block.title}</h3>
        ${block.slots.map((slot) => {
          const sp = prog?.slots.find((s) => s.slotId === slot.id);
          const done = sp?.complete ?? false;
          return html`
            <div class=${done ? 'slot done' : 'slot'} data-testid=${`slot-${slot.id}`}>
              <div class="slot-name">
                <strong>${slot.name}</strong>
                <small
                  >${slot.scheme.sets}×${slot.scheme.repsLow}-${slot.scheme.repsHigh}${slot.scheme
                    .perSide
                    ? '/side'
                    : ''}</small
                >
              </div>
              <div class="slot-inputs">
                <input
                  type="number"
                  inputmode="decimal"
                  placeholder="kg"
                  data-testid=${`load-${slot.id}`}
                  @input=${(e: Event) =>
                    this.onSlotInput(slot.id, 'loadKg', (e.target as HTMLInputElement).value)}
                />
                <input
                  type="number"
                  inputmode="numeric"
                  placeholder="reps"
                  data-testid=${`reps-${slot.id}`}
                  @input=${(e: Event) =>
                    this.onSlotInput(slot.id, 'reps', (e.target as HTMLInputElement).value)}
                />
                <button
                  class="done-btn"
                  data-testid=${`complete-${slot.id}`}
                  ?disabled=${this.busy}
                  @click=${() => void this.onCompleteSlot(dayId, slot.id)}
                >
                  ${done ? 'Done ✓' : 'Mark done'}
                </button>
              </div>
            </div>
          `;
        })}
      </div>
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
    .theme select,
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
    .theme select:focus-visible,
    .field select:focus-visible,
    .field input:focus-visible,
    .day-head select:focus-visible,
    .slot-inputs input:focus-visible {
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
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px;
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      margin-bottom: 8px;
    }
    .slot.done {
      border-color: var(--gf-success);
      background: color-mix(in srgb, var(--gf-success) 12%, var(--gf-surface));
    }
    .slot-name {
      display: flex;
      flex-direction: column;
    }
    .slot-name small {
      color: var(--gf-muted);
    }
    .slot-inputs {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .slot-inputs input {
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
    .admin-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      font-size: 0.92rem;
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
