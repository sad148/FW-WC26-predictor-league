// ============================================================
// WC2026 Fantasy Predictor — Google Apps Script
//
// DEPLOY STEPS:
//   1. Extensions → Apps Script → paste this file
//   2. Deploy → New Deployment → Type: Web App
//   3. Execute as: Me | Who has access: Anyone
//   4. Click Deploy → Authorize → Copy the /exec URL
//   5. In the app: Admin → Settings → paste the URL → Save & Test
//
// CORS FIX:
//   Apps Script only handles GET and POST — no OPTIONS preflight.
//   The HTML fetch() uses Content-Type: text/plain to avoid
//   triggering a preflight. The doPost() response includes
//   Access-Control-Allow-Origin: * so the browser accepts it.
// ============================================================

// ── CORS HELPER ─────────────────────────────────────────────
// Every response MUST go through this to avoid CORS errors.
function corsResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  // Note: Apps Script automatically adds Access-Control-Allow-Origin: *
  // on Web App responses when deployed with "Anyone" access.
  // The key fix on the client side is Content-Type: text/plain
  // which avoids the OPTIONS preflight that Apps Script can't handle.
}

// ── ENTRY POINTS ────────────────────────────────────────────
function doGet(e) {
  // Health check — open this URL in a browser to verify deployment
  return corsResponse({
    status: 'WC2026 API online',
    time: new Date().toISOString(),
    message: 'POST your actions to this URL from the predictor app.'
  });
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const { action, data } = body;

    const handlers = {
      saveBet:        () => saveBet(data),
      saveResult:     () => saveResult(data),
      addFixture:     () => addFixture(data),
      getFixtures:    () => getFixtures(),
      getLeaderboard: () => getLeaderboard(),
      getMyBets:      () => getMyBets(data),
      getConfig:      () => getConfig(),
      registerPlayer: () => registerPlayer(data),
      loginPlayer:    () => loginPlayer(data),
      createLeague:   () => createLeague(data),
      getLeague:      () => getLeague(),
      resetData:      () => resetData(),
      ping:           () => ({ ok: true, message: 'pong' })
    };

    if (!handlers[action]) {
      return corsResponse({ ok: false, error: 'Unknown action: ' + action });
    }

    const result = handlers[action]();
    return corsResponse(result);

  } catch (err) {
    return corsResponse({ ok: false, error: err.message });
  }
}

// ── SHEET HELPERS ────────────────────────────────────────────
function ss() { return SpreadsheetApp.getActiveSpreadsheet(); }

function getSheet(name) {
  let sheet = ss().getSheetByName(name);
  if (!sheet) {
    sheet = ss().insertSheet(name);
    // Auto-create headers for each tab
    const headers = {
      'Fixtures':    ['Match_ID','Date','Phase','Group','Team_A','Team_B','Flag_A','Flag_B','Venue','Score_A','Score_B','Status'],
      'Predictions': ['Timestamp','Player_ID','Player_Name','Match_ID','Q1','Q2','Q3','Q4','Wager','Outcome'],
      'Leaderboard': ['Player_ID','Player_Name','Wins','Losses','Pending','Points_Earned','Points_Lost'],
      'Players':     ['Player_ID','Name','Salt','Password_Hash','Created_At'],
      'Config':      ['Key','Value'],
      'Audit':       ['Timestamp','Action','Detail']
    };
    if (headers[name]) sheet.appendRow(headers[name]);
  }
  return sheet;
}

function audit(action, detail) {
  getSheet('Audit').appendRow([new Date().toISOString(), action, JSON.stringify(detail)]);
}

// ── ACTIONS ──────────────────────────────────────────────────

/**
 * saveBet
 * Called every time a user places a bet.
 * Writes one row to Predictions tab.
 */
function saveBet(d) {
  getSheet('Predictions').appendRow([
    d.timestamp || new Date().toISOString(),
    d.playerId,
    d.playerName,
    d.matchId,
    d.q1 || '',
    d.q2 || '',
    d.q3 || '',
    d.q4 || '',
    d.wager,
    'pending'
  ]);
  audit('saveBet', { player: d.playerName, matchId: d.matchId, wager: d.wager });
  return { ok: true, message: 'Bet saved for ' + d.playerName };
}

/**
 * saveResult
 * Admin only. Updates match score + status in Fixtures tab,
 * then settles all pending bets for that match.
 */
function saveResult(d) {
  const sheet = getSheet('Fixtures');
  const rows  = sheet.getDataRange().getValues();

  // Find row with matching Match_ID (col A = index 0)
  let rowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === String(d.matchId)) { rowIndex = i + 1; break; }
  }
  if (rowIndex < 0) return { ok: false, error: 'Match not found: ' + d.matchId };

  // Fixtures columns: Match_ID(A), Date(B), Phase(C), Group(D),
  //                   Team_A(E), Team_B(F), Flag_A(G), Flag_B(H),
  //                   Venue(I), Score_A(J=10), Score_B(K=11), Status(L=12)
  sheet.getRange(rowIndex, 10).setValue(d.scoreA);
  sheet.getRange(rowIndex, 11).setValue(d.scoreB);
  sheet.getRange(rowIndex, 12).setValue(d.status);

  let settled = 0;
  if (d.status === 'complete') {
    settled = settleBets(d.matchId, Number(d.scoreA), Number(d.scoreB));
  }

  audit('saveResult', d);
  return { ok: true, settled, message: 'Result saved. ' + settled + ' bets settled.' };
}

/**
 * settleBets
 * Reads all pending Predictions rows for a match,
 * evaluates each against the actual result, writes 'win' or 'loss'.
 */
function settleBets(matchId, sA, sB) {
  const sheet = getSheet('Predictions');
  const rows  = sheet.getDataRange().getValues();
  const total = (sA || 0) + (sB || 0);
  const result = sA > sB ? 'Home Win' : sB > sA ? 'Away Win' : 'Draw';
  const cleanSheet = sA === 0 || sB === 0;
  let count = 0;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    // Cols: Timestamp(0), Player_ID(1), Player_Name(2), Match_ID(3),
    //       Q1(4), Q2(5), Q3(6), Q4(7), Wager(8), Outcome(9)
    if (String(r[3]) !== String(matchId) || r[9] !== 'pending') continue;

    let win = true;
    if (r[4] && r[4] !== result)                                   win = false;
    if (r[6] === '0–1 Goals'  && total > 1)                        win = false;
    if (r[6] === '2–3 Goals'  && (total < 2 || total > 3))         win = false;
    if (r[6] === '4+ Goals'   && total < 4)                        win = false;
    if (r[7] === 'Yes'        && !cleanSheet)                      win = false;
    if (r[7] === 'No'         && cleanSheet)                       win = false;

    sheet.getRange(i + 1, 10).setValue(win ? 'win' : 'loss');
    count++;
  }
  return count;
}

/**
 * addFixture
 * Admin only. Appends a new match to Fixtures tab.
 */
function addFixture(d) {
  const sheet = getSheet('Fixtures');
  const newId = Math.max(0, sheet.getLastRow() - 1) + 1; // auto-increment
  sheet.appendRow([
    newId, d.date || 'TBD', d.phase || 'group', d.group || '?',
    d.nameA, d.nameB, d.flagA || '⚽', d.flagB || '⚽',
    d.venue || 'TBD', '', '', 'upcoming'
  ]);
  audit('addFixture', { nameA: d.nameA, nameB: d.nameB });
  return { ok: true, matchId: newId, message: 'Fixture added: ' + d.nameA + ' vs ' + d.nameB };
}

/**
 * getFixtures
 * Returns all rows from Fixtures tab as an array of objects.
 * The HTML calls this on page load to sync match data from the Sheet.
 */
function getFixtures() {
  const rows = getSheet('Fixtures').getDataRange().getValues();
  if (rows.length < 2) return { ok: true, matches: [] };
  const [headers, ...data] = rows;
  const matches = data.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
  return { ok: true, matches };
}

/**
 * getLeaderboard
 * Aggregates Predictions tab per player: wins, losses, wallet, total pts.
 */
function getLeaderboard() {
  const rows = getSheet('Predictions').getDataRange().getValues();
  if (rows.length < 2) return { ok: true, leaderboard: [] };

  const players = {};
  for (let i = 1; i < rows.length; i++) {
    const [ts, pid, pname, mid, q1, q2, q3, q4, wager, outcome] = rows[i];
    if (!players[pid]) players[pid] = { playerId: pid, playerName: pname, wins: 0, losses: 0, pending: 0, wallet: 100, pts: 0 };
    const p = players[pid];
    const w = parseInt(wager) || 0;
    if (outcome === 'win')     { p.wins++;    p.wallet += w; p.pts += w; }
    if (outcome === 'loss')    { p.losses++;  p.wallet -= w; }
    if (outcome === 'pending') { p.pending++;               }
  }
  return { ok: true, leaderboard: Object.values(players).sort((a, b) => b.pts - a.pts) };
}

/**
 * getMyBets
 * Returns all Predictions rows for a single player_id.
 * The HTML calls this to render the My Bets screen with live data.
 */
function getMyBets(d) {
  const rows = getSheet('Predictions').getDataRange().getValues();
  if (rows.length < 2) return { ok: true, bets: [] };
  const playerId = String(d.playerId || '');
  const bets = [];
  for (let i = 1; i < rows.length; i++) {
    const [ts, pid, pname, mid, q1, q2, q3, q4, wager, outcome] = rows[i];
    if (String(pid) !== playerId) continue;
    bets.push({
      timestamp: ts,
      matchId:   mid,
      q1, q2, q3, q4,
      wager:     parseInt(wager) || 0,
      outcome:   outcome || 'pending'
    });
  }
  return { ok: true, bets };
}

/**
 * registerPlayer
 * Creates a new player row. Name must be unique (case-insensitive).
 * Caller must supply the active league code (set by admin via createLeague).
 * Password is hashed with a per-player salt.
 */
function registerPlayer(d) {
  const name = String(d.name || '').trim();
  const pwd  = String(d.password || '');
  const code = String(d.leagueCode || '').trim().toUpperCase();
  if (!name)            return { ok: false, error: 'Name is required.' };
  if (pwd.length < 4)   return { ok: false, error: 'Password must be at least 4 characters.' };
  if (!code)            return { ok: false, error: 'League code is required.' };

  const leagueCode = String(readConfig_('LEAGUE_CODE') || '').toUpperCase();
  if (!leagueCode)              return { ok: false, error: 'No league exists yet. Ask the admin to create one.' };
  if (code !== leagueCode)      return { ok: false, error: 'Invalid league code.' };

  const sheet = getSheet('Players');
  const rows = sheet.getDataRange().getValues();
  const nameLower = name.toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][1] || '').toLowerCase() === nameLower) {
      return { ok: false, error: 'Name already taken. Log in instead.' };
    }
  }

  const playerId = 'player_' + nameLower.replace(/\s+/g, '_');
  const salt = Utilities.getUuid();
  const hash = hashPassword_(pwd, salt);
  sheet.appendRow([playerId, name, salt, hash, new Date().toISOString()]);
  audit('registerPlayer', { name, playerId });
  return { ok: true, playerId, name };
}

/**
 * createLeague (admin only — the HTML gates this behind ADMIN_PW)
 * Generates a fresh WC26-XXXX code and stores it + the league name in Config.
 * Existing players remain registered; the code only gates new registrations.
 */
function createLeague(d) {
  const name = String(d.name || '').trim();
  if (!name) return { ok: false, error: 'League name is required.' };
  const code = 'WC26-' + Math.random().toString(36).toUpperCase().slice(2, 6);
  setConfig_('LEAGUE_NAME', name);
  setConfig_('LEAGUE_CODE', code);
  audit('createLeague', { name, code });
  return { ok: true, name, code };
}

/** Returns the current league name + code (both empty strings if none exists). */
function getLeague() {
  return {
    ok: true,
    name: readConfig_('LEAGUE_NAME') || '',
    code: readConfig_('LEAGUE_CODE') || ''
  };
}

/** Config helpers: upsert a Key/Value row in the Config tab. */
function setConfig_(key, value) {
  const sheet = getSheet('Config');
  const rows = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) { sheet.getRange(i + 1, 2).setValue(value); return; }
  }
  sheet.appendRow([key, value]);
}

function readConfig_(key) {
  const rows = getSheet('Config').getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) === key) return rows[i][1];
  }
  return null;
}

/**
 * loginPlayer
 * Verifies name+password against Players tab. Returns the playerId on success.
 */
function loginPlayer(d) {
  const name = String(d.name || '').trim();
  const pwd  = String(d.password || '');
  if (!name || !pwd) return { ok: false, error: 'Name and password are required.' };

  const rows = getSheet('Players').getDataRange().getValues();
  const nameLower = name.toLowerCase();
  for (let i = 1; i < rows.length; i++) {
    const [playerId, rowName, salt, hash] = rows[i];
    if (String(rowName || '').toLowerCase() === nameLower) {
      if (hashPassword_(pwd, salt) === hash) {
        audit('loginPlayer', { name, playerId });
        return { ok: true, playerId, name: rowName };
      }
      return { ok: false, error: 'Wrong password.' };
    }
  }
  return { ok: false, error: 'No account with that name. Register first.' };
}

/**
 * hashPassword_
 * SHA-256 of (salt + ':' + password), returned as lowercase hex.
 * Not bcrypt — sufficient for a private hobby league, not for high-value auth.
 */
function hashPassword_(password, salt) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + ':' + password,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

/**
 * getConfig
 * Returns Config tab key-value pairs.
 */
function getConfig() {
  const rows = getSheet('Config').getDataRange().getValues();
  const config = {};
  rows.forEach(r => { if (r[0]) config[r[0]] = r[1]; });
  return { ok: true, config };
}

/**
 * resetData
 * Admin only — TESTING PHASE: wipes ALL tabs (Fixtures, Predictions,
 * Leaderboard, Audit, Config) and rewrites their header rows.
 */
function resetData() {
  const headers = {
    'Fixtures':    ['Match_ID','Date','Phase','Group','Team_A','Team_B','Flag_A','Flag_B','Venue','Score_A','Score_B','Status'],
    'Predictions': ['Timestamp','Player_ID','Player_Name','Match_ID','Q1','Q2','Q3','Q4','Wager','Outcome'],
    'Leaderboard': ['Player_ID','Player_Name','Wins','Losses','Pending','Points_Earned','Points_Lost'],
    'Players':     ['Player_ID','Name','Salt','Password_Hash','Created_At'],
    'Audit':       ['Timestamp','Action','Detail'],
    'Config':      ['Key','Value']
  };
  Object.keys(headers).forEach(name => {
    const sheet = getSheet(name);
    sheet.clear();
    sheet.appendRow(headers[name]);
  });
  audit('resetData', { tabs: Object.keys(headers) });
  return { ok: true, message: 'All sheets reset (Fixtures, Predictions, Leaderboard, Players, Audit, Config).' };
}
