export const prerender = false;

import type { APIRoute } from "astro";
import { markAttendance } from "../../../lib/db";

// Self check-in from a participant's own badge. ADD-ONLY (can mark presence,
// never remove it) and only for TODAY — a participant checks in on the day they
// arrive. Corrections / other days are admin-only via /bb26/admin.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim();
  const day = String(form.get("day") ?? "").trim();

  if (!code || !day) {
    return new Response("Bad request", { status: 400 });
  }

  // Only the current Berlin date may be self-marked; other days are ignored.
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });

  if (day === today) {
    await markAttendance(code, day);
  }

  return new Response(null, {
    status: 303,
    headers: { location: `/bb26/${encodeURIComponent(code)}` },
  });
};
