"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  type BracketEntry,
  type BracketPhase,
  type BracketRoundWindow,
  type GroupEntry,
  type LeagueSummary,
  type Match,
  type PhaseWindow,
  type Question,
} from "@/lib/api";

type AdminLeague = LeagueSummary & { createdAt: string; memberCount: number };
import { localInputToUtc, utcToLocalInput } from "@/lib/time";
import { useAuth, useToast } from "../providers";

interface ResultDraft {
  scoreA: string;
  scoreB: string;
  firstScorer: string; // '' = not set
  totalCards: string; // '' = not set
  startTime: string; // <input type="datetime-local"> value (local tz)
  endTime: string; // <input type="datetime-local"> value (local tz)
}
interface FixtureDraft {
  nameA: string;
  nameB: string;
  phase: "group" | "knockout";
  group: string;
  startTime: string;
  endTime: string; // local tz datetime-local strings
}

const EMPTY_FIXTURE: FixtureDraft = {
  nameA: "",
  nameB: "",
  phase: "group",
  group: "",
  startTime: "",
  endTime: "",
};

interface NewQuestionDraft {
  text: string;
  phase: number;
  pointValue: string;
  questionType: string;
  optionsRaw: string;
  maxSelectionsRaw: string;
}

const EMPTY_QUESTION: NewQuestionDraft = {
  text: "",
  phase: 0,
  pointValue: "5",
  questionType: "option-buttons",
  optionsRaw: "",
  maxSelectionsRaw: "",
};

interface QuestionDraft {
  winningAnswer: string;
}
interface PhaseWindowDraft {
  startTime: string;
  endTime: string;
} // local-tz datetime-local strings


// Bracket Phase 2 (knockout) draft interfaces
const KNOCKOUT_ROUNDS = ['r32', 'r16', 'qf', 'sf', 'final', 'third', 'champion'] as const;
const KNOCKOUT_ROUND_LABEL: Record<string, string> = {
  r32: 'R32', r16: 'R16', qf: 'QF', sf: 'SF', final: 'Final',
  third: '3rd Place', champion: 'Champion',
};
interface NewBracketEntryDraft {
  label: string;
  round: string;
  teamsRaw: string; // comma-separated team names
  sortOrder: string;
}
const EMPTY_BRACKET_ENTRY: NewBracketEntryDraft = {
  label: "",
  round: "r32",
  teamsRaw: "",
  sortOrder: "0",
};
interface BracketEntryDraft {
  correctPick: string;
}

// Group standings (Phase 1) draft interfaces
interface GroupSettleDraft {
  positions: string[];
} // [1st, 2nd, 3rd, 4th]

export default function AdminPage() {
  const { isAdmin, isLoading, refresh } = useAuth();
  const { toast } = useToast();
  const [allLeagues, setAllLeagues]   = useState<AdminLeague[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ResultDraft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [newFix, setNewFix] = useState<FixtureDraft>(EMPTY_FIXTURE);
  const [addingFix, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [adminPwd, setAdminPwd] = useState("");
  const [busy, setBusy] = useState(false);

  // Trivia (Subsystem B) state
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQ, setNewQ] = useState<NewQuestionDraft>(EMPTY_QUESTION);
  const [addingQ, setAddingQ] = useState(false);
  const [qDrafts, setQDrafts] = useState<Record<number, QuestionDraft>>({});
  const [savingQId, setSavingQId] = useState<number | null>(null);
  const [phaseWindows, setPhaseWindows] = useState<PhaseWindow[]>([]);
  const [pwDrafts, setPwDrafts] = useState<Record<number, PhaseWindowDraft>>({});
  const [savingPhase, setSavingPhase] = useState<number | null>(null);
  const [newPhaseName, setNewPhaseName] = useState("");
  const [addingPhase, setAddingPhase] = useState(false);

  // Bracket Phase 2 (knockout) state
  const [bracketEntries, setBracketEntries] = useState<BracketEntry[]>([]);
  const [newBE, setNewBE] = useState<NewBracketEntryDraft>(EMPTY_BRACKET_ENTRY);
  const [addingBE, setAddingBE] = useState(false);
  const [beDrafts, setBeDrafts] = useState<Record<number, BracketEntryDraft>>(
    {},
  );
  const [savingBEId, setSavingBEId] = useState<number | null>(null);
  const [bracketWindows, setBracketWindows] = useState<BracketPhase[]>([]);
  const [bpwDrafts, setBpwDrafts] = useState<Record<number, PhaseWindowDraft>>(
    {},
  );
  const [savingBracketPhase, setSavingBracketPhase] = useState<number | null>(
    null,
  );
  const [roundWindows, setRoundWindows] = useState<BracketRoundWindow[]>([]);
  const [rwDrafts, setRwDrafts] = useState<Record<string, PhaseWindowDraft>>({});
  const [savingRound, setSavingRound] = useState<string | null>(null);

  // Group standings (Phase 1) state
  const [groupEntries, setGroupEntries] = useState<GroupEntry[]>([]);
  const [groupSettleDrafts, setGroupSettleDrafts] = useState<
    Record<number, GroupSettleDraft>
  >({});
  const [savingGroupId, setSavingGroupId] = useState<number | null>(null);
  const [fixTab, setFixTab] = useState<'upcoming' | 'completed'>('upcoming');
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<
    { groupName: string; teams: string }[]
  >([]);
  const [importing, setImporting] = useState(false);

  // Password reset state
  const [allUsers, setAllUsers] = useState<{ id: number; name: string }[]>([]);
  const [resetUserId, setResetUserId] = useState<number | "">("");
  const [resetPwd, setResetPwd] = useState("");
  const [resetting, setResetting] = useState(false);

  // Tab state
  const [adminTab, setAdminTab] = useState<'bets' | 'trivia' | 'brackets' | 'admin'>('bets');

  const loadFixtures = useCallback(async () => {
    try {
      const r = await api.fixtures();
      setMatches(r.matches);
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }, [toast]);

  const loadQuestions = useCallback(async () => {
    try {
      const [q, p] = await Promise.all([api.questions(), api.questionPhases()]);
      setQuestions(q.questions);
      setPhaseWindows(p.phases);
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }, [toast]);

  const loadBrackets = useCallback(async () => {
    try {
      const [e, p, rw] = await Promise.all([
        api.bracketEntries(),
        api.bracketPhases(),
        api.bracketRoundWindows(),
      ]);
      setBracketEntries(e.entries);
      setBracketWindows(p.phases);
      setRoundWindows(rw.windows);
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }, [toast]);

  const loadGroups = useCallback(async () => {
    try {
      const r = await api.groupEntries();
      setGroupEntries(r.groups);
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }, [toast]);

  const loadLeagues = useCallback(async () => {
    try {
      const r = await api.adminLeagues();
      setAllLeagues(r.leagues);
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }, [toast]);

  const loadUsers = useCallback(async () => {
    try {
      const r = await api.adminUsers();
      setAllUsers(r.users);
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) return;
    loadLeagues();
    loadFixtures();
    loadQuestions();
    loadBrackets();
    loadGroups();
    loadUsers();
  }, [isAdmin, loadLeagues, loadFixtures, loadQuestions, loadBrackets, loadGroups, loadUsers]);

  function draftFor(m: Match): ResultDraft {
    return (
      drafts[m.id] ?? {
        scoreA: m.scoreA == null ? "" : String(m.scoreA),
        scoreB: m.scoreB == null ? "" : String(m.scoreB),
        firstScorer: m.firstScorer ?? "",
        totalCards: m.totalCards == null ? "" : String(m.totalCards),
        startTime: utcToLocalInput(m.startTime),
        endTime: utcToLocalInput(m.endTime),
      }
    );
  }

  function setResultDraft(m: Match, patch: Partial<ResultDraft>) {
    const base = draftFor(m);
    setDrafts((d) => ({ ...d, [m.id]: { ...base, ...patch } }));
  }

  async function saveResult(m: Match) {
    const d = draftFor(m);
    setSavingId(m.id);
    try {
      const sA = d.scoreA === "" ? "" : parseInt(d.scoreA);
      const sB = d.scoreB === "" ? "" : parseInt(d.scoreB);
      const tc = d.totalCards === "" ? "" : parseInt(d.totalCards);
      const fs = d.firstScorer === "" ? null : d.firstScorer;
      const res = await api.updateFixture(m.id, {
        scoreA: sA,
        scoreB: sB,
        firstScorer: fs,
        totalCards: tc,
        startTime: localInputToUtc(d.startTime),
        endTime: localInputToUtc(d.endTime),
      });
      toast(
        "✓ Saved",
        `${m.teamA} vs ${m.teamB}${res.settled ? ` · ${res.settled} bet(s) settled` : ""}.`,
      );
      await loadFixtures();
      setDrafts((prev) => {
        const c = { ...prev };
        delete c[m.id];
        return c;
      });
    } catch (e) {
      toast("Error", (e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  async function addFixture() {
    if (!newFix.nameA.trim() || !newFix.nameB.trim()) {
      return toast("Missing fields", "Enter both team names.");
    }
    setAdding(true);
    try {
      await api.addFixture({
        nameA: newFix.nameA.trim(),
        nameB: newFix.nameB.trim(),
        phase: newFix.phase,
        groupName: newFix.group.trim() || null,
        startTime: localInputToUtc(newFix.startTime),
        endTime: localInputToUtc(newFix.endTime),
      } as Parameters<typeof api.addFixture>[0]);
      toast("✓ Fixture added", `${newFix.nameA} vs ${newFix.nameB}`);
      setNewFix(EMPTY_FIXTURE);
      await loadFixtures();
    } catch (e) {
      toast("Error", (e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  async function createPhase() {
    const name = newPhaseName.trim();
    if (!name) return toast("Missing field", "Enter a phase name.");
    setAddingPhase(true);
    try {
      await api.createQuestionPhase({ name });
      toast("✓ Phase created", name);
      setNewPhaseName("");
      await loadQuestions();
    } catch (e) {
      toast("Error", (e as Error).message);
    } finally {
      setAddingPhase(false);
    }
  }

  async function addQuestion() {
    const text   = newQ.text.trim();
    const opts   = newQ.questionType === 'option-buttons'
      ? newQ.optionsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    const pts    = parseInt(newQ.pointValue, 10);
    const maxSel = newQ.maxSelectionsRaw ? parseInt(newQ.maxSelectionsRaw, 10) : null;
    if (!text) return toast("Missing fields", "Enter question text.");
    if (!newQ.phase) return toast("Missing fields", "Select a phase.");
    if (!Number.isInteger(pts) || pts < 1)
      return toast("Invalid points", "Point value must be a positive integer.");
    if (newQ.questionType === 'option-buttons' && opts.length === 0)
      return toast("Missing options", "Option-buttons questions require at least 2 options.");
    if (maxSel !== null && (isNaN(maxSel) || maxSel < 2))
      return toast("Invalid count", "Team count must be 2 or more.");

    setAddingQ(true);
    try {
      await api.addQuestion({
        text,
        phase: newQ.phase,
        pointValue: pts,
        questionType: newQ.questionType,
        options: opts.length > 0 ? opts : null,
        maxSelections: maxSel,
      });
      toast("✓ Question added", `Phase ${newQ.phase} · ${pts} pts`);
      setNewQ(EMPTY_QUESTION);
      await loadQuestions();
    } catch (e) {
      toast("Error", (e as Error).message);
    } finally {
      setAddingQ(false);
    }
  }

  function qDraftFor(q: Question): QuestionDraft {
    return qDrafts[q.id] ?? { winningAnswer: q.winningAnswer ?? "" };
  }
  function setQDraft(q: Question, patch: Partial<QuestionDraft>) {
    const base = qDraftFor(q);
    setQDrafts((d) => ({ ...d, [q.id]: { ...base, ...patch } }));
  }

  // Settle a single question: record the winning answer and grade every answer to it.
  async function settleQuestion(q: Question) {
    const d = qDraftFor(q);
    const winningAnswer = d.winningAnswer.trim();
    if (!winningAnswer)
      return toast(
        "Missing answer",
        "Enter the winning answer before settling.",
      );
    setSavingQId(q.id);
    try {
      const res = await api.updateQuestion(q.id, {
        winningAnswer,
        status: "settled",
      });
      toast(
        "✓ Settled",
        `${q.text.slice(0, 30)}${q.text.length > 30 ? "…" : ""}${res.settled ? ` · ${res.settled} answer(s) scored` : ""}`,
      );
      await loadQuestions();
      setQDrafts((prev) => {
        const c = { ...prev };
        delete c[q.id];
        return c;
      });
    } catch (e) {
      toast("Error", (e as Error).message);
    } finally {
      setSavingQId(null);
    }
  }

  // Per-phase answer window — a single open/close window shared by every question in the phase.
  function pwDraftFor(phase: number): PhaseWindowDraft {
    const w = phaseWindows.find((p) => p.phase === phase);
    return (
      pwDrafts[phase] ?? {
        startTime: utcToLocalInput(w?.startTime),
        endTime: utcToLocalInput(w?.endTime),
      }
    );
  }
  function setPwDraft(phase: number, patch: Partial<PhaseWindowDraft>) {
    const base = pwDraftFor(phase);
    setPwDrafts((d) => ({ ...d, [phase]: { ...base, ...patch } }));
  }
  async function savePhaseWindow(phase: number) {
    const d = pwDraftFor(phase);
    setSavingPhase(phase);
    try {
      await api.setQuestionPhase({
        phase,
        startTime: localInputToUtc(d.startTime),
        endTime: localInputToUtc(d.endTime),
      });
      const phaseName = phaseWindows.find(p => p.phase === phase)?.name ?? `Phase ${phase}`;
      toast("✓ Saved", `${phaseName} window updated.`);
      await loadQuestions();
      setPwDrafts((prev) => {
        const c = { ...prev };
        delete c[phase];
        return c;
      });
    } catch (e) {
      toast("Error", (e as Error).message);
    } finally {
      setSavingPhase(null);
    }
  }

  // ── Bracket (Subsystem C) handlers ──────────────────────────────────

  function beDraftFor(e: BracketEntry): BracketEntryDraft {
    return beDrafts[e.id] ?? { correctPick: e.correctPick ?? "" };
  }
  function setBeDraft(e: BracketEntry, patch: Partial<BracketEntryDraft>) {
    setBeDrafts((d) => ({ ...d, [e.id]: { ...beDraftFor(e), ...patch } }));
  }

  async function settleBracketEntry(e: BracketEntry) {
    const d = beDraftFor(e);
    const correctPick = d.correctPick.trim();
    if (!correctPick)
      return toast("Missing pick", "Select the correct team before settling.");
    setSavingBEId(e.id);
    try {
      const res = await api.updateBracketEntry(e.id, {
        correctPick,
        status: "settled",
      });
      toast(
        "✓ Settled",
        `${e.label}${res.settled ? ` · ${res.settled} pick(s) scored` : ""}`,
      );
      await loadBrackets();
      setBeDrafts((prev) => {
        const c = { ...prev };
        delete c[e.id];
        return c;
      });
    } catch (err) {
      toast("Error", (err as Error).message);
    } finally {
      setSavingBEId(null);
    }
  }

  function parseCsv(text: string) {
    const lines = text
      .trim()
      .split("\n")
      .slice(1)
      .filter((l) => l.trim());
    const parsed = lines
      .map((line) => {
        const comma = line.indexOf(",");
        if (comma === -1) return null;
        const groupName = line.slice(0, comma).trim().toUpperCase();
        const teams = line.slice(comma + 1).trim();
        if (!groupName || !teams) return null;
        return { groupName, teams };
      })
      .filter(Boolean) as { groupName: string; teams: string }[];
    setCsvPreview(parsed);
  }

  async function importGroups() {
    if (csvPreview.length === 0)
      return toast("Nothing to import", "Parse a CSV first.");
    setImporting(true);
    try {
      const r = await api.importGroups(csvPreview);
      toast("✓ Imported", `${r.count} group(s) added.`);
      setCsvText("");
      setCsvPreview([]);
      await loadGroups();
    } catch (err) {
      toast("Error", (err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  function groupSettleDraftFor(g: GroupEntry): GroupSettleDraft {
    return groupSettleDrafts[g.id] ?? { positions: ["", "", "", ""] };
  }

  async function settleGroup(g: GroupEntry) {
    const d = groupSettleDraftFor(g);
    if (d.positions.some((p) => !p))
      return toast(
        "Missing positions",
        "Fill all 4 positions before settling.",
      );
    setSavingGroupId(g.id);
    try {
      const correctRanking = d.positions.join("|");
      const res = await api.settleGroup(g.id, correctRanking);
      toast("✓ Settled", `Group ${g.groupName} · ${res.scored} pick(s) scored`);
      await loadGroups();
      setGroupSettleDrafts((prev) => {
        const c = { ...prev };
        delete c[g.id];
        return c;
      });
    } catch (err) {
      toast("Error", (err as Error).message);
    } finally {
      setSavingGroupId(null);
    }
  }

  async function addBracketEntry() {
    const label = newBE.label.trim();
    const teams = newBE.teamsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const sortOrder = parseInt(newBE.sortOrder, 10) || 0;
    if (!label) return toast("Missing fields", "Enter a label.");
    // Teams can be empty for rounds that will be auto-populated after previous round settles.
    if (teams.length === 1)
      return toast("Missing teams", "Enter 2 teams or leave blank (auto-populated).");
    setAddingBE(true);
    try {
      await api.addBracketEntry({ label, round: newBE.round, teams, sortOrder });
      toast("✓ Entry added", label);
      setNewBE(EMPTY_BRACKET_ENTRY);
      await loadBrackets();
    } catch (err) {
      toast("Error", (err as Error).message);
    } finally {
      setAddingBE(false);
    }
  }

  function bpwDraftFor(phase: number): PhaseWindowDraft {
    const w = bracketWindows.find((p) => p.phase === phase);
    return (
      bpwDrafts[phase] ?? {
        startTime: utcToLocalInput(w?.startTime),
        endTime: utcToLocalInput(w?.endTime),
      }
    );
  }
  function setBpwDraft(phase: number, patch: Partial<PhaseWindowDraft>) {
    setBpwDrafts((d) => ({
      ...d,
      [phase]: { ...bpwDraftFor(phase), ...patch },
    }));
  }
  async function saveBracketPhaseWindow(phase: number) {
    const d = bpwDraftFor(phase);
    setSavingBracketPhase(phase);
    try {
      await api.setBracketPhase({
        phase,
        startTime: localInputToUtc(d.startTime),
        endTime: localInputToUtc(d.endTime),
      });
      toast("✓ Saved", `Phase ${phase} bracket window updated.`);
      await loadBrackets();
      setBpwDrafts((prev) => {
        const c = { ...prev };
        delete c[phase];
        return c;
      });
    } catch (err) {
      toast("Error", (err as Error).message);
    } finally {
      setSavingBracketPhase(null);
    }
  }

  function rwDraftFor(round: string): PhaseWindowDraft {
    const w = roundWindows.find((r) => r.round === round);
    return (
      rwDrafts[round] ?? {
        startTime: utcToLocalInput(w?.startTime),
        endTime: utcToLocalInput(w?.endTime),
      }
    );
  }
  function setRwDraft(round: string, patch: Partial<PhaseWindowDraft>) {
    setRwDrafts((d) => ({ ...d, [round]: { ...rwDraftFor(round), ...patch } }));
  }
  async function saveRoundWindow(round: string) {
    const d = rwDraftFor(round);
    setSavingRound(round);
    try {
      await api.setBracketRoundWindow({
        round,
        startTime: localInputToUtc(d.startTime),
        endTime: localInputToUtc(d.endTime),
      });
      toast("✓ Saved", `${KNOCKOUT_ROUND_LABEL[round]} window updated.`);
      await loadBrackets();
      setRwDrafts((prev) => { const c = { ...prev }; delete c[round]; return c; });
    } catch (err) {
      toast("Error", (err as Error).message);
    } finally {
      setSavingRound(null);
    }
  }

  async function createLeague() {
    if (!name.trim()) return toast("Missing fields", "Enter a league name.");
    try {
      const res = await api.createLeague({ name: name.trim() });
      setName("");
      toast("✓ League created", `Code: ${res.league.code}`);
      await loadLeagues();
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }

  async function seedFixtures() {
    if (
      !confirm(
        "Bulk-load 8 sample WC2026 fixtures? Only works if fixtures table is empty.",
      )
    )
      return;
    try {
      const res = await api.seedFixtures();
      toast("✓ Seeded", res.message);
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }

  async function handleResetPassword() {
    if (!resetUserId || !resetPwd) return toast("Missing fields", "Select a user and enter a new password.");
    if (resetPwd.length < 4) return toast("Too short", "Password must be at least 4 characters.");
    setResetting(true);
    try {
      await api.adminResetPassword({ userId: Number(resetUserId), newPassword: resetPwd });
      toast("✓ Done", "Password updated.");
      setResetUserId("");
      setResetPwd("");
    } catch (e) {
      toast("Error", (e as Error).message);
    } finally {
      setResetting(false);
    }
  }

  async function reset() {
    if (
      !confirm(
        "⚠ Clear bets, trivia, and bracket data? Users, leagues, and fixtures are kept.",
      )
    )
      return;
    try {
      const res = await api.adminReset();
      toast("✓ Reset", res.message);
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }

  async function handleAdminLogin() {
    if (!adminPwd) return toast("Missing field", "Enter the admin password.");
    setBusy(true);
    try {
      await api.adminLogin({ password: adminPwd });
      await refresh();
      setAdminPwd("");
      toast("✓ Admin", "Logged in as admin.");
    } catch (e) {
      toast("Wrong password", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return null;

  if (!isAdmin) {
    return (
      <section>
        <div className="sh">
          <div className="sh-title">ADMIN</div>
          <div className="sh-sub">Admin login required.</div>
        </div>
        <div className="lform">
          <div className="lform-title" style={{ color: "var(--can2)" }}>
            ADMIN LOGIN
          </div>
          <p
            style={{
              color: "var(--off)",
              fontSize: 13,
              lineHeight: 1.6,
              marginBottom: "1rem",
            }}
          >
            This area is restricted. Logging in here will end any active player
            session — admin and player accounts are separate.
          </p>
          <div className="fg">
            <label className="flabel">Password</label>
            <input
              className="finput"
              type="password"
              placeholder="Admin password"
              autoComplete="current-password"
              value={adminPwd}
              onChange={(e) => setAdminPwd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdminLogin();
              }}
            />
          </div>
          <button
            className="btn-gold"
            style={{ width: "100%" }}
            disabled={busy}
            onClick={handleAdminLogin}
          >
            {busy ? "Logging in…" : "Login →"}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="sh">
        <div className="sh-title">ADMIN</div>
        <div className="sh-sub">League + testing utilities</div>
      </div>

      {/* ─── Tab bar ─── */}
      <div className="phase-tabs" style={{ marginBottom: "1.5rem" }}>
        <button className={`ptab${adminTab === 'bets' ? ' on' : ''}`} onClick={() => setAdminTab('bets')}>Bets</button>
        <button className={`ptab${adminTab === 'trivia' ? ' on' : ''}`} onClick={() => setAdminTab('trivia')}>Trivia</button>
        <button className={`ptab${adminTab === 'brackets' ? ' on' : ''}`} onClick={() => setAdminTab('brackets')}>Brackets</button>
        <button className={`ptab${adminTab === 'admin' ? ' on' : ''}`} onClick={() => setAdminTab('admin')}>Admin</button>
      </div>

      {adminTab === 'admin' && <>
      <div className="lform" style={{ marginBottom: "1.5rem" }}>
        <div className="lform-title" style={{ color: "var(--gold)" }}>
          LEAGUES
        </div>

        {/* All leagues list */}
        {allLeagues.length === 0 ? (
          <p style={{ color: "var(--off)", fontSize: 13, marginBottom: "1rem" }}>
            No leagues yet. Create one below.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: "1.25rem" }}>
            {allLeagues.map((l) => (
              <div
                key={l.id}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px 16px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 8,
                }}
              >
                <div>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--gold)" }}>
                    {l.name}
                  </div>
                  <div style={{ fontFamily: "'Barlow Condensed',monospace", fontSize: 15, letterSpacing: 2, color: "var(--gold2)", marginTop: 2 }}>
                    {l.code}
                  </div>
                </div>
                <div style={{ fontFamily: "var(--font-cond)", fontSize: 13, color: "var(--off)", textAlign: "right" }}>
                  <span style={{ fontSize: 22, color: "var(--fg)", fontWeight: 700, display: "block" }}>{l.memberCount}</span>
                  players
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create new league */}
        <div className="fg">
          <label className="flabel">New League Name</label>
          <input
            className="finput"
            placeholder="e.g. WC2026 Predictor"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button
          className="btn-gold"
          style={{ width: "100%" }}
          onClick={createLeague}
        >
          Create League →
        </button>
      </div>
      </>}

      {adminTab === 'bets' && <>
      <div
        className="lform"
        style={{ marginBottom: "1.5rem", maxWidth: "none" }}
      >
        <div className="lform-title" style={{ color: "var(--gold)" }}>
          POST RESULTS
        </div>
        {matches.length === 0 ? (
          <p style={{ color: "var(--off)", fontSize: 13 }}>
            No fixtures yet. Add one below or seed sample fixtures from Danger
            Zone.
          </p>
        ) : (
          <>
            <div className="phase-tabs" style={{ marginBottom: 12 }}>
              <button className={`ptab${fixTab === 'upcoming' ? ' on' : ''}`} onClick={() => setFixTab('upcoming')}>Upcoming</button>
              <button className={`ptab${fixTab === 'completed' ? ' on' : ''}`} onClick={() => setFixTab('completed')}>Completed</button>
            </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(420px, 100%), 1fr))", gap: 8 }}>
            {matches.filter((m) => fixTab === 'completed' ? (m.scoreA !== null && m.scoreB !== null) : (m.scoreA === null || m.scoreB === null)).map((m) => {
              const d = draftFor(m);
              const cellInput = {
                background: "rgba(255,255,255,.06)",
                border: "1px solid var(--border)",
                color: "var(--white)",
                fontFamily: "var(--font-cond)",
                fontSize: 14,
                fontWeight: 700,
                padding: "4px 8px",
                borderRadius: 5,
                textAlign: "center" as const,
                boxSizing: "border-box" as const,
                maxWidth: "100%",
              };
              const cellSelect = {
                background: "rgba(255,255,255,.06)",
                border: "1px solid var(--border)",
                color: "var(--white)",
                fontFamily: "var(--font-cond)",
                fontSize: 13,
                padding: "5px 8px",
                borderRadius: 5,
                cursor: "pointer",
                boxSizing: "border-box" as const,
                maxWidth: "100%",
              };
              const subLabel = {
                fontFamily: "var(--font-cond)",
                fontSize: 11,
                color: "var(--gold2)",
                letterSpacing: ".5px",
              };
              return (
                <div
                  key={m.id}
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "12px 14px",
                    minWidth: 0,
                  }}
                >
                  <div style={{ marginBottom: 10 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-cond)",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      {m.teamA} vs {m.teamB}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-cond)",
                        fontSize: 12,
                        color: "var(--off)",
                        marginTop: 2,
                      }}
                    >
                      {m.groupName ? `Group ${m.groupName}` : m.phase}
                    </div>
                  </div>

                  {/* Betting window — admin enters in their local tz; we convert to UTC on save. */}
                  <div className="admin-fix-times">
                    <div style={{ minWidth: 0 }}>
                      <div style={subLabel}>BETTING OPENS (your local tz)</div>
                      <input
                        type="datetime-local"
                        value={d.startTime}
                        onChange={(e) =>
                          setResultDraft(m, { startTime: e.target.value })
                        }
                        style={{
                          ...cellInput,
                          width: "100%",
                          boxSizing: "border-box",
                          marginTop: 3,
                          textAlign: "left",
                        }}
                      />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={subLabel}>BETTING CLOSES (your local tz)</div>
                      <input
                        type="datetime-local"
                        value={d.endTime}
                        onChange={(e) =>
                          setResultDraft(m, { endTime: e.target.value })
                        }
                        style={{
                          ...cellInput,
                          width: "100%",
                          boxSizing: "border-box",
                          marginTop: 3,
                          textAlign: "left",
                        }}
                      />
                    </div>
                  </div>

                  <div className="admin-fix-fields">
                    <div>
                      <div style={subLabel}>SCORE (Q1 + Q3)</div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          marginTop: 3,
                        }}
                      >
                        <input
                          type="number"
                          min={0}
                          placeholder="A"
                          value={d.scoreA}
                          onChange={(e) =>
                            setResultDraft(m, { scoreA: e.target.value })
                          }
                          style={{ ...cellInput, width: 50 }}
                        />
                        <span
                          style={{
                            color: "var(--off)",
                            fontFamily: "var(--font-cond)",
                            fontWeight: 700,
                          }}
                        >
                          –
                        </span>
                        <input
                          type="number"
                          min={0}
                          placeholder="B"
                          value={d.scoreB}
                          onChange={(e) =>
                            setResultDraft(m, { scoreB: e.target.value })
                          }
                          style={{ ...cellInput, width: 50 }}
                        />
                      </div>
                    </div>

                    <div>
                      <div style={subLabel}>FIRST SCORER (Q2)</div>
                      <select
                        value={d.firstScorer}
                        onChange={(e) =>
                          setResultDraft(m, { firstScorer: e.target.value })
                        }
                        style={{ ...cellSelect, marginTop: 3, width: "100%" }}
                      >
                        <option value="">— not set —</option>
                        <option value={m.teamA}>{m.teamA}</option>
                        <option value={m.teamB}>{m.teamB}</option>
                        <option value="No Goal">No Goal</option>
                      </select>
                    </div>

                    <div>
                      <div style={subLabel}>TOTAL CARDS (Q4)</div>
                      <input
                        type="number"
                        min={0}
                        placeholder="—"
                        value={d.totalCards}
                        onChange={(e) =>
                          setResultDraft(m, { totalCards: e.target.value })
                        }
                        style={{ ...cellInput, width: "100%", marginTop: 3 }}
                      />
                    </div>

                    <button
                      className="wsubmit"
                      style={{ marginLeft: 0 }}
                      disabled={savingId === m.id}
                      onClick={() => saveResult(m)}
                    >
                      {savingId === m.id ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>

      <div className="lform" style={{ marginBottom: "1.5rem" }}>
        <div className="lform-title" style={{ color: "var(--mex2)" }}>
          ADD FIXTURE
        </div>
        <div className="fg">
          <label className="flabel">Team A</label>
          <input
            className="finput"
            placeholder="e.g. Brazil"
            value={newFix.nameA}
            onChange={(e) => setNewFix({ ...newFix, nameA: e.target.value })}
          />
        </div>
        <div className="fg">
          <label className="flabel">Team B</label>
          <input
            className="finput"
            placeholder="e.g. Germany"
            value={newFix.nameB}
            onChange={(e) => setNewFix({ ...newFix, nameB: e.target.value })}
          />
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div className="fg">
            <label className="flabel">Phase</label>
            <select
              className="finput"
              style={{ cursor: "pointer" }}
              value={newFix.phase}
              onChange={(e) =>
                setNewFix({
                  ...newFix,
                  phase: e.target.value as "group" | "knockout",
                })
              }
            >
              <option value="group">Group Stage</option>
              <option value="knockout">Knockout</option>
            </select>
          </div>
        </div>
        <div className="fg">
          <label className="flabel">Group / Round</label>
          <input
            className="finput"
            placeholder="A, B, R16, QF…"
            value={newFix.group}
            onChange={(e) => setNewFix({ ...newFix, group: e.target.value })}
          />
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div className="fg">
            <label className="flabel">Betting Opens (your local tz)</label>
            <input
              className="finput"
              type="datetime-local"
              value={newFix.startTime}
              onChange={(e) =>
                setNewFix({ ...newFix, startTime: e.target.value })
              }
            />
          </div>
          <div className="fg">
            <label className="flabel">Betting Closes (your local tz)</label>
            <input
              className="finput"
              type="datetime-local"
              value={newFix.endTime}
              onChange={(e) =>
                setNewFix({ ...newFix, endTime: e.target.value })
              }
            />
          </div>
        </div>
        <button
          className="btn-gold"
          style={{ width: "100%" }}
          disabled={addingFix}
          onClick={addFixture}
        >
          {addingFix ? "Adding…" : "Add Fixture"}
        </button>
      </div>
      </>}

      {adminTab === 'trivia' && <>
      {/* ─── Trivia (Subsystem B): per-phase answer windows ─── */}
      <div
        className="lform"
        style={{ marginBottom: "1.5rem", maxWidth: "none" }}
      >
        <div className="lform-title" style={{ color: "var(--gold)" }}>
          TRIVIA — PHASE WINDOWS
        </div>
        <p
          style={{
            color: "var(--off)",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: "1rem",
          }}
        >
          One open/close window per phase, shared by every question in it.
          Players can answer a phase's questions only while now is inside its
          window. Enter times in your local timezone; stored as UTC.
        </p>

        {/* Create new phase */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: "1rem", flexWrap: "wrap" }}>
          <div className="fg" style={{ flex: 1, minWidth: 180, marginBottom: 0 }}>
            <label className="flabel">New Phase Name</label>
            <input
              className="finput"
              placeholder="e.g. Group Stage, R32, QF…"
              value={newPhaseName}
              onChange={(e) => setNewPhaseName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createPhase(); }}
            />
          </div>
          <button
            className="wsubmit"
            style={{ marginLeft: 0, whiteSpace: "nowrap" }}
            disabled={addingPhase}
            onClick={createPhase}
          >
            {addingPhase ? "Adding…" : "+ Create Phase"}
          </button>
        </div>

        {phaseWindows.length === 0 && (
          <p style={{ color: "var(--off)", fontSize: 13, marginBottom: "1rem" }}>
            No phases yet. Create one above.
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 8 }}>
          {phaseWindows.map(({ phase, name: phaseName }) => {
            const d = pwDraftFor(phase);
            const subLabel = {
              fontFamily: "var(--font-cond)",
              fontSize: 11,
              color: "var(--gold2)",
              letterSpacing: ".5px",
            };
            const cellInput = {
              background: "rgba(255,255,255,.06)",
              border: "1px solid var(--border)",
              color: "var(--white)",
              fontFamily: "var(--font-cond)",
              fontSize: 14,
              padding: "4px 8px",
              borderRadius: 5,
            };
            return (
              <div
                key={phase}
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "12px 14px",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-cond)",
                    fontSize: 14,
                    fontWeight: 700,
                    marginBottom: 10,
                  }}
                >
                  {phaseName || `Phase ${phase}`}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: 10,
                    alignItems: "end",
                  }}
                >
                  <div>
                    <div style={subLabel}>OPENS (your local tz)</div>
                    <input
                      type="datetime-local"
                      value={d.startTime}
                      onChange={(e) =>
                        setPwDraft(phase, { startTime: e.target.value })
                      }
                      style={{ ...cellInput, width: "100%", marginTop: 3 }}
                    />
                  </div>
                  <div>
                    <div style={subLabel}>CLOSES (your local tz)</div>
                    <input
                      type="datetime-local"
                      value={d.endTime}
                      onChange={(e) =>
                        setPwDraft(phase, { endTime: e.target.value })
                      }
                      style={{ ...cellInput, width: "100%", marginTop: 3 }}
                    />
                  </div>
                  <button
                    className="wsubmit"
                    style={{ marginLeft: 0 }}
                    disabled={savingPhase === phase}
                    onClick={() => savePhaseWindow(phase)}
                  >
                    {savingPhase === phase ? "Saving…" : "Save Window"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Trivia (Subsystem B): per-question settling ─── */}
      <div
        className="lform"
        style={{ marginBottom: "1.5rem", maxWidth: "none" }}
      >
        <div className="lform-title" style={{ color: "var(--gold)" }}>
          TRIVIA — SETTLE
        </div>
        {questions.length === 0 ? (
          <p style={{ color: "var(--off)", fontSize: 13 }}>
            No questions yet. Add one below.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {questions.map((q) => {
              const d = qDraftFor(q);
              return (
                <div
                  key={q.id}
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-cond)",
                          fontSize: 14,
                          fontWeight: 700,
                        }}
                      >
                        {q.text}
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-cond)",
                          fontSize: 12,
                          color: "var(--off)",
                          marginTop: 2,
                        }}
                      >
                        Phase {q.phase} · {q.pointValue} pt{q.pointValue === 1 ? "" : "s"}
                        {" · "}{q.questionType}
                        {q.maxSelections ? ` · pick-${q.maxSelections}` : ""}
                        {q.options ? ` · ${q.options.length} options` : ""}
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: 8,
                      alignItems: "end",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-cond)",
                          fontSize: 11,
                          color: "var(--gold2)",
                          letterSpacing: ".5px",
                          marginBottom: 3,
                        }}
                      >
                        WINNING ANSWER
                      </div>
                      {q.options ? (
                        <select
                          value={d.winningAnswer}
                          onChange={(e) =>
                            setQDraft(q, { winningAnswer: e.target.value })
                          }
                          style={{
                            background: "rgba(255,255,255,.06)",
                            border: "1px solid var(--border)",
                            color: "var(--white)",
                            fontFamily: "var(--font-cond)",
                            fontSize: 13,
                            padding: "5px 8px",
                            borderRadius: 5,
                            cursor: "pointer",
                            width: "100%",
                          }}
                        >
                          <option value="">— not set —</option>
                          {q.options.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          placeholder="exact answer"
                          value={d.winningAnswer}
                          onChange={(e) =>
                            setQDraft(q, { winningAnswer: e.target.value })
                          }
                          style={{
                            background: "rgba(255,255,255,.06)",
                            border: "1px solid var(--border)",
                            color: "var(--white)",
                            fontFamily: "var(--font-cond)",
                            fontSize: 13,
                            padding: "5px 8px",
                            borderRadius: 5,
                            width: "100%",
                          }}
                        />
                      )}
                    </div>
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-cond)",
                          fontSize: 11,
                          color: "var(--gold2)",
                          letterSpacing: ".5px",
                          marginBottom: 3,
                        }}
                      >
                        STATUS
                      </div>
                      <div
                        style={{
                          fontFamily: "var(--font-cond)",
                          fontSize: 13,
                          fontWeight: 700,
                          padding: "5px 0",
                          color:
                            q.status === "settled" ? "#2ecc71" : "var(--off)",
                        }}
                      >
                        {q.status === "settled"
                          ? "✓ Settled"
                          : "Awaiting result"}
                      </div>
                    </div>
                    <button
                      className="wsubmit"
                      style={{ marginLeft: 0, alignSelf: "end" }}
                      disabled={savingQId === q.id}
                      onClick={() => settleQuestion(q)}
                    >
                      {savingQId === q.id
                        ? "Saving…"
                        : q.status === "settled"
                          ? "Re-score"
                          : "Settle & Score"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="lform" style={{ marginBottom: "1.5rem" }}>
        <div className="lform-title" style={{ color: "var(--mex2)" }}>
          ADD TRIVIA QUESTION
        </div>
        <div className="fg">
          <label className="flabel">Question Text</label>
          <input
            className="finput"
            placeholder="e.g. Top scoring group-stage team?"
            value={newQ.text}
            onChange={(e) => setNewQ({ ...newQ, text: e.target.value })}
          />
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
        >
          <div className="fg">
            <label className="flabel">Phase</label>
            <select
              className="finput"
              style={{ cursor: "pointer" }}
              value={newQ.phase || ""}
              onChange={(e) =>
                setNewQ({ ...newQ, phase: Number(e.target.value) })
              }
            >
              <option value="">— select phase —</option>
              {phaseWindows.map(pw => (
                <option key={pw.phase} value={pw.phase}>
                  Phase {pw.phase} · {pw.name || "(unnamed)"}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="flabel">Point Value</label>
            <input
              className="finput"
              type="number"
              min={1}
              value={newQ.pointValue}
              onChange={(e) => setNewQ({ ...newQ, pointValue: e.target.value })}
            />
          </div>
        </div>
        <div className="fg">
          <label className="flabel">Question Type</label>
          <select
            className="finput"
            style={{ cursor: "pointer" }}
            value={newQ.questionType}
            onChange={(e) => setNewQ({ ...newQ, questionType: e.target.value, optionsRaw: "", maxSelectionsRaw: "" })}
          >
            <option value="option-buttons">Option Buttons (radio-style)</option>
            <option value="comma-teams">Comma-separated Teams</option>
            <option value="free-text">Free Text</option>
            <option value="free-text-multi">Free Text – Multiple Correct Answers</option>
          </select>
        </div>
        {newQ.questionType === "option-buttons" && (
          <div className="fg">
            <label className="flabel">Options (comma-separated)</label>
            <input
              className="finput"
              placeholder="e.g. Brazil, Argentina, France, Germany"
              value={newQ.optionsRaw}
              onChange={(e) => setNewQ({ ...newQ, optionsRaw: e.target.value })}
            />
          </div>
        )}
        {newQ.questionType === "comma-teams" && (
          <div className="fg">
            <label className="flabel">Number of Teams (shown as hint to users)</label>
            <input
              className="finput"
              type="number"
              min={2}
              placeholder="e.g. 8"
              value={newQ.maxSelectionsRaw}
              onChange={(e) => setNewQ({ ...newQ, maxSelectionsRaw: e.target.value })}
            />
          </div>
        )}
        <button
          className="btn-gold"
          style={{ width: "100%" }}
          disabled={addingQ}
          onClick={addQuestion}
        >
          {addingQ ? "Adding…" : "Add Question"}
        </button>
      </div>
      </>}

      {adminTab === 'brackets' && <>
      {/* ─── Bracket submission windows (both phases) ─── */}
      <div
        className="lform"
        style={{ marginBottom: "1.5rem", maxWidth: "none" }}
      >
        <div className="lform-title" style={{ color: "var(--gold)" }}>
          BRACKET — SUBMISSION WINDOWS
        </div>
        <p style={{ color: "var(--off)", fontSize: 13, lineHeight: 1.6, marginBottom: "1rem" }}>
          Phase 1 (group standings) uses one window. Each knockout round has its own window — R32 closes before R32 matches, R16 opens after R32 settles, etc.
        </p>

        {/* Phase 1 window */}
        {(() => {
          const phase = 1;
          const d = bpwDraftFor(phase);
          const subLabel = { fontFamily: "var(--font-cond)", fontSize: 11, color: "var(--gold2)", letterSpacing: ".5px" };
          const cellInput = { background: "rgba(255,255,255,.06)", border: "1px solid var(--border)", color: "var(--white)", fontFamily: "var(--font-cond)", fontSize: 14, padding: "4px 8px", borderRadius: 5 };
          return (
            <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ fontFamily: "var(--font-cond)", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Phase {phase} · Group Stage</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, alignItems: "end" }}>
                <div>
                  <div style={subLabel}>OPENS (your local tz)</div>
                  <input type="datetime-local" value={d.startTime} onChange={(e) => setBpwDraft(phase, { startTime: e.target.value })} style={{ ...cellInput, width: "100%", marginTop: 3 }} />
                </div>
                <div>
                  <div style={subLabel}>CLOSES (your local tz)</div>
                  <input type="datetime-local" value={d.endTime} onChange={(e) => setBpwDraft(phase, { endTime: e.target.value })} style={{ ...cellInput, width: "100%", marginTop: 3 }} />
                </div>
                <button className="wsubmit" style={{ marginLeft: 0 }} disabled={savingBracketPhase === phase} onClick={() => saveBracketPhaseWindow(phase)}>
                  {savingBracketPhase === phase ? "Saving…" : "Save Window"}
                </button>
              </div>
            </div>
          );
        })()}

        {/* Per-round knockout windows */}
        <div style={{ marginTop: 12, marginBottom: 6, fontFamily: "var(--font-cond)", fontSize: 12, color: "var(--gold2)", letterSpacing: ".5px" }}>KNOCKOUT ROUND WINDOWS</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 8 }}>
          {(['r32', 'r16', 'qf', 'sf', 'final'] as const).map((round) => {
            const d = rwDraftFor(round);
            const subLabel = { fontFamily: "var(--font-cond)", fontSize: 11, color: "var(--gold2)", letterSpacing: ".5px" };
            const cellInput = { background: "rgba(255,255,255,.06)", border: "1px solid var(--border)", color: "var(--white)", fontFamily: "var(--font-cond)", fontSize: 14, padding: "4px 8px", borderRadius: 5 };
            return (
              <div key={round} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontFamily: "var(--font-cond)", fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{KNOCKOUT_ROUND_LABEL[round]}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, alignItems: "end" }}>
                  <div>
                    <div style={subLabel}>OPENS</div>
                    <input type="datetime-local" value={d.startTime} onChange={(e) => setRwDraft(round, { startTime: e.target.value })} style={{ ...cellInput, width: "100%", marginTop: 3 }} />
                  </div>
                  <div>
                    <div style={subLabel}>CLOSES</div>
                    <input type="datetime-local" value={d.endTime} onChange={(e) => setRwDraft(round, { endTime: e.target.value })} style={{ ...cellInput, width: "100%", marginTop: 3 }} />
                  </div>
                  <button className="wsubmit" style={{ marginLeft: 0 }} disabled={savingRound === round} onClick={() => saveRoundWindow(round)}>
                    {savingRound === round ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Phase 1: import group standings via CSV ─── */}
      <div className="lform" style={{ marginBottom: "1.5rem" }}>
        <div className="lform-title" style={{ color: "var(--gold)" }}>
          GROUP STANDINGS — IMPORT
        </div>
        <p
          style={{
            color: "var(--off)",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: "0.75rem",
          }}
        >
          CSV format — header row required, teams pipe-separated:
          <br />
          <code style={{ color: "var(--gold2)", fontSize: 12 }}>
            group,teams
          </code>
          <br />
          <code style={{ color: "var(--gold2)", fontSize: 12 }}>
            A,Brazil|Argentina|Mexico|Serbia
          </code>
        </p>
        <div className="fg">
          <label className="flabel">Upload file</label>
          <input
            type="file"
            accept=".csv,text/csv"
            style={{ color: "var(--off)", fontSize: 13, marginBottom: 8 }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = (ev) => {
                const text = ev.target?.result as string;
                setCsvText(text);
                parseCsv(text);
              };
              reader.readAsText(file);
            }}
          />
          <label className="flabel" style={{ marginTop: 4 }}>
            Or paste CSV
          </label>
          <textarea
            className="finput"
            rows={6}
            placeholder={
              "group,teams\nA,Brazil|Argentina|Mexico|Serbia\nB,England|USA|Iran|Wales"
            }
            value={csvText}
            onChange={(e) => {
              setCsvText(e.target.value);
              parseCsv(e.target.value);
            }}
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              resize: "vertical",
            }}
          />
        </div>
        {csvPreview.length > 0 && (
          <div style={{ marginBottom: "0.75rem" }}>
            <div
              style={{
                fontFamily: "var(--font-cond)",
                fontSize: 11,
                color: "var(--gold2)",
                letterSpacing: ".5px",
                marginBottom: 6,
              }}
            >
              PREVIEW — {csvPreview.length} GROUP(S)
            </div>
            <div style={{ display: "grid", gap: 4 }}>
              {csvPreview.map((r, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "var(--font-cond)",
                    fontSize: 12,
                    color: "var(--off)",
                    background: "rgba(255,255,255,.04)",
                    borderRadius: 4,
                    padding: "4px 8px",
                  }}
                >
                  <strong style={{ color: "var(--white)" }}>
                    Group {r.groupName}
                  </strong>{" "}
                  — {r.teams.split("|").join(", ")}
                </div>
              ))}
            </div>
          </div>
        )}
        <button
          className="btn-gold"
          style={{ width: "100%" }}
          disabled={importing || csvPreview.length === 0}
          onClick={importGroups}
        >
          {importing
            ? "Importing…"
            : `Import ${csvPreview.length || ""} Group(s)`}
        </button>
      </div>

      {/* ─── Phase 1: settle groups ─── */}
      <div
        className="lform"
        style={{ marginBottom: "1.5rem", maxWidth: "none" }}
      >
        <div className="lform-title" style={{ color: "var(--gold)" }}>
          GROUP STANDINGS — SETTLE
        </div>
        {groupEntries.length === 0 ? (
          <p style={{ color: "var(--off)", fontSize: 13 }}>
            No groups imported yet.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
            {groupEntries.map((g) => {
              const teams = g.teams.split("|");
              const d = groupSettleDraftFor(g);
              const sel = {
                background: "rgba(255,255,255,.06)",
                border: "1px solid var(--border)",
                color: "var(--white)",
                fontFamily: "var(--font-cond)",
                fontSize: 13,
                padding: "5px 8px",
                borderRadius: 5,
                cursor: "pointer",
                width: "100%",
              };
              return (
                <div
                  key={g.id}
                  style={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "12px 14px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "var(--font-cond)",
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      Group {g.groupName}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-cond)",
                        fontSize: 12,
                        color:
                          g.status === "settled" ? "#2ecc71" : "var(--off)",
                      }}
                    >
                      {g.status === "settled"
                        ? `✓ Settled — ${g.correctRanking?.split("|").join(" › ")}`
                        : "Awaiting result"}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(130px, 1fr))",
                      gap: 8,
                      alignItems: "end",
                    }}
                  >
                    {["1st", "2nd", "3rd", "4th"].map((pos, i) => (
                      <div key={pos}>
                        <div
                          style={{
                            fontFamily: "var(--font-cond)",
                            fontSize: 11,
                            color: "var(--gold2)",
                            letterSpacing: ".5px",
                            marginBottom: 3,
                          }}
                        >
                          {pos.toUpperCase()}
                        </div>
                        <select
                          style={sel}
                          value={d.positions[i]}
                          onChange={(ev) => {
                            const next = [...d.positions];
                            next[i] = ev.target.value;
                            setGroupSettleDrafts((prev) => ({
                              ...prev,
                              [g.id]: { positions: next },
                            }));
                          }}
                        >
                          <option value="">— pick —</option>
                          {teams.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button
                      className="wsubmit"
                      style={{ marginLeft: 0, alignSelf: "end" }}
                      disabled={savingGroupId === g.id}
                      onClick={() => settleGroup(g)}
                    >
                      {savingGroupId === g.id
                        ? "Saving…"
                        : g.status === "settled"
                          ? "Re-score"
                          : "Settle & Score"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Phase 2: knockout entries — settle ─── */}
      <div
        className="lform"
        style={{ marginBottom: "1.5rem", maxWidth: "none" }}
      >
        <div className="lform-title" style={{ color: "var(--gold)" }}>
          KNOCKOUT (PHASE 2) — SETTLE
        </div>
        {bracketEntries.length === 0 ? (
          <p style={{ color: "var(--off)", fontSize: 13 }}>
            No knockout entries yet. Add one below.
          </p>
        ) : (
          (() => {
            const SETTLE_ROUND_ORDER = ['r32', 'r16', 'qf', 'sf', 'final', 'third', 'champion', ''];
            const grouped: Record<string, BracketEntry[]> = {};
            for (const e of bracketEntries) {
              const key = e.round || '';
              if (!grouped[key]) grouped[key] = [];
              grouped[key].push(e);
            }
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {SETTLE_ROUND_ORDER.filter(r => grouped[r]?.length).map(round => (
                  <div key={round}>
                    <div style={{ fontFamily: "var(--font-cond)", fontSize: 11, color: "var(--gold2)", letterSpacing: ".5px", marginBottom: 8 }}>
                      {round ? (KNOCKOUT_ROUND_LABEL[round] ?? round.toUpperCase()) : 'NO ROUND SET'}
                      <span style={{ color: "var(--off)", marginLeft: 8, fontWeight: 400 }}>
                        {grouped[round].filter(e => e.status === 'settled').length}/{grouped[round].length} settled
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 8 }}>
                      {grouped[round].sort((a, b) => a.sortOrder - b.sortOrder).map((e) => {
                        const d = beDraftFor(e);
                        return (
                          <div key={e.id} style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px" }}>
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontFamily: "var(--font-cond)", fontSize: 14, fontWeight: 700 }}>
                                {e.label}
                              </div>
                              <div style={{ fontFamily: "var(--font-cond)", fontSize: 12, color: "var(--off)", marginTop: 2 }}>
                                teams: {e.teams.length ? e.teams.join(" vs ") : "TBD"}
                              </div>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8, alignItems: "end" }}>
                              <div>
                                <div style={{ fontFamily: "var(--font-cond)", fontSize: 11, color: "var(--gold2)", letterSpacing: ".5px", marginBottom: 3 }}>CORRECT TEAM</div>
                                <select
                                  value={d.correctPick}
                                  onChange={(ev) => setBeDraft(e, { correctPick: ev.target.value })}
                                  style={{ background: "rgba(255,255,255,.06)", border: "1px solid var(--border)", color: "var(--white)", fontFamily: "var(--font-cond)", fontSize: 13, padding: "5px 8px", borderRadius: 5, cursor: "pointer", width: "100%" }}
                                >
                                  <option value="">— not set —</option>
                                  {e.teams.map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                              </div>
                              <div>
                                <div style={{ fontFamily: "var(--font-cond)", fontSize: 11, color: "var(--gold2)", letterSpacing: ".5px", marginBottom: 3 }}>STATUS</div>
                                <div style={{ fontFamily: "var(--font-cond)", fontSize: 13, fontWeight: 700, padding: "5px 0", color: e.status === "settled" ? "#2ecc71" : "var(--off)" }}>
                                  {e.status === "settled" ? `✓ ${e.correctPick}` : "Awaiting result"}
                                </div>
                              </div>
                              <button
                                className="wsubmit"
                                style={{ marginLeft: 0, alignSelf: "end" }}
                                disabled={savingBEId === e.id}
                                onClick={() => settleBracketEntry(e)}
                              >
                                {savingBEId === e.id ? "Saving…" : e.status === "settled" ? "Re-score" : "Settle & Score"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>

      {/* ─── Phase 2: knockout entries — add ─── */}
      <div className="lform" style={{ marginBottom: "1.5rem" }}>
        <div className="lform-title" style={{ color: "var(--mex2)" }}>
          KNOCKOUT (PHASE 2) — ADD ENTRY
        </div>
        <div className="fg">
          <label className="flabel">Round</label>
          <select
            className="finput"
            value={newBE.round}
            onChange={(e) => setNewBE({ ...newBE, round: e.target.value })}
            style={{ background: 'var(--card)', color: 'var(--white)', cursor: 'pointer' }}
          >
            {KNOCKOUT_ROUNDS.map(r => (
              <option key={r} value={r}>{KNOCKOUT_ROUND_LABEL[r]}</option>
            ))}
          </select>
        </div>
        <div className="fg">
          <label className="flabel">Label</label>
          <input
            className="finput"
            placeholder="e.g. Match 1"
            value={newBE.label}
            onChange={(e) => setNewBE({ ...newBE, label: e.target.value })}
          />
        </div>
        <div className="fg">
          <label className="flabel">Sort Order (within round, 0-based)</label>
          <input
            className="finput"
            type="number"
            min={0}
            value={newBE.sortOrder}
            onChange={(e) => setNewBE({ ...newBE, sortOrder: e.target.value })}
          />
        </div>
        <div className="fg">
          <label className="flabel">Teams (comma-separated, leave blank for auto-populate)</label>
          <input
            className="finput"
            placeholder="e.g. Brazil, Argentina"
            value={newBE.teamsRaw}
            onChange={(e) => setNewBE({ ...newBE, teamsRaw: e.target.value })}
          />
        </div>
        <button
          className="btn-gold"
          style={{ width: "100%" }}
          disabled={addingBE}
          onClick={addBracketEntry}
        >
          {addingBE ? "Adding…" : "Add Knockout Entry"}
        </button>
      </div>
      </>}

      {adminTab === 'admin' && <>
      {/* ─── Password reset ─── */}
      <div className="lform" style={{ marginBottom: "1.5rem" }}>
        <div className="lform-title" style={{ color: "var(--gold)" }}>
          RESET USER PASSWORD
        </div>
        <div className="fg">
          <label className="flabel">User</label>
          <select
            className="finput"
            value={resetUserId}
            onChange={(e) => setResetUserId(e.target.value === "" ? "" : Number(e.target.value))}
            style={{ background: "var(--card)", color: "var(--white)", cursor: "pointer" }}
          >
            <option value="">— select player —</option>
            {allUsers.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="fg">
          <label className="flabel">New Password</label>
          <input
            className="finput"
            type="text"
            placeholder="Min 4 characters"
            value={resetPwd}
            onChange={(e) => setResetPwd(e.target.value)}
          />
        </div>
        <button
          className="btn-gold"
          style={{ width: "100%" }}
          disabled={resetting}
          onClick={handleResetPassword}
        >
          {resetting ? "Updating…" : "Reset Password →"}
        </button>
      </div>

      <div className="lform">
        <div className="lform-title" style={{ color: "var(--can2)" }}>
          DANGER ZONE
        </div>
        <p
          style={{
            color: "var(--off)",
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: "1rem",
          }}
        >
          Testing-phase utilities. Both are destructive.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn-outline" onClick={seedFixtures}>
            📋 Seed Sample Fixtures
          </button>
          <button
            className="btn-outline"
            style={{ borderColor: "var(--can)", color: "var(--can2)" }}
            onClick={reset}
          >
            ⚠ Reset All Data
          </button>
        </div>
      </div>
      </>}
    </section>
  );
}
