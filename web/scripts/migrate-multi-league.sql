-- Multi-league migration
-- Run this ONCE against the production Neon database (main branch).
-- All existing users and their data are assigned to the current league.
-- Safe to run: uses nullable→backfill→NOT NULL pattern.

BEGIN;

-- 1. Create league_members table
CREATE TABLE IF NOT EXISTS league_members (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  league_id  INTEGER NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT league_members_user_league UNIQUE (user_id, league_id)
);

-- 2. Add nullable league_id columns to all activity tables
ALTER TABLE bets             ADD COLUMN IF NOT EXISTS league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE;
ALTER TABLE question_answers ADD COLUMN IF NOT EXISTS league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE;
ALTER TABLE group_picks      ADD COLUMN IF NOT EXISTS league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE;
ALTER TABLE bracket_picks    ADD COLUMN IF NOT EXISTS league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE;
ALTER TABLE bailouts         ADD COLUMN IF NOT EXISTS league_id INTEGER REFERENCES leagues(id) ON DELETE CASCADE;

-- 3. Enrol all existing users in the current (most recently created) league
INSERT INTO league_members (user_id, league_id)
SELECT u.id, l.id
FROM users u
CROSS JOIN (SELECT id FROM leagues ORDER BY created_at DESC LIMIT 1) l
ON CONFLICT DO NOTHING;

-- 4. Backfill league_id on all existing activity rows
UPDATE bets             SET league_id = (SELECT id FROM leagues ORDER BY created_at DESC LIMIT 1) WHERE league_id IS NULL;
UPDATE question_answers SET league_id = (SELECT id FROM leagues ORDER BY created_at DESC LIMIT 1) WHERE league_id IS NULL;
UPDATE group_picks      SET league_id = (SELECT id FROM leagues ORDER BY created_at DESC LIMIT 1) WHERE league_id IS NULL;
UPDATE bracket_picks    SET league_id = (SELECT id FROM leagues ORDER BY created_at DESC LIMIT 1) WHERE league_id IS NULL;
UPDATE bailouts         SET league_id = (SELECT id FROM leagues ORDER BY created_at DESC LIMIT 1) WHERE league_id IS NULL;

-- 5. Add NOT NULL constraints
ALTER TABLE bets             ALTER COLUMN league_id SET NOT NULL;
ALTER TABLE question_answers ALTER COLUMN league_id SET NOT NULL;
ALTER TABLE group_picks      ALTER COLUMN league_id SET NOT NULL;
ALTER TABLE bracket_picks    ALTER COLUMN league_id SET NOT NULL;
ALTER TABLE bailouts         ALTER COLUMN league_id SET NOT NULL;

-- 6. Drop old unique constraints and add new ones that include league_id
ALTER TABLE bets             DROP CONSTRAINT IF EXISTS bets_user_match_unique;
ALTER TABLE bets             ADD  CONSTRAINT bets_user_match_league_unique        UNIQUE (user_id, match_id, league_id);

ALTER TABLE question_answers DROP CONSTRAINT IF EXISTS answers_user_question_unique;
ALTER TABLE question_answers ADD  CONSTRAINT answers_user_question_league_unique  UNIQUE (user_id, question_id, league_id);

ALTER TABLE group_picks      DROP CONSTRAINT IF EXISTS group_picks_user_group_unique;
ALTER TABLE group_picks      ADD  CONSTRAINT group_picks_user_group_league_unique  UNIQUE (user_id, group_id, league_id);

ALTER TABLE bracket_picks    DROP CONSTRAINT IF EXISTS bracket_picks_user_entry_unique;
ALTER TABLE bracket_picks    ADD  CONSTRAINT bracket_picks_user_entry_league_unique UNIQUE (user_id, entry_id, league_id);

COMMIT;
