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
  status:    text('status').notNull().default('upcoming'),  // 'upcoming' | 'live' | 'complete'
  // Admin-entered "correct answers" for the questions that aren't derivable from the score.
  //   firstScorer: team name that scored first, 'No Goal', or null if not entered.    (Q2)
  //   totalCards:  total yellow+red cards across both teams, or null if not entered.  (Q4)
  // Q1 (result) and Q3 (goals O/U) are still derived from scoreA/scoreB at settle time.
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
  wager:     integer('wager').notNull(),
  outcome:   text('outcome').notNull().default('pending'),  // 'pending' | 'win' | 'loss'
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userMatchUnique: unique('bets_user_match_unique').on(t.userId, t.matchId),
}));

// audit — append-only log of state-changing actions.
export const audit = pgTable('audit', {
  id:        serial('id').primaryKey(),
  action:    text('action').notNull(),
  detail:    jsonb('detail'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
