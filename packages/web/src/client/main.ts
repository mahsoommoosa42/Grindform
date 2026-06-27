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

import * as api from './api.ts';
import { ApiError } from './api.ts';
import type {
  DayActivity,
  DayProgress,
  DaySpecInput,
  Equipment,
  Experience,
  Goal,
  MuscleGroup,
  PlanDay,
  ThemeId,
  WeeklyPlan,
  Weekday,
} from './types.ts';

const THEMES: readonly { id: ThemeId; label: string }[] = [
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
  };

  declare theme: ThemeId;
  declare view: 'generate' | 'week';
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

  /** Transient per-slot tracker inputs; not reactive (read on submit). */
  private slotInputs: Record<string, { loadKg?: number; reps?: number }> = {};

  constructor() {
    super();
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
  }

  override connectedCallback(): void {
    super.connectedCallback();
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
    return html`
      ${this.renderHeader()}
      <main class="content">
        ${this.error !== null
          ? html`<div class="banner error" role="alert" data-testid="error">${this.error}</div>`
          : nothing}
        ${this.view === 'generate' ? this.renderGenerator() : this.renderWeek()}
      </main>
      ${this.selectedDayId !== null ? this.renderTracker() : nothing}
    `;
  }

  private renderHeader(): TemplateResult {
    return html`
      <header class="topbar">
        <div class="brand" data-testid="brand">
          <span class="logo">◣</span>
          <span>Grindform</span>
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
      </header>
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
      font-weight: 800;
      font-size: 1.15rem;
      letter-spacing: 0.5px;
    }
    .logo {
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
      border-radius: var(--gf-radius);
      cursor: pointer;
    }
    .tab.active {
      color: var(--gf-text);
      background: var(--gf-surface-2);
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
      background: var(--gf-surface-2);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 10px 12px;
      min-height: 44px;
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
      border-radius: var(--gf-radius);
      padding: 20px;
      box-shadow: var(--gf-shadow);
    }
    h1 {
      margin: 0 0 6px;
      font-size: 1.5rem;
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
    .block {
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 14px;
      margin: 18px 0;
    }
    legend {
      padding: 0 6px;
      font-weight: 700;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .chip {
      appearance: none;
      font: inherit;
      cursor: pointer;
      border: 1px solid var(--gf-border);
      background: var(--gf-surface-2);
      color: var(--gf-muted);
      border-radius: 999px;
      padding: 8px 14px;
      min-height: 40px;
    }
    .chip.on {
      background: var(--gf-accent);
      color: var(--gf-accent-text);
      border-color: var(--gf-accent);
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
    .cta {
      appearance: none;
      width: 100%;
      font: inherit;
      font-weight: 800;
      font-size: 1.05rem;
      cursor: pointer;
      border: none;
      border-radius: var(--gf-radius);
      padding: 16px;
      min-height: 52px;
      background: var(--gf-accent);
      color: var(--gf-accent-text);
    }
    .cta:disabled {
      opacity: 0.6;
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
      background: var(--gf-surface-2);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
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
      font-size: 1.05rem;
    }
    .mins {
      color: var(--gf-muted);
      font-size: 0.85rem;
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
      font-weight: 700;
      cursor: pointer;
      background: transparent;
      color: var(--gf-text);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 10px 14px;
      min-height: 44px;
    }
    .ghost.full {
      width: 100%;
    }
    .overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
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
      border-radius: var(--gf-radius) var(--gf-radius) 0 0;
      padding: 18px;
      padding-bottom: calc(18px + env(safe-area-inset-bottom));
    }
    @media (min-width: 720px) {
      .overlay {
        align-items: center;
      }
      .sheet {
        border-radius: var(--gf-radius);
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
    }
    .icon {
      appearance: none;
      cursor: pointer;
      background: var(--gf-surface-2);
      border: 1px solid var(--gf-border);
      color: var(--gf-text);
      border-radius: 999px;
      width: 44px;
      height: 44px;
      font-size: 1rem;
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
      font-size: 1rem;
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
      background: var(--gf-surface-2);
      border: 1px solid var(--gf-border);
      border-radius: var(--gf-radius);
      padding: 8px;
      min-height: 44px;
    }
    .done-btn {
      appearance: none;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      background: var(--gf-accent);
      color: var(--gf-accent-text);
      border: none;
      border-radius: var(--gf-radius);
      padding: 10px 12px;
      min-height: 44px;
    }
    .done-btn:disabled {
      opacity: 0.6;
    }
  `;
}

function readInitialTheme(): ThemeId {
  try {
    const saved = localStorage.getItem('gf-theme');
    if (saved === 'grind' || saved === 'girlypop' || saved === 'minimal' || saved === 'midnight') {
      return saved;
    }
  } catch {
    /* ignore */
  }
  return 'grind';
}

customElements.define('gf-app', GfApp);

declare global {
  interface HTMLElementTagNameMap {
    'gf-app': GfApp;
  }
}
