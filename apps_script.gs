/**
 * WC26 Predictor — Google Apps Script Web App backend
 *
 * Deploy:
 *   1. Open the connected Google Sheet → Extensions → Apps Script
 *   2. Paste this file as Code.gs
 *   3. Deploy → New deployment → Web App
 *        Execute as: Me
 *        Who has access: Anyone
 *   4. Copy the /exec URL → paste into Admin → Settings in the app
 *
 * Sheet tabs (created automatically on first call):
 *   Config       Key | Value
 *   Fixtures     Match_ID | Date | Team_A | Team_B | Score_A | Score_B | Status | Phase | Venue
 *   Predictions  Timestamp | Player_ID | Player_Name | Match_ID | Q1 | Q2 | Q3 | Q4 | Wager | Outcome
 *   Leaderboard  Player_ID | Name | Wins | Losses | Draws | Wallet | Pts
 *   Audit        Timestamp | Action | Details
 */

const TABS = {
  CONFIG:      'Config',
  FIXTURES:    'Fixtures',
  PREDICTIONS: 'Predictions',
  LEADERBOARD: 'Leaderboard',
  AUDIT:       'Audit',
};

const HEADERS = {
  [TABS.CONFIG]:      ['Key', 'Value'],
  [TABS.FIXTURES]:    ['Match_ID', 'Date', 'Team_A', 'Team_B', 'Score_A', 'Score_B', 'Status', 'Phase', 'Venue'],
  [TABS.PREDICTIONS]: ['Timestamp', 'Player_ID', 'Player_Name', 'Match_ID', 'Q1', 'Q2', 'Q3', 'Q4', 'Wager', 'Outcome'],
  [TABS.LEADERBOARD]: ['Player_ID', 'Name', 'Wins', 'Losses', 'Draws', 'Wallet', 'Pts'],
  [TABS.AUDIT]:       ['Timestamp', 'Action', 'Details'],
};

const STARTING_WALLET = 100;

// ─── Entry points ──────────────────────────────────────────────────────────

function doGet() {
  ensureTabs_();
  return json_({ ok: true, status: 'WC26 Predictor Apps Script alive' });
}

function doPost(e) {
  try {
    ensureTabs_();
    const body   = JSON.parse(e.postData.contents || '{}');
    const action = body.action;
    const data   = body.data || {};

    switch (action) {
      case 'saveBet':        return json_(saveBet_(data));
      case 'saveResult':     return json_(saveResult_(data));
      case 'addFixture':     return json_(addFixture_(data));
      case 'getLeaderboard': return json_(getLeaderboard_());
      case 'resetData':      return json_(resetData_());
      default:               return json_({ ok: false, error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ─── Actions ───────────────────────────────────────────────────────────────

function saveBet_(d) {
  const sheet = sheet_(TABS.PREDICTIONS);
  sheet.appendRow([
    d.timestamp || new Date().toISOString(),
    d.playerId, d.playerName, d.matchId,
    d.q1, d.q2, d.q3, d.q4,
    Number(d.wager) || 0,
    'pending',
  ]);
  // Deduct wager from wallet immediately
  upsertPlayerWallet_(d.playerId, d.playerName, -Number(d.wager || 0));
  audit_('saveBet', `${d.playerName} on match ${d.matchId} for ${d.wager} pts`);
  return { ok: true, message: 'Bet recorded.' };
}

function saveResult_(d) {
  const matchId = String(d.matchId);
  const scoreA  = numOrNull_(d.scoreA);
  const scoreB  = numOrNull_(d.scoreB);
  const status  = d.status || 'complete';

  // Update fixture row
  const fSheet = sheet_(TABS.FIXTURES);
  const rows = fSheet.getDataRange().getValues();
  let updated = false;
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][0]) === matchId) {
      if (scoreA !== null) fSheet.getRange(r + 1, 5).setValue(scoreA);
      if (scoreB !== null) fSheet.getRange(r + 1, 6).setValue(scoreB);
      fSheet.getRange(r + 1, 7).setValue(status);
      updated = true;
      break;
    }
  }
  if (!updated) return { ok: false, error: `Match ${matchId} not found in Fixtures.` };

  let settled = 0;
  if (status === 'complete' && scoreA !== null && scoreB !== null) {
    settled = settlePendingBets_(matchId, scoreA, scoreB);
  }
  audit_('saveResult', `match=${matchId} ${scoreA}-${scoreB} status=${status} settled=${settled}`);
  return { ok: true, message: `Result saved. ${settled} bet(s) settled.` };
}

function addFixture_(d) {
  const sheet = sheet_(TABS.FIXTURES);
  const nextId = nextFixtureId_(sheet);
  sheet.appendRow([nextId, d.date || '', d.nameA, d.nameB, '', '', 'upcoming', d.phase || 'group', d.venue || '']);
  audit_('addFixture', `${d.nameA} vs ${d.nameB} (#${nextId})`);
  return { ok: true, message: 'Fixture added.', id: nextId };
}

function getLeaderboard_() {
  const sheet = sheet_(TABS.LEADERBOARD);
  const rows = sheet.getDataRange().getValues();
  const players = [];
  for (let r = 1; r < rows.length; r++) {
    const [playerId, name, wins, losses, draws, wallet, pts] = rows[r];
    if (!name) continue;
    players.push({
      name:   String(name),
      wins:   Number(wins)   || 0,
      losses: Number(losses) || 0,
      draws:  Number(draws)  || 0,
      wallet: Number(wallet) || 0,
      pts:    Number(pts)    || 0,
    });
  }
  return { ok: true, players };
}

function resetData_() {
  [TABS.PREDICTIONS, TABS.LEADERBOARD, TABS.AUDIT].forEach(name => {
    const sheet = sheet_(name);
    sheet.clear();
    sheet.appendRow(HEADERS[name]);
  });
  audit_('resetData', 'Predictions, Leaderboard, and Audit tabs cleared');
  return { ok: true, message: 'Sheets reset (Predictions, Leaderboard, Audit).' };
}

// ─── Bet settlement ────────────────────────────────────────────────────────

function settlePendingBets_(matchId, scoreA, scoreB) {
  const fixture = findFixture_(matchId);
  if (!fixture) return 0;

  const pSheet = sheet_(TABS.PREDICTIONS);
  const rows = pSheet.getDataRange().getValues();
  let count = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const rowMatchId = String(row[3]);
    const outcome   = row[9];
    if (rowMatchId !== String(matchId) || outcome !== 'pending') continue;

    const preds = { q1: row[4], q2: row[5], q3: row[6], q4: row[7] };
    const wager = Number(row[8]) || 0;
    const playerId   = row[1];
    const playerName = row[2];

    const won = checkPredictions_(preds, fixture, scoreA, scoreB);
    const outcomeStr = won ? 'win' : 'loss';
    pSheet.getRange(r + 1, 10).setValue(outcomeStr);

    // win returns 2× wager (refund stake + equal profit); loss already debited at saveBet
    const walletDelta = won ? wager * 2 : 0;
    const ptsDelta    = won ? wager : 0;
    const winsDelta   = won ? 1 : 0;
    const lossesDelta = won ? 0 : 1;
    bumpPlayer_(playerId, playerName, { wallet: walletDelta, pts: ptsDelta, wins: winsDelta, losses: lossesDelta });
    count++;
  }
  return count;
}

function checkPredictions_(preds, fixture, sA, sB) {
  const actualResult = sA > sB ? 'Home Win' : sB > sA ? 'Away Win' : 'Draw';
  if (preds.q1 && preds.q1 !== actualResult) return false;

  const totalGoals = (sA || 0) + (sB || 0);
  if (preds.q3 === '0–1 Goals' && totalGoals > 1) return false;
  if (preds.q3 === '2–3 Goals' && (totalGoals < 2 || totalGoals > 3)) return false;
  if (preds.q3 === '4+ Goals'  && totalGoals < 4) return false;

  const hasCleanSheet = sA === 0 || sB === 0;
  if (preds.q4 === 'Yes' && !hasCleanSheet) return false;
  if (preds.q4 === 'No'  &&  hasCleanSheet) return false;

  return true;
}

// ─── Leaderboard upserts ───────────────────────────────────────────────────

function upsertPlayerWallet_(playerId, playerName, walletDelta) {
  bumpPlayer_(playerId, playerName, { wallet: walletDelta });
}

function bumpPlayer_(playerId, playerName, delta) {
  const sheet = sheet_(TABS.LEADERBOARD);
  const rows = sheet.getDataRange().getValues();
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][0]) === String(playerId)) {
      const cur = { wins: Number(rows[r][2]) || 0, losses: Number(rows[r][3]) || 0,
                    draws: Number(rows[r][4]) || 0, wallet: Number(rows[r][5]) || 0,
                    pts: Number(rows[r][6]) || 0 };
      sheet.getRange(r + 1, 3).setValue(cur.wins   + (delta.wins   || 0));
      sheet.getRange(r + 1, 4).setValue(cur.losses + (delta.losses || 0));
      sheet.getRange(r + 1, 5).setValue(cur.draws  + (delta.draws  || 0));
      sheet.getRange(r + 1, 6).setValue(cur.wallet + (delta.wallet || 0));
      sheet.getRange(r + 1, 7).setValue(cur.pts    + (delta.pts    || 0));
      return;
    }
  }
  sheet.appendRow([
    playerId, playerName,
    delta.wins   || 0,
    delta.losses || 0,
    delta.draws  || 0,
    STARTING_WALLET + (delta.wallet || 0),
    delta.pts    || 0,
  ]);
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function ensureTabs_() {
  Object.keys(HEADERS).forEach(name => {
    const sheet = sheet_(name);
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS[name]);
  });
}

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

function findFixture_(matchId) {
  const rows = sheet_(TABS.FIXTURES).getDataRange().getValues();
  for (let r = 1; r < rows.length; r++) {
    if (String(rows[r][0]) === String(matchId)) {
      return { id: rows[r][0], date: rows[r][1], nameA: rows[r][2], nameB: rows[r][3],
               status: rows[r][6], phase: rows[r][7], venue: rows[r][8] };
    }
  }
  return null;
}

function nextFixtureId_(sheet) {
  const rows = sheet.getDataRange().getValues();
  let max = 0;
  for (let r = 1; r < rows.length; r++) {
    const n = Number(rows[r][0]);
    if (!isNaN(n) && n > max) max = n;
  }
  return max + 1;
}

function audit_(action, details) {
  sheet_(TABS.AUDIT).appendRow([new Date().toISOString(), action, details]);
}

function numOrNull_(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
