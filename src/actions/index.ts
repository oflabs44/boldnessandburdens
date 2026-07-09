import { defineAction, ActionError } from "astro:actions";
import { z } from "astro:schema";
import {
  setAttendance,
  updateParticipant,
  markAttendance,
  setArrived,
  createProgrammeRegistration,
} from "../lib/db";
import { isAuthed } from "../lib/admin-auth";

// Trim a form string; empty becomes null so the DB stores NULL, not "".
const clean = (v: string | undefined): string | null => {
  const s = (v ?? "").trim();

  return s.length ? s : null;
};

export const server = {
  // Admin: set or clear one day's attendance. The manage page calls this from
  // the client and reloads on success, so every server-rendered count stays in
  // sync (no in-place DOM drift).
  setAttendance: defineAction({
    accept: "json",
    input: z.object({
      code: z.string().min(1),
      day: z.string().min(1),
      present: z.boolean(),
    }),
    handler: async ({ code, day, present }, ctx) => {
      if (!isAuthed(ctx.request)) {
        throw new ActionError({ code: "FORBIDDEN", message: "Not signed in." });
      }

      await setAttendance(code, day, present);

      return { ok: true };
    },
  }),

  // Admin: set/clear a participant's overall conference arrival (checked_in).
  // Separate from per-day attendance — the roster "Check in" button calls this.
  setArrived: defineAction({
    accept: "json",
    input: z.object({
      code: z.string().min(1),
      arrived: z.boolean(),
    }),
    handler: async ({ code, arrived }, ctx) => {
      if (!isAuthed(ctx.request)) {
        throw new ActionError({ code: "FORBIDDEN", message: "Not signed in." });
      }

      await setArrived(code, arrived);

      return { ok: true };
    },
  }),

  // Admin: update a participant's editable details (form submission).
  saveParticipant: defineAction({
    accept: "form",
    input: z.object({
      code: z.string().min(1),
      room: z.string().optional(),
      group: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      city: z.string().optional(),
      staying_on_camp: z.boolean().optional(),
    }),
    handler: async (input, ctx) => {
      if (!isAuthed(ctx.request)) {
        throw new ActionError({ code: "FORBIDDEN", message: "Not signed in." });
      }

      await updateParticipant(input.code, {
        room: clean(input.room),
        group: clean(input.group),
        email: clean(input.email),
        phone: clean(input.phone),
        city: clean(input.city),
        stayingOnCamp: !!input.staying_on_camp,
      });

      return { ok: true };
    },
  }),

  // Public: programme registration (accommodation has closed). Anyone can
  // submit; the row lands in `programme_registrations`, kept apart from the
  // curated roster. On success the page redirects to /success (PRG).
  registerProgramme: defineAction({
    accept: "form",
    input: z.object({
      full_name: z.string().trim().min(1, "Please enter your full name."),
      email: z.string().trim().email("Please enter a valid email address."),
      phone: z.string().trim().min(1, "Please enter a phone number."),
      gender: z.enum(["female", "male"], {
        message: "Please select a gender.",
      }),
      city: z.string().optional(),
      program_acknowledged: z
        .boolean()
        .refine((v) => v, "Please confirm you have read the programme details."),
      photo_consent: z
        .boolean()
        .refine((v) => v, "Photo and video consent is required."),
      participation_consent: z
        .boolean()
        .refine((v) => v, "Participation consent is required."),
      consent_date: z.string().min(1, "Please provide a date."),
    }),
    handler: async (input) => {
      await createProgrammeRegistration({
        fullName: input.full_name,
        email: input.email.toLowerCase(),
        phone: clean(input.phone),
        gender: input.gender,
        city: clean(input.city),
        photoConsent: "yes",
        participationConsent: "yes",
        consentDate: input.consent_date,
      });

      return { ok: true };
    },
  }),

  // Public: a participant self-checks-in from their own badge. Add-only and
  // for TODAY only (the day they arrive).
  selfCheckIn: defineAction({
    accept: "form",
    input: z.object({
      code: z.string().min(1),
      day: z.string().min(1),
    }),
    handler: async ({ code, day }) => {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Berlin" });

      if (day === today) {
        await markAttendance(code, day);
      }

      return { ok: true };
    },
  }),
};
