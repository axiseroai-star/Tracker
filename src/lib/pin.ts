import "server-only";

import bcrypt from "bcryptjs";

/**
 * PIN hashing (§20a) — bcrypt, never plaintext. Kept in its own module so
 * lib/notion.ts (data plumbing) and lib/auth.ts (session/role) don't each
 * need their own opinion about hashing parameters.
 */

const SALT_ROUNDS = 10;

export function isValidPinFormat(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}
