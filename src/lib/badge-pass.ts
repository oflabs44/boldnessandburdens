// A light, DB-free "pass" proving a participant verified their identity
// (BB26 ID + last name) on /bb26/participant. It gates the badge page so
// sequential codes can't be enumerated to read everyone's room. Signed with
// HMAC (keyed on the admin secret) so the cookie can't be forged.
import { env } from "cloudflare:workers";

const COOKIE = "bb_badge";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days — covers the run-up + conference.

function secret(): string {
  return (env as unknown as { ADMIN_PASSWORD?: string }).ADMIN_PASSWORD ?? "";
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);

  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(value: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(value));

  return b64url(new Uint8Array(sig));
}

// Set-Cookie value that grants access to one participant's badge.
export async function passCookie(code: string, request: Request): Promise<string> {
  const token = `${code}.${await sign(code)}`;
  const secure = new URL(request.url).protocol === "https:" ? " Secure;" : "";

  return `${COOKIE}=${encodeURIComponent(token)}; Path=/bb26; HttpOnly;${secure} SameSite=Lax; Max-Age=${MAX_AGE}`;
}

// True if the request carries a valid, untampered pass for this exact code.
export async function hasPass(request: Request, code: string): Promise<boolean> {
  const raw = request.headers.get("cookie") ?? "";
  const m = raw.match(/(?:^|;\s*)bb_badge=([^;]+)/);

  if (!m) return false;

  const token = decodeURIComponent(m[1]);
  const dot = token.lastIndexOf(".");

  if (dot < 1) return false;

  const cookieCode = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (cookieCode !== code) return false;

  return sig === (await sign(code));
}
