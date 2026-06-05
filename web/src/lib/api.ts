/**
 * Typed fetch wrapper that talks to /api/* routes.
 * Throws ApiError on any non-ok response so callers can `try { await api.x() } catch(e) { toast(e.message) }`.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
    throw new ApiError(
      res.status,
      json.error || `Request failed (HTTP ${res.status})`,
    );
  }
  return json as T;
}

// ── Types ────────────────────────────────────────────────────────────

export interface SessionUser {
  userId: number;
  playerId: string;
  name: string;
}
export interface MeResponse {
  user: SessionUser | null;
  isAdmin: boolean;
}

export interface Match {
  id: number;
  phase: string;
  groupName: string | null;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  startTime: string | null; // UTC ISO; betting opens at this moment
  endTime: string | null; // UTC ISO; betting closes at this moment
  firstScorer: string | null; // Admin-entered correct answer for Q2
  totalCards: number | null; // Admin-entered correct answer for Q4
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
  outcome: "pending" | "win" | "loss";
  createdAt: string;
}

export interface LeaderboardRow {
  playerId: string;
  name: string;
  pending: number;
  wallet: number;
  matchPts: number;
  triviaPts: number;
  bracketPts: number;
  totalPts: number;
}

export interface Question {
  id: number;
  phase: number;
  text: string;
  options: string[] | null;
  pointValue: number;
  winningAnswer: string | null;
  status: "open" | "settled";
  createdAt: string;
}

export interface PhaseWindow {
  phase: number;
  startTime: string | null;
  endTime: string | null;
}

export interface Answer {
  id: number;
  userId: number;
  questionId: number;
  answer: string;
  outcome: "pending" | "win" | "loss";
  pointsAwarded: number;
  createdAt: string;
}

export interface GroupEntry {
  id: number;
  groupName: string;
  teams: string;           // pipe-separated
  correctRanking: string | null;
  status: "open" | "settled";
}

export interface GroupPick {
  id: number;
  userId: number;
  groupId: number;
  ranking: string;         // pipe-separated 1st→4th
  pointsAwarded: number;
}

export interface BracketEntry {
  id: number;
  label: string;
  teams: string[];
  correctPick: string | null;
  status: "open" | "settled";
  sortOrder: number;
}

export interface BracketPhase {
  phase: number;
  startTime: string | null;
  endTime: string | null;
}

export interface BracketPick {
  id: number;
  userId: number;
  entryId: number;
  pick: string;
  outcome: "pending" | "win" | "loss";
  pointsAwarded: number;
  createdAt: string;
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
  me: () => request<MeResponse>("/api/auth/me"),
  register: (b: { name: string; password: string; leagueCode: string }) =>
    request<{ playerId: string; name: string }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  login: (b: { name: string; password: string }) =>
    request<{ playerId: string; name: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  logout: () => request<{}>("/api/auth/logout", { method: "POST" }),

  // Fixtures
  fixtures: () => request<{ matches: Match[] }>("/api/fixtures"),
  addFixture: (b: Partial<Match> & { nameA: string; nameB: string }) =>
    request<{ match: Match }>("/api/fixtures", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  updateFixture: (
    id: number,
    b: {
      scoreA?: number | "";
      scoreB?: number | "";
      firstScorer?: string | null;
      totalCards?: number | "" | null;
      startTime?: string | null;
      endTime?: string | null;
    },
  ) =>
    request<{ match: Match; settled: number }>(`/api/fixtures/${id}`, {
      method: "PATCH",
      body: JSON.stringify(b),
    }),

  // Bets
  myBets: () => request<{ bets: Bet[] }>("/api/bets"),
  placeBet: (b: {
    matchId: number;
    q1?: string;
    q2?: string;
    q3?: string;
    q4?: string;
    wager: number;
  }) =>
    request<{ bet: Bet }>("/api/bets", {
      method: "POST",
      body: JSON.stringify(b),
    }),

  // Leaderboard
  leaderboard: () =>
    request<{ leaderboard: LeaderboardRow[] }>("/api/leaderboard"),

  // Trivia (Subsystem B)
  questions: () => request<{ questions: Question[] }>("/api/questions"),
  addQuestion: (b: {
    text: string;
    phase: number;
    pointValue: number;
    options?: string[] | null;
  }) =>
    request<{ question: Question }>("/api/questions", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  updateQuestion: (
    id: number,
    b: Partial<{
      text: string;
      phase: number;
      pointValue: number;
      options: string[] | null;
      winningAnswer: string | null;
      status: "open" | "settled";
    }>,
  ) =>
    request<{ question: Question; settled: number }>(`/api/questions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(b),
    }),
  questionPhases: () =>
    request<{ phases: PhaseWindow[] }>("/api/question-phases"),
  setQuestionPhase: (b: {
    phase: number;
    startTime: string | null;
    endTime: string | null;
  }) =>
    request<{ phase: PhaseWindow }>("/api/question-phases", {
      method: "PUT",
      body: JSON.stringify(b),
    }),
  myAnswers: () => request<{ answers: Answer[] }>("/api/answers"),
  saveAnswer: (b: { questionId: number; answer: string }) =>
    request<{ answer: Answer }>("/api/answers", {
      method: "POST",
      body: JSON.stringify(b),
    }),

  // Bracket Phase 1 — group standings
  groupEntries: () =>
    request<{ groups: GroupEntry[] }>("/api/group-entries"),
  importGroups: (groups: { groupName: string; teams: string }[]) =>
    request<{ count: number }>("/api/group-entries/bulk", {
      method: "POST",
      body: JSON.stringify({ groups }),
    }),
  settleGroup: (id: number, correctRanking: string) =>
    request<{ group: GroupEntry; scored: number }>(`/api/group-entries/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ correctRanking }),
    }),
  myGroupPicks: () => request<{ picks: GroupPick[] }>("/api/group-picks"),
  saveGroupPick: (b: { groupId: number; ranking: string }) =>
    request<{ pick: GroupPick }>("/api/group-picks", {
      method: "POST",
      body: JSON.stringify(b),
    }),

  // Bracket Phase 2 — knockout tree
  bracketEntries: () =>
    request<{ entries: BracketEntry[] }>("/api/bracket-entries"),
  addBracketEntry: (b: {
    label: string;
    teams: string[];
    sortOrder?: number;
  }) =>
    request<{ entry: BracketEntry }>("/api/bracket-entries", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  updateBracketEntry: (
    id: number,
    b: Partial<{
      label: string;
      teams: string[];
      sortOrder: number;
      correctPick: string | null;
      status: "open" | "settled";
    }>,
  ) =>
    request<{ entry: BracketEntry; settled: number }>(
      `/api/bracket-entries/${id}`,
      { method: "PATCH", body: JSON.stringify(b) },
    ),
  bracketPhases: () =>
    request<{ phases: BracketPhase[] }>("/api/bracket-phases"),
  setBracketPhase: (b: {
    phase: number;
    startTime: string | null;
    endTime: string | null;
  }) =>
    request<{ phase: BracketPhase }>("/api/bracket-phases", {
      method: "PUT",
      body: JSON.stringify(b),
    }),
  myBracketPicks: () => request<{ picks: BracketPick[] }>("/api/bracket-picks"),
  saveBracketPick: (b: { entryId: number; pick: string }) =>
    request<{ pick: BracketPick }>("/api/bracket-picks", {
      method: "POST",
      body: JSON.stringify(b),
    }),

  // League
  league: () => request<{ league: League | null }>("/api/league"),
  createLeague: (b: { name: string }) =>
    request<{ league: League }>("/api/league", {
      method: "POST",
      body: JSON.stringify(b),
    }),

  // Admin
  adminLogin: (b: { password: string }) =>
    request<{}>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify(b),
    }),
  adminLogout: () => request<{}>("/api/admin/logout", { method: "POST" }),
  adminReset: () =>
    request<{ message: string }>("/api/admin/reset", { method: "POST" }),
  seedFixtures: () =>
    request<{ message: string; count: number }>("/api/admin/seed-fixtures", {
      method: "POST",
    }),
};
