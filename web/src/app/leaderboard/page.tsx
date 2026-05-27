'use client';

import { useEffect, useState } from 'react';
import { api, type LeaderboardRow } from '@/lib/api';
import { useAuth } from '../providers';

const AV_COLORS = ['#4A90D9','#E61D25','#C9A84C','#00a86b','#9B59B6','#1ABC9C','#E67E22','#7F8C8D'];

function initials(name: string) {
  return name.trim().split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase() || '??';
}
function colorFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_COLORS[h % AV_COLORS.length];
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LeaderboardRow[]>([]);

  useEffect(() => {
    api.leaderboard().then(r => setRows(r.leaderboard)).catch(() => {});
  }, []);

  return (
    <section>
      <div className="sh">
        <div className="sh-title">LEADERBOARD</div>
        <div className="sh-sub">Tiebreaker: total goals predicted correctly</div>
      </div>
      <div className="lb-wrap">
        <table className="lb-table">
          <thead>
            <tr>
              <th style={{ width: 42 }}>#</th>
              <th>Player</th>
              <th>W / L</th>
              <th>Wallet</th>
              <th>Total Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5}>
                <div className="empty-state">
                  <div className="ei">🏆</div>
                  <h3>No players yet</h3>
                  <p>Register on Account to be the first.</p>
                </div>
              </td></tr>
            ) : rows.map((p, i) => {
              const rc = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn';
              const isMe = p.playerId === user?.playerId;
              const color = colorFor(p.name);
              return (
                <tr key={p.playerId} className={isMe ? 'me-row' : ''}>
                  <td><span className={`rank ${rc}`}>{i + 1}</span></td>
                  <td>
                    <div className="p-row">
                      <div className="av" style={{ background: `${color}22`, color }}>{initials(p.name)}</div>
                      <span>{p.name}</span>
                      {isMe && <span className="me-tag">YOU</span>}
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-cond)', fontSize: 13, color: 'var(--off)' }}>{p.wins}W {p.losses}L</td>
                  <td className="wallet-cell">{p.wallet} pts</td>
                  <td className="pts-cell">{p.pts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
