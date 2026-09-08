import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";

const COOKIE = "jm_session";
const alg = "HS256";

// Session lifetime (D). A stateless JWT can't be revoked before it expires, so
// keep the window short. 7 days balances "don't log in every visit" against the
// blast radius of a leaked/captured token. (Full revocation would require a
// server-side session/version check.)
const SESSION_DAYS = 7;

// A well-formed bcrypt hash of a throwaway value, used only to equalize login
// timing when no user matches (C). Comparing against this makes the "no such
// user" path spend roughly the same CPU as the "wrong password" path, so an
// attacker can't distinguish registered emails by response latency.
export const DUMMY_PASSWORD_HASH =
  "$2b$10$csOYnaGu4jEUwX1ok3euaOcsucr0d/3TR1pKvY7b/eQOGOWnFedve";

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

// Canonical form for an email so lookups and the unique constraint are
// case/whitespace-insensitive (B). Applied on both signup and login.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

// Verify a password against a user's hash, or — when the user doesn't exist
// (hash is null) — burn an equivalent bcrypt comparison against a dummy hash so
// the two paths take the same time (C). Always returns false for a missing user.
export async function verifyPasswordConstantTime(
  pw: string,
  hash: string | null | undefined
): Promise<boolean> {
  if (!hash) {
    await bcrypt.compare(pw, DUMMY_PASSWORD_HASH);
    return false;
  }
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// Returns the userId or null. Use in server components / route handlers.
export async function getUserId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentUser() {
  const id = await getUserId();
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}
