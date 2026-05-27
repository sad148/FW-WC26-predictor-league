import bcrypt from 'bcryptjs';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Legacy-compatible player_id slug — mirrors the Apps Script convention. */
export function playerIdFromName(name: string): string {
  return 'player_' + name.trim().toLowerCase().replace(/\s+/g, '_');
}
