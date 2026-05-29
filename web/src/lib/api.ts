/**
 * Typed fetch wrapper that talks to /api/* routes.
 * Throws ApiError on any non-ok response so callers can `try { await api.x() } catch(e) { toast(e.message) }`.
 */

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  let json: { ok?: boolean; error?: string } & Record<string, unknown> = {};
  try {
    json = await res.json();
  } catch {
    throw new ApiError(res.status, `Bad response (HTTP ${res.status})`);
  }
  if (!res.ok || json.ok === false) {
    throw new ApiError(res.status, json.error || `Request failed (HTTP ${res.status})`);
  }
  return json as T;
}

// ── Types ────────────────────────────────────────────────────────────

export interface SessionUser {
  userId:   number;
  playerId: string;
  name:     string;
}
export interface MeResponse { user: SessionUser | null; isAdmin: boolean; }

export interface Match {
  id: number;
  date: string;
  phase: string;
  groupName: string | null;
  teamA: string;
  teamB: string;
  flagA: string | null;
  flagB: string | null;
  venue: string | null;
  scoreA: number | null;
  scoreB: number | null;
  startTime: string | null;     // UTC ISO; betting opens at this moment
  endTime:   string | null;     // UTC ISO; betting closes at this moment
  firstScorer: string | null;   // Admin-entered correct answer for Q2
  totalCards:  number | null;   // Admin-entered correct answer for Q4
}

export interface Bet {
  id: number;
  userId: number;
  matchId: number;
  q1: string | null;
  q2: string | null;
  q3: string | null;
  q4: string | null;
  wager: number;
  outcome: 'pending' | 'win' | 'loss';
  createdAt: string;
}

export interface LeaderboardRow {
  playerId: string;
  name: string;
  wins: number;
  losses: number;
  pending: number;
  wallet: number;
  pts: number;
}

export interface League {
  id: number;
  name: string;
  code: string;
  createdAt: string;
}

// ── API surface ──────────────────────────────────────────────────────

export const api = {
  // Auth
  me:       ()                                  => request<MeResponse>('/api/auth/me'),
  register: (b: { name: string; password: string; leagueCode: string }) =>
                                                   request<{ playerId: string; name: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify(b) }),
  login:    (b: { name: string; password: string }) =>
                                                   request<{ playerId: string; name: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify(b) }),
  logout:   ()                                  => request<{}>('/api/auth/logout', { method: 'POST' }),

  // Fixtures
  fixtures: ()                                  => request<{ matches: Match[] }>('/api/fixtures'),
  addFixture: (b: Partial<Match> & { nameA: string; nameB: string }) =>
                                                   request<{ match: Match }>('/api/fixtures', { method: 'POST', body: JSON.stringify(b) }),
  updateFixture: (id: number, b: { scoreA?: number | ''; scoreB?: number | ''; firstScorer?: string | null; totalCards?: number | '' | null; startTime?: string | null; endTime?: string | null }) =>
                                                   request<{ match: Match; settled: number }>(`/api/fixtures/${id}`, { method: 'PATCH', body: JSON.stringify(b) }),

  // Bets
  myBets:   ()                                  => request<{ bets: Bet[] }>('/api/bets'),
  placeBet: (b: { matchId: number; q1?: string; q2?: string; q3?: string; q4?: string; wager: number }) =>
                                                   request<{ bet: Bet }>('/api/bets', { method: 'POST', body: JSON.stringify(b) }),

  // Leaderboard
  leaderboard: ()                               => request<{ leaderboard: LeaderboardRow[] }>('/api/leaderboard'),

  // League
  league:        ()                             => request<{ league: League | null }>('/api/league'),
  createLeague:  (b: { name: string })          => request<{ league: League }>('/api/league', { method: 'POST', body: JSON.stringify(b) }),

  // Admin
  adminLogin:    (b: { password: string })      => request<{}>('/api/admin/login', { method: 'POST', body: JSON.stringify(b) }),
  adminLogout:   ()                             => request<{}>('/api/admin/logout', { method: 'POST' }),
  adminReset:    ()                             => request<{ message: string }>('/api/admin/reset', { method: 'POST' }),
  seedFixtures:  ()                             => request<{ message: string; count: number }>('/api/admin/seed-fixtures', { method: 'POST' }),
};
