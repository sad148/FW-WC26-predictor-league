"use client";

import { useEffect, useState } from "react";
import { api, type LeaderboardRow } from "@/lib/api";
import { useAuth } from "../providers";

type RankDelta = "up" | "down" | "same" | "new";

function storageKey(leagueId: number | null) {
  return `lb_prev_ranks_${leagueId ?? "all"}`;
}

function loadPrev(leagueId: number | null): Record<string, number> {
  try {
    const raw = localStorage.getItem(storageKey(leagueId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function savePrev(leagueId: number | null, ranks: Record<string, number>) {
  try { localStorage.setItem(storageKey(leagueId), JSON.stringify(ranks)); } catch { /* ignore */ }
}

function computeDeltas(rows: LeaderboardRow[], prev: Record<string, number>): Record<string, RankDelta> {
  const out: Record<string, RankDelta> = {};
  rows.forEach((r, i) => {
    const cur = i + 1;
    const old = prev[r.playerId];
    if (old === undefined) out[r.playerId] = "new";
    else if (cur < old)    out[r.playerId] = "up";
    else if (cur > old)    out[r.playerId] = "down";
    else                   out[r.playerId] = "same";
  });
  return out;
}

const AV_COLORS = [
  "#4A90D9",
  "#E61D25",
  "#C9A84C",
  "#00a86b",
  "#9B59B6",
  "#1ABC9C",
  "#E67E22",
  "#7F8C8D",
];

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .map((s) => s[0] || "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "??"
  );
}
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

export default function LeaderboardPage() {
  const { user, activeLeagueId } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [deltas, setDeltas] = useState<Record<string, RankDelta>>({});
  const leagueId = activeLeagueId;

  useEffect(() => {
    api.leaderboard().then((r) => {
      const current = r.leaderboard;
      const prev = loadPrev(leagueId);
      setDeltas(computeDeltas(current, prev));
      const next: Record<string, number> = {};
      current.forEach((row, i) => { next[row.playerId] = i + 1; });
      savePrev(leagueId, next);
      setRows(current);
    }).catch(() => {});
  }, [leagueId]);

  return (
    <section>
      <div className="sh">
        <div className="sh-title">LEADERBOARD</div>
        <div className="sh-sub">
          Ranked by Total Pts · Tiebreaker: wallet
        </div>
      </div>
      <div className="lb-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th style={{ width: 42 }}>#</th>
              <th>Player</th>
              <th>Coins</th>
              <th>Trivia</th>
              <th>Bracket</th>
              <th>Penalty</th>
              <th>Total Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="ei">🏆</div>
                    <h3>No players yet</h3>
                    <p>Register on Account to be the first.</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((p, i) => {
                const rc =
                  i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : "rn";
                const isMe = p.playerId === user?.playerId;
                const color = colorFor(p.name);
                return (
                  <tr key={p.playerId} className={isMe ? "me-row" : ""}>
                    <td>
                      <span className={`rank ${rc}`}>{i + 1}</span>
                      {deltas[p.playerId] === "up" && (
                        <span style={{ fontSize: 10, color: "#2ecc71", marginLeft: 3, verticalAlign: "middle" }}>▲</span>
                      )}
                      {deltas[p.playerId] === "down" && (
                        <span style={{ fontSize: 10, color: "var(--can2)", marginLeft: 3, verticalAlign: "middle" }}>▼</span>
                      )}
                    </td>
                    <td>
                      <div className="p-row">
                        <div
                          className="av"
                          style={{ background: `${color}22`, color }}
                        >
                          {initials(p.name)}
                        </div>
                        <span>{p.name}</span>
                        {isMe && <span className="me-tag">YOU</span>}
                      </div>
                    </td>
                    <td className="wallet-cell">{p.wallet}</td>
                    <td
                      style={{
                        fontFamily: "var(--font-cond)",
                        fontSize: 13,
                        color: "var(--gold2)",
                      }}
                    >
                      {p.triviaPts ?? 0}
                    </td>
                    <td
                      style={{
                        fontFamily: "var(--font-cond)",
                        fontSize: 13,
                        color: "var(--mex2)",
                      }}
                    >
                      {p.bracketPts ?? 0}
                    </td>
                    <td
                      style={{
                        fontFamily: "var(--font-cond)",
                        fontSize: 13,
                        color: p.bailoutPenalty > 0 ? "var(--can2)" : "var(--off)",
                      }}
                    >
                      {p.bailoutPenalty > 0 ? `−${p.bailoutPenalty}` : "—"}
                    </td>
                    <td className="pts-cell">{p.totalPts ?? p.wallet}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
