// Minimal shared-password gate for the /bb26/admin area. Self-contained so it
// works in local dev and production alike. For SSO you can additionally put
// Cloudflare Access in front of /bb26/admin* — this gate stays as defence in depth.
//
// Set the password as a secret: `wrangler secret put ADMIN_PASSWORD` (prod) and
// in `.dev.vars` / `.env` for local dev.
import { env } from "cloudflare:workers";

const COOKIE_NAME = "bb_admin";
const MAX_AGE = 60 * 60 * 12; // 12h

function secret(): string {
  return (env as unknown as { ADMIN_PASSWORD?: string }).ADMIN_PASSWORD ?? "";
}

function readCookie(request: Request): string | null {
  const raw = request.headers.get("cookie") ?? "";
  const m = raw.match(/(?:^|;\s*)bb_admin=([^;]+)/);

  return m ? decodeURIComponent(m[1]) : null;
}

export function isConfigured(): boolean {
  return secret().length > 0;
}

export function isAuthed(request: Request): boolean {
  const s = secret();

  return s.length > 0 && readCookie(request) === s;
}

export function checkPassword(password: string): boolean {
  const s = secret();

  return s.length > 0 && password === s;
}

export function sessionCookie(request: Request): string {
  const secureFlag = new URL(request.url).protocol === "https:" ? " Secure;" : "";

  // Path=/ (not /bb26) so the cookie is also sent to Astro action endpoints at
  // /_actions/*, which the admin mutations (setAttendance, saveParticipant) gate on.
  return `${COOKIE_NAME}=${encodeURIComponent(secret())}; Path=/; HttpOnly;${secureFlag} SameSite=Lax; Max-Age=${MAX_AGE}`;
}

// Expire the session cookie (same Path=/ so it clears the one set above).
export function clearCookie(request: Request): string {
  const secureFlag = new URL(request.url).protocol === "https:" ? " Secure;" : "";

  return `${COOKIE_NAME}=; Path=/; HttpOnly;${secureFlag} SameSite=Lax; Max-Age=0`;
}
