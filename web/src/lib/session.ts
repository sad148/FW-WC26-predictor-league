import { cookies } from "next/headers";
import { getIronSession, SessionOptions } from "iron-session";
import { HttpError } from "./errors";

export interface SessionData {
  userId?:         number;
  name?:           string;
  isAdmin?:        boolean;
  activeLeagueId?: number;
}

if (!process.env.SESSION_PASSWORD) {
  throw new Error("SESSION_PASSWORD is not set (must be 32+ characters).");
}

const sessionOptions: SessionOptions = {
  password: process.env.SESSION_PASSWORD,
  cookieName: "wc26_session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  },
};

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/** Throws 401 if no logged-in user. */
export async function requireUser() {
  const session = await getSession();
  if (!session.userId) throw new HttpError(401, "Not logged in.");
  return session;
}

/** Throws 401 if no logged-in user, 400 if no active league selected. */
export async function requireActiveLeague() {
  const session = await requireUser();
  if (!session.activeLeagueId) {
    throw new HttpError(400, "No active league selected. Please choose a league first.");
  }
  return session as typeof session & { activeLeagueId: number };
}

/** Throws 401 if admin flag is not set in the session. */
export async function requireAdmin() {
  const session = await getSession();
  if (!session.isAdmin) throw new HttpError(401, "Admin login required.");
  return session;
}
