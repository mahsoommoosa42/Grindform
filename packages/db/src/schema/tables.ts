/**
 * @file packages/db/src/schema/tables.ts
 *
 * Drizzle table definitions (Postgres dialect; runs on PGlite in dev and
 * tests). Branded domain types are attached via `$type<…>()` so a row's
 * `id` is a `PlanId`, not a bare string. JSON-shaped columns (time
 * budget, focus, blocks, preferences) store the planner's value objects
 * verbatim — the plan is generated once and rendered many times.
 */

import { doublePrecision, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import type {
  DayActivity,
  DayId,
  ExerciseSlug,
  Experience,
  Goal,
  LogId,
  MuscleGroup,
  PlanId,
  SlotId,
  ThemeId,
  TimeBudget,
  UserId,
  Weekday,
} from '@grindform/core';
import type { SessionBlock } from '@grindform/planner';

/** A generated weekly plan (its days live in {@link planDays}). */
export const plans = pgTable('plans', {
  id: text('id').primaryKey().$type<PlanId>(),
  userId: text('user_id').notNull().$type<UserId>(),
  goal: text('goal').notNull().$type<Goal>(),
  experience: text('experience').notNull().$type<Experience>(),
  variation: text('variation').notNull().$type<'A' | 'B'>(),
  timeBudget: jsonb('time_budget').notNull().$type<TimeBudget>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One day within a plan — either a training day or a blocked activity. */
export const planDays = pgTable('plan_days', {
  id: text('id').primaryKey().$type<DayId>(),
  planId: text('plan_id')
    .notNull()
    .references(() => plans.id, { onDelete: 'cascade' })
    .$type<PlanId>(),
  position: integer('position').notNull(),
  weekday: text('weekday').notNull().$type<Weekday>(),
  activity: text('activity').$type<DayActivity>(),
  label: text('label'),
  focus: jsonb('focus').notNull().$type<readonly MuscleGroup[]>(),
  blocks: jsonb('blocks').notNull().$type<readonly SessionBlock[]>(),
  estMinutes: integer('est_minutes').notNull(),
});

/** One logged set against a plan day's exercise slot. */
export const setLogs = pgTable('set_logs', {
  id: text('id').primaryKey().$type<LogId>(),
  dayId: text('day_id').notNull().$type<DayId>(),
  slotId: text('slot_id').notNull().$type<SlotId>(),
  exerciseSlug: text('exercise_slug').notNull().$type<ExerciseSlug>(),
  setNumber: integer('set_number').notNull(),
  reps: integer('reps').notNull(),
  loadKg: doublePrecision('load_kg').notNull(),
  rpe: doublePrecision('rpe'),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Per-user app settings (single-user MVP keys on a fixed user id). */
export const settings = pgTable('settings', {
  userId: text('user_id').primaryKey().$type<UserId>(),
  theme: text('theme').notNull().$type<ThemeId>(),
  preferences: jsonb('preferences').notNull().$type<Record<string, unknown>>(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
