import { pgTable, serial, text, integer, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

// users — replaces the Apps Script Players tab.
export const users = pgTable('users', {
  id:           serial('id').primaryKey(),
  name:         text('name').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt:    timestamp('created_at').defaultNow().notNull(),
});

// leagues — replaces the Config LEAGUE_NAME/LEAGUE_CODE pair.
export const leagues = pgTable('leagues', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  code:      text('code').notNull().unique(),               // e.g. 'WC26-AB12'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// league_members — many-to-many: one user can join multiple leagues.
export const leagueMembers = pgTable('league_members', {
  id:       serial('id').primaryKey(),
  userId:   integer('user_id').notNull().references(() => users.id,    { onDelete: 'cascade' }),
  leagueId: integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (t) => ({
  userLeagueUnique: unique('league_members_user_league').on(t.userId, t.leagueId),
}));

// fixtures — replaces the Fixtures tab.
export const fixtures = pgTable('fixtures', {
  id:        serial('id').primaryKey(),
  phase:     text('phase').notNull().default('group'),      // 'group' | 'knockout'
  groupName: text('group_name'),                            // 'A', 'R16', etc.
  teamA:     text('team_a').notNull(),
  teamB:     text('team_b').notNull(),
  scoreA:    integer('score_a'),
  scoreB:    integer('score_b'),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime:   timestamp('end_time',   { withTimezone: true }),
  firstScorer: text('first_scorer'),
  totalCards:  integer('total_cards'),
});

// bets — one per (user, match, league).
export const bets = pgTable('bets', {
  id:           serial('id').primaryKey(),
  userId:       integer('user_id').notNull().references(() => users.id,    { onDelete: 'cascade' }),
  leagueId:     integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  matchId:      integer('match_id').notNull().references(() => fixtures.id, { onDelete: 'cascade' }),
  q1:           text('q1'),                                 // 'Home Win' | 'Draw' | 'Away Win'
  q2:           text('q2'),                                 // first scorer team or 'No Goal'
  q3:           text('q3'),                                 // '0–1 Goals' | '2–3 Goals' | '4+ Goals'
  q4:           text('q4'),                                 // card band
  wager:         integer('wager').notNull(),
  outcome:       text('outcome').notNull().default('pending'),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userMatchLeagueUnique: unique('bets_user_match_league_unique').on(t.userId, t.matchId, t.leagueId),
}));

// questions — Subsystem B trivia/milestone questions.
export const questions = pgTable('questions', {
  id:            serial('id').primaryKey(),
  phase:         integer('phase').notNull(),
  text:          text('text').notNull(),
  options:       text('options'),
  pointValue:    integer('point_value').notNull(),
  winningAnswer: text('winning_answer'),
  status:        text('status').notNull().default('open'),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
});

// question_phases — single answer window per phase.
export const questionPhases = pgTable('question_phases', {
  phase:     integer('phase').primaryKey(),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime:   timestamp('end_time',   { withTimezone: true }),
});

// question_answers — one per (user, question, league).
export const questionAnswers = pgTable('question_answers', {
  id:            serial('id').primaryKey(),
  userId:        integer('user_id').notNull().references(() => users.id,     { onDelete: 'cascade' }),
  leagueId:      integer('league_id').notNull().references(() => leagues.id,  { onDelete: 'cascade' }),
  questionId:    integer('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  answer:        text('answer').notNull(),
  outcome:       text('outcome').notNull().default('pending'),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userQuestionLeagueUnique: unique('answers_user_question_league_unique').on(t.userId, t.questionId, t.leagueId),
}));

// group_entries — Phase 1 bracket: one row per tournament group.
export const groupEntries = pgTable('group_entries', {
  id:             serial('id').primaryKey(),
  groupName:      text('group_name').notNull().unique(),
  teams:          text('teams').notNull(),
  correctRanking: text('correct_ranking'),
  status:         text('status').notNull().default('open'),
});

// group_picks — one per (user, group, league).
export const groupPicks = pgTable('group_picks', {
  id:            serial('id').primaryKey(),
  userId:        integer('user_id').notNull().references(() => users.id,         { onDelete: 'cascade' }),
  leagueId:      integer('league_id').notNull().references(() => leagues.id,      { onDelete: 'cascade' }),
  groupId:       integer('group_id').notNull().references(() => groupEntries.id,  { onDelete: 'cascade' }),
  ranking:       text('ranking').notNull(),
  pointsAwarded: integer('points_awarded').notNull().default(0),
}, (t) => ({
  userGroupLeagueUnique: unique('group_picks_user_group_league_unique').on(t.userId, t.groupId, t.leagueId),
}));

// bracket_entries — Phase 2 knockout slots.
export const bracketEntries = pgTable('bracket_entries', {
  id:          serial('id').primaryKey(),
  label:       text('label').notNull(),
  teams:       jsonb('teams').$type<string[]>().notNull(),
  correctPick: text('correct_pick'),
  status:      text('status').notNull().default('open'),
  sortOrder:   integer('sort_order').notNull().default(0),
});

// bracket_phases — single submission window per phase.
export const bracketPhases = pgTable('bracket_phases', {
  phase:     integer('phase').primaryKey(),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime:   timestamp('end_time',   { withTimezone: true }),
});

// bailouts — one row per bailout per league.
export const bailouts = pgTable('bailouts', {
  id:             serial('id').primaryKey(),
  userId:         integer('user_id').notNull().references(() => users.id,    { onDelete: 'cascade' }),
  leagueId:       integer('league_id').notNull().references(() => leagues.id, { onDelete: 'cascade' }),
  coinsAwarded:   integer('coins_awarded').notNull().default(100),
  pointsDeducted: integer('points_deducted').notNull().default(10),
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

// bracket_picks — one per (user, entry, league).
export const bracketPicks = pgTable('bracket_picks', {
  id:            serial('id').primaryKey(),
  userId:        integer('user_id').notNull().references(() => users.id,           { onDelete: 'cascade' }),
  leagueId:      integer('league_id').notNull().references(() => leagues.id,        { onDelete: 'cascade' }),
  entryId:       integer('entry_id').notNull().references(() => bracketEntries.id,  { onDelete: 'cascade' }),
  pick:          text('pick').notNull(),
  outcome:       text('outcome').notNull().default('pending'),
  pointsAwarded: integer('points_awarded').notNull().default(0),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userEntryLeagueUnique: unique('bracket_picks_user_entry_league_unique').on(t.userId, t.entryId, t.leagueId),
}));
