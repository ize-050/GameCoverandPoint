import { createHmac, timingSafeEqual } from "node:crypto";
import { OAuth2Client } from "google-auth-library";

export interface AuthUser {
  id: string;
  displayName: string;
  email: string;
  picture: string;
  provider: "google";
}

interface SessionPayload {
  user: AuthUser;
  issuedAt: number;
  expiresAt: number;
}

const SESSION_TTL_SEC = 7 * 24 * 60 * 60;

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createAppSession(user: AuthUser, secret: string, nowSec = Math.floor(Date.now() / 1000)): string {
  if (!secret) throw new Error("AUTH_SECRET is required");
  const payload = encode({ user, issuedAt: nowSec, expiresAt: nowSec + SESSION_TTL_SEC } satisfies SessionPayload);
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyAppSession(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): AuthUser | null {
  if (!token || !secret) return null;
  const [payload, providedSignature, extra] = token.split(".");
  if (!payload || !providedSignature || extra) return null;
  const expected = Buffer.from(signature(payload, secret));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionPayload;
    if (!parsed.user?.id || parsed.user.provider !== "google" || parsed.expiresAt <= nowSec || parsed.issuedAt > nowSec + 60) return null;
    return parsed.user;
  } catch {
    return null;
  }
}

export async function verifyGoogleCredential(credential: string, clientId: string): Promise<AuthUser | null> {
  if (!credential || !clientId) return null;
  const ticket = await new OAuth2Client(clientId).verifyIdToken({ idToken: credential, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email || payload.email_verified !== true) return null;
  return {
    id: `google:${payload.sub}`,
    displayName: String(payload.name || payload.given_name || payload.email.split("@")[0]).slice(0, 40),
    email: payload.email,
    picture: payload.picture ?? "",
    provider: "google",
  };
}

export function getAuthConfig() {
  return {
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    authSecret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "clock-out-local-development-only"),
  };
}
