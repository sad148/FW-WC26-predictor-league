"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth, useToast } from "../providers";

// Nav shown to regular players and guests
const PLAYER_NAV = [
  { href: "/", label: "Home" },
  { href: "/matches", label: "Matches" },
  { href: "/trivia", label: "Trivia" },
  { href: "/brackets", label: "Bracket" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/mybets", label: "My Bets" },
  { href: "/account", label: "Account" },
];

// Nav shown to admins — no My Bets / Account (irrelevant for admin sessions)
const ADMIN_NAV = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/admin", label: "Admin" },
];

export function Header() {
  const pathname = usePathname();
  const { user, isAdmin, wallet, refresh } = useAuth();
  const { toast } = useToast();
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

  return (
    <header className="hdr">
      <div className="accent-bar" />
      <div className="hdr-bar">
        <Link className="logo-wrap" href="/">
          <span className="logo-trophy">🏆</span>
          <div>
            <div className="logo-text">FW PREDICTOR</div>
            <div className="logo-sub">We Are 26</div>
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
        {/* Wallet chip — players only */}
        {user && !isAdmin && (
          <div className="wallet-chip">
            🏅 <b>{wallet ?? "—"}</b> pts
          </div>
        )}
        {/* Admin chip — click to log out of admin session */}
        {isAdmin && (
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
