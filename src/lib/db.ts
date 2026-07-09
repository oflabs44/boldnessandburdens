// D1 access helpers. Astro 6 / @astrojs/cloudflare v13 removed
// `Astro.locals.runtime` — bindings come from the `cloudflare:workers` module.
// Only import this from on-demand routes (`export const prerender = false`).
import { env } from "cloudflare:workers";
import { edition } from "../config/editions/bb26";

// day ('YYYY-MM-DD') -> checked_in_at timestamp (UTC, "YYYY-MM-DD HH:MM:SS")
export type Attendance = Record<string, string>;

export interface ParticipantCard {
  code: string;
  name: string;
  room: string | null;
  group: string | null;
  attendance: Attendance;
}

export interface ParticipantAdminRow extends ParticipantCard {
  email: string | null;
  phone: string | null;
  city: string | null;
  stayingOnCamp: boolean;
  // Overall conference arrival flag (participants.checked_in) — distinct from
  // per-day session attendance.
  arrived: boolean;
  arrivedAt: string | null;
}

// One participant's full name by code — used to verify the last-name check on
// the public /bb26/participant lookup. Returns null if the code is unknown.
export async function getParticipantName(code: string): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT full_name FROM participants
      WHERE edition = ? AND participant_code = ?`,
  )
    .bind(edition.id, code)
    .first<{ full_name: string }>();

  return row?.full_name ?? null;
}

// Participant-facing card — low-sensitivity logistics ONLY.
export async function getCard(code: string): Promise<ParticipantCard | null> {
  const row = await env.DB.prepare(
    `SELECT participant_code, full_name, room_number, group_name
       FROM participants
      WHERE edition = ? AND participant_code = ?`,
  )
    .bind(edition.id, code)
    .first<{
      participant_code: string;
      full_name: string;
      room_number: string | null;
      group_name: string | null;
    }>();

  if (!row) return null;

  const { results } = await env.DB.prepare(
    `SELECT day, checked_in_at FROM attendance
      WHERE edition = ? AND participant_code = ?`,
  )
    .bind(edition.id, code)
    .all<{ day: string; checked_in_at: string }>();

  const attendance: Attendance = {};
  for (const a of results) attendance[a.day] = a.checked_in_at;

  return {
    code: row.participant_code,
    name: row.full_name,
    room: row.room_number,
    group: row.group_name,
    attendance,
  };
}

// Admin listing — includes contact fields (behind admin auth).
export async function listParticipants(): Promise<ParticipantAdminRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT participant_code, full_name, email, phone, city,
            room_number, group_name, staying_on_camp, checked_in, checked_in_at
       FROM participants
      WHERE edition = ?
      ORDER BY full_name COLLATE NOCASE`,
  )
    .bind(edition.id)
    .all<{
      participant_code: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      city: string | null;
      room_number: string | null;
      group_name: string | null;
      staying_on_camp: number;
      checked_in: number;
      checked_in_at: string | null;
    }>();

  // One query for all attendance in this edition, grouped by participant.
  const att = await env.DB.prepare(
    `SELECT participant_code, day, checked_in_at FROM attendance
      WHERE edition = ?`,
  )
    .bind(edition.id)
    .all<{ participant_code: string; day: string; checked_in_at: string }>();

  const byCode = new Map<string, Attendance>();
  for (const a of att.results) {
    const map = byCode.get(a.participant_code) ?? {};
    map[a.day] = a.checked_in_at;
    byCode.set(a.participant_code, map);
  }

  return results.map((r) => ({
    code: r.participant_code,
    name: r.full_name,
    email: r.email,
    phone: r.phone,
    city: r.city,
    room: r.room_number,
    group: r.group_name,
    attendance: byCode.get(r.participant_code) ?? {},
    stayingOnCamp: !!r.staying_on_camp,
    arrived: !!r.checked_in,
    arrivedAt: r.checked_in_at,
  }));
}

// Single-participant admin detail — every editable field plus attendance and
// the overall check-in flag. Returns null if the code is unknown.
export async function getAdminParticipant(
  code: string,
): Promise<ParticipantAdminRow | null> {
  const row = await env.DB.prepare(
    `SELECT participant_code, full_name, email, phone, city,
            room_number, group_name, staying_on_camp, checked_in, checked_in_at
       FROM participants
      WHERE edition = ? AND participant_code = ?`,
  )
    .bind(edition.id, code)
    .first<{
      participant_code: string;
      full_name: string;
      email: string | null;
      phone: string | null;
      city: string | null;
      room_number: string | null;
      group_name: string | null;
      staying_on_camp: number;
      checked_in: number;
      checked_in_at: string | null;
    }>();

  if (!row) return null;

  const { results } = await env.DB.prepare(
    `SELECT day, checked_in_at FROM attendance
      WHERE edition = ? AND participant_code = ?`,
  )
    .bind(edition.id, code)
    .all<{ day: string; checked_in_at: string }>();

  const attendance: Attendance = {};
  for (const a of results) attendance[a.day] = a.checked_in_at;

  return {
    code: row.participant_code,
    name: row.full_name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    room: row.room_number,
    group: row.group_name,
    attendance,
    stayingOnCamp: !!row.staying_on_camp,
    arrived: !!row.checked_in,
    arrivedAt: row.checked_in_at,
  };
}

// Admin: set/clear a participant's overall conference arrival (checked_in).
// Distinct from per-day attendance — this is "they're on site". Stamps
// checked_in_at on arrival, clears it on un-check-in.
export async function setArrived(
  code: string,
  arrived: boolean,
): Promise<boolean> {
  const flag = arrived ? 1 : 0;

  const res = await env.DB.prepare(
    `UPDATE participants
        SET checked_in = ?,
            checked_in_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END,
            updated_at = datetime('now')
      WHERE edition = ? AND participant_code = ?`,
  )
    .bind(flag, flag, edition.id, code)
    .run();

  return res.success;
}

// Admin update of a participant's editable details. Does not touch the overall
// check-in flag or attendance — those are managed via their own endpoints.
export async function updateParticipant(
  code: string,
  fields: {
    room?: string | null;
    group?: string | null;
    email?: string | null;
    phone?: string | null;
    city?: string | null;
    stayingOnCamp?: boolean;
  },
): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE participants
        SET room_number = ?, group_name = ?,
            email = ?, phone = ?, city = ?, staying_on_camp = ?,
            updated_at = datetime('now')
      WHERE edition = ? AND participant_code = ?`,
  )
    .bind(
      fields.room ?? null,
      fields.group ?? null,
      fields.email ?? null,
      fields.phone ?? null,
      fields.city ?? null,
      fields.stayingOnCamp ? 1 : 0,
      edition.id,
      code,
    )
    .run();

  return res.success;
}

// A public programme signup (post-accommodation phase). Lands in the separate
// `programme_registrations` table, never in the curated `participants` roster.
export interface ProgrammeRegistrationInput {
  fullName: string;
  email: string;
  phone: string | null;
  gender: string | null;
  city: string | null;
  photoConsent: string | null;
  participationConsent: string | null;
  consentDate: string | null;
}

// Public: record one programme registration. Add-only; no dedupe (a person may
// legitimately re-submit, and the admin reconciles later).
export async function createProgrammeRegistration(
  input: ProgrammeRegistrationInput,
): Promise<boolean> {
  const res = await env.DB.prepare(
    `INSERT INTO programme_registrations
       (edition, full_name, email, phone, gender, city,
        photo_consent, participation_consent, consent_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      edition.id,
      input.fullName,
      input.email,
      input.phone,
      input.gender,
      input.city,
      input.photoConsent,
      input.participationConsent,
      input.consentDate,
    )
    .run();

  return res.success;
}

const isConferenceDay = (day: string) =>
  edition.days.some((d) => d.date === day);

// Mark a participant present for a day. Additive and idempotent — safe for the
// public self check-in surface (it can add, never remove).
export async function markAttendance(
  code: string,
  day: string,
): Promise<boolean> {
  if (!isConferenceDay(day)) return false;

  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO attendance (edition, participant_code, day)
     VALUES (?, ?, ?)`,
  )
    .bind(edition.id, code, day)
    .run();

  return res.success;
}

// Admin set/clear a day's attendance (removal is admin-only).
export async function setAttendance(
  code: string,
  day: string,
  present: boolean,
): Promise<boolean> {
  if (!isConferenceDay(day)) return false;

  if (present) return markAttendance(code, day);

  const res = await env.DB.prepare(
    `DELETE FROM attendance
      WHERE edition = ? AND participant_code = ? AND day = ?`,
  )
    .bind(edition.id, code, day)
    .run();

  return res.success;
}

// The stored check-in timestamp (UTC) for one day, or null if not present.
export async function getAttendanceTime(
  code: string,
  day: string,
): Promise<string | null> {
  const row = await env.DB.prepare(
    `SELECT checked_in_at FROM attendance
      WHERE edition = ? AND participant_code = ? AND day = ?`,
  )
    .bind(edition.id, code, day)
    .first<{ checked_in_at: string }>();

  return row?.checked_in_at ?? null;
}
