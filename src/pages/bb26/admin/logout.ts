export const prerender = false;

import type { APIRoute } from "astro";
import { clearCookie } from "../../../lib/admin-auth";

// Clear the admin session and return to the sign-in screen. POST-only so a
// prefetch or stray GET can't sign the admin out.
export const POST: APIRoute = ({ request }) =>
  new Response(null, {
    status: 303,
    headers: {
      location: "/bb26/admin",
      "set-cookie": clearCookie(request),
    },
  });
