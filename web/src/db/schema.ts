import { pgTable, serial, text, integer, timestamp, jsonb, unique } from 'drizzle-orm/pg-core';

// users — replaces the Apps Script Players tab.
export const users = pgTable('users', {
  id:           serial('id').primaryKey(),
  playerId:     text('player_id').notNull().unique(),       // 'player_<name_slug>' for legacy client compat
  name:         text('name').notNull().unique(),
  passwordHash: text('password_hash').notNull(),            // bcrypt
  createdAt:    timestamp('created_at').defaultNow().notNull(),
});

// leagues — replaces the Config LEAGUE_NAME/LEAGUE_CODE pair.
// The most recently created row is "the current league".
export const leagues = pgTable('leagues', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  code:      text('code').notNull().unique(),               // e.g. 'WC26-AB12'
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// fixtures — replaces the Fixtures tab.
export const fixtures = pgTable('fixtures', {
  id:        serial('id').primaryKey(),
  date:      text('date').notNull(),                        // free-form for now, e.g. 'Jun 11'
  phase:     text('phase').notNull().default('group'),      // 'group' | 'knockout'
  groupName: text('group_name'),                            // 'A', 'R16', etc.
  teamA:     text('team_a').notNull(),
  teamB:     text('team_b').notNull(),
  flagA:     text('flag_a').default('⚽'),
  flagB:     text('flag_b').default('⚽'),
  venue:     text('venue'),
  scoreA:    integer('score_a'),
  scoreB:    integer('score_b'),
  // Legacy field — superseded by start/end times + score presence. Kept nullable
  // for DB compat; no code reads it.
  status:    text('status'),
  // Betting window in UTC. Bets are accepted only while now is in [startTime, endTime).
  // Display in the client is converted to the user's local timezone.
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime:   timestamp('end_time',   { withTimezone: true }),
  // Admin-entered "correct answers" for the questions that aren't derivable from the score.
  //   firstScorer: team name that scored first, 'No Goal', or null if not entered.    (Q2)
  //   totalCards:  total yellow+red cards across both teams, or null if not entered.  (Q4)
  // Q1 (result) and Q3 (goals O/U) are still derived from scoreA/scoreB at settle time.
  // A fixture is implicitly "complete" when both scoreA and scoreB are non-null.
  firstScorer: text('first_scorer'),
  totalCards:  integer('total_cards'),
});

// bets — replaces the Predictions tab. One bet per (user, match).
export const bets = pgTable('bets', {
  id:        serial('id').primaryKey(),
  userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  matchId:   integer('match_id').notNull().references(() => fixtures.id, { onDelete: 'cascade' }),
  q1:        text('q1'),                                    // 'Home Win' | 'Draw' | 'Away Win'
  q2:        text('q2'),                                    // first scorer team or 'No Goal'
  q3:        text('q3'),                                    // '0–1 Goals' | '2–3 Goals' | '4+ Goals'
  q4:        text('q4'),                                    // 'Yes' | 'No' (clean sheet)
  wager:         integer('wager').notNull(),
  outcome:       text('outcome').notNull().default('pending'),       // 'pending' | 'win' | 'loss'
  pointsAwarded: integer('points_awarded').notNull().default(0),     // set on settlement: wager + bonus if win, 0 if loss
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userMatchUnique: unique('bets_user_match_unique').on(t.userId, t.matchId),
}));

// questions — Subsystem B trivia/milestone questions.
// Free for players to answer (no wallet cost). Points are dynamic per question.
export const questions = pgTable('questions', {
  id:            serial('id').primaryKey(),
  phase:         integer('phase').notNull(),                            // 1 = group stage, 2 = knockout
  text:          text('text').notNull(),
  options:       jsonb('options').$type<string[] | null>(),             // null = free-text answer
  pointValue:    integer('point_value').notNull(),                      // PRD: parsed per-question, e.g. 5 or 25
  winningAnswer: text('winning_answer'),                                // null until admin settles
  status:        text('status').notNull().default('open'),              // 'open' | 'settled' (open/close is now phase-level)
  createdAt:     timestamp('created_at').defaultNow().notNull(),
});

// question_phases — the single answer window per phase (at most two rows: 1 = group, 2 = knockout).
// Replaces per-question open/locked gating: answers to a phase's questions are accepted only
// while now is within [startTime, endTime), exactly like a match's betting window. Stored in UTC.
export const questionPhases = pgTable('question_phases', {
  phase:     integer('phase').primaryKey(),                 // 1 = group stage, 2 = knockout
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime:   timestamp('end_time',   { withTimezone: true }),
});

// question_answers — player submissions. One per (user, question).
// outcome / pointsAwarded are filled when admin settles the question.
export const questionAnswers = pgTable('question_answers', {
  id:            serial('id').primaryKey(),
  userId:        integer('user_id').notNull().references(() => users.id,     { onDelete: 'cascade' }),
  questionId:    integer('question_id').notNull().references(() => questions.id, { onDelete: 'cascade' }),
  answer:        text('answer').notNull(),
  outcome:       text('outcome').notNull().default('pending'),          // 'pending' | 'win' | 'loss'
  pointsAwarded: integer('points_awarded').notNull().default(0),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userQuestionUnique: unique('answers_user_question_unique').on(t.userId, t.questionId),
}));

// group_entries — Phase 1 bracket: one row per tournament group (12 for WC2026).
// teams and correctRanking stored as pipe-separated text (not jsonb) to minimise Neon storage.
export const groupEntries = pgTable('group_entries', {
  id:             serial('id').primaryKey(),
  groupName:      text('group_name').notNull().unique(),   // 'A'–'L'
  teams:          text('teams').notNull(),                  // pipe-separated: "Brazil|Argentina|Mexico|Serbia"
  correctRanking: text('correct_ranking'),                  // pipe-separated 1st→4th; null until admin settles
  status:         text('status').notNull().default('open'), // 'open' | 'settled'
  createdAt:      timestamp('created_at').defaultNow().notNull(),
});

// group_picks — one per (user, group): full 1st-to-4th ranking prediction.
// ranking stored as pipe-separated text (4× fewer rows than old per-slot model).
export const groupPicks = pgTable('group_picks', {
  id:            serial('id').primaryKey(),
  userId:        integer('user_id').notNull().references(() => users.id,         { onDelete: 'cascade' }),
  groupId:       integer('group_id').notNull().references(() => groupEntries.id, { onDelete: 'cascade' }),
  ranking:       text('ranking').notNull(),                 // pipe-separated 1st→4th: "Brazil|Mexico|Serbia|Argentina"
  pointsAwarded: integer('points_awarded').notNull().default(0),
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userGroupUnique: unique('group_picks_user_group_unique').on(t.userId, t.groupId),
}));

// bracket_entries — Phase 2 knockout slots only (e.g. "R16 Match 1 Winner").
// Phase 1 group standings are handled by group_entries / group_picks above.
export const bracketEntries = pgTable('bracket_entries', {
  id:          serial('id').primaryKey(),
  label:       text('label').notNull(),                              // display name
  teams:       jsonb('teams').$type<string[]>().notNull(),           // selectable options
  correctPick: text('correct_pick'),                                 // null until admin settles
  status:      text('status').notNull().default('open'),             // 'open' | 'settled'
  sortOrder:   integer('sort_order').notNull().default(0),
  createdAt:   timestamp('created_at').defaultNow().notNull(),
});

// bracket_phases — single submission window per phase (1 = group, 2 = knockout). UTC.
export const bracketPhases = pgTable('bracket_phases', {
  phase:     integer('phase').primaryKey(),
  startTime: timestamp('start_time', { withTimezone: true }),
  endTime:   timestamp('end_time',   { withTimezone: true }),
});

// bracket_picks — player's prediction per bracket entry. One per (user, entry).
export const bracketPicks = pgTable('bracket_picks', {
  id:            serial('id').primaryKey(),
  userId:        integer('user_id').notNull().references(() => users.id,          { onDelete: 'cascade' }),
  entryId:       integer('entry_id').notNull().references(() => bracketEntries.id, { onDelete: 'cascade' }),
  pick:          text('pick').notNull(),
  outcome:       text('outcome').notNull().default('pending'),       // 'pending' | 'win' | 'loss'
  pointsAwarded: integer('points_awarded').notNull().default(0),     // always 3 when win (PRD §3 C)
  createdAt:     timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userEntryUnique: unique('bracket_picks_user_entry_unique').on(t.userId, t.entryId),
}));
