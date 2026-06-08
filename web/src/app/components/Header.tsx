"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth, useToast } from "../providers";

const PLAYER_NAV = [
  { href: "/", label: "Home" },
  { href: "/matches", label: "Matches" },
  { href: "/trivia", label: "Trivia" },
  { href: "/brackets", label: "Bracket" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/mybets", label: "My Bets" },
  { href: "/account", label: "Account" },
];

const ADMIN_NAV = [
  { href: "/admin", label: "Admin" },
];

export function Header() {
  const pathname = usePathname();
  const { user, isAdmin, isLoading, wallet, leagues, activeLeagueId, switchLeague, refresh } = useAuth();
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const nav = isAdmin ? ADMIN_NAV : PLAYER_NAV;

  async function handleAdminLogout() {
    try {
      await api.adminLogout();
      await refresh();
      toast("Admin logged out");
    } catch (e) {
      toast("Error", (e as Error).message);
    }
  }

  const activeLeague = leagues.find(l => l.id === activeLeagueId);

  return (
    <header className="hdr">
      <div className="accent-bar" />
      <div className="hdr-bar">
        <Link className="logo-wrap" href="/">
          <span className="logo-trophy">🏆</span>
          <div>
            <div className="logo-text">FW PREDICTOR</div>
            <div className="logo-sub">
              {activeLeague ? activeLeague.name : "We Are 26"}
            </div>
          </div>
        </Link>
        <nav className="hdr-nav">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-btn${pathname === item.href ? " on" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Player chips — withheld until mounted+loaded to avoid hydration mismatch */}
        {mounted && !isLoading && user && !isAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* League switcher — only shown when user has multiple leagues */}
            {leagues.length > 1 && (
              <div style={{ position: 'relative' }}>
                <select
                  value={activeLeagueId ?? ''}
                  onChange={async (e) => {
                    const id = parseInt(e.target.value, 10);
                    if (!isNaN(id)) {
                      try { await switchLeague(id); }
                      catch (err) { toast('Error', (err as Error).message); }
                    }
                  }}
                  style={{
                    background: 'var(--card)', color: 'var(--fg)',
                    border: '1px solid var(--border)', borderRadius: 8,
                    padding: '4px 28px 4px 10px', fontSize: 12,
                    fontFamily: 'var(--font-cond)', cursor: 'pointer',
                    appearance: 'none', WebkitAppearance: 'none',
                  }}
                >
                  {leagues.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
                <span style={{
                  position: 'absolute', right: 8, top: '50%',
                  transform: 'translateY(-50%)', pointerEvents: 'none',
                  fontSize: 10, color: 'var(--off)',
                }}>▾</span>
              </div>
            )}
            <div className="wallet-chip">
              🪙 <b>{wallet ?? "—"}</b> coins
            </div>
          </div>
        )}

        {/* Admin chip */}
        {mounted && !isLoading && isAdmin && (
          <div
            className="admin-chip"
            onClick={handleAdminLogout}
            style={{ cursor: "pointer" }}
          >
            ⚙ Admin · Log out
          </div>
        )}
      </div>
    </header>
  );
}
