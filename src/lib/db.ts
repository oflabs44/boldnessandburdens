// D1 access helpers. Astro 6 / @astrojs/cloudflare v13 removed
// `Astro.locals.runtime` — bindings come from the `cloudflare:workers` module.
// Only import this from on-demand routes (`export const prerender = false`).
import { env } from "cloudflare:workers";
import { edition } from "../config/editions/bb26";

export interface ParticipantSummary {
  code: string;
  name: string;
}

export interface ParticipantCard {
  code: string;
  name: string;
  room: string | null;
  group: string | null;
  eating: string | null;
  checkedIn: boolean;
}

export interface ParticipantAdminRow extends ParticipantCard {
  email: string | null;
  phone: string | null;
  city: string | null;
  stayingOnCamp: boolean;
}

// Typeahead search — returns minimal data only (name + code).
export async function searchParticipants(
  q: string,
): Promise<ParticipantSummary[]> {
  const term = q.trim();

  if (term.length < 2) return [];

  const { results } = await env.DB.prepare(
    `SELECT participant_code, full_name
       FROM participants
      WHERE edition = ? AND full_name LIKE ? COLLATE NOCASE
      ORDER BY full_name
      LIMIT 15`,
  )
    .bind(edition.id, `%${term}%`)
    .all<{ participant_code: string; full_name: string }>();

  return results.map((r) => ({ code: r.participant_code, name: r.full_name }));
}

// Participant-facing card — low-sensitivity logistics ONLY.
export async function getCard(code: string): Promise<ParticipantCard | null> {
  const row = await env.DB.prepare(
    `SELECT participant_code, full_name, room_number, group_name, eating_group, checked_in
       FROM participants
      WHERE edition = ? AND participant_code = ?`,
  )
    .bind(edition.id, code)
    .first<{
      participant_code: string;
      full_name: string;
      room_number: string | null;
      group_name: string | null;
      eating_group: string | null;
      checked_in: number;
    }>();

  if (!row) return null;

  return {
    code: row.participant_code,
    name: row.full_name,
    room: row.room_number,
    group: row.group_name,
    eating: row.eating_group,
    checkedIn: !!row.checked_in,
  };
}

// Admin listing — includes contact fields (behind admin auth).
export async function listParticipants(): Promise<ParticipantAdminRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT participant_code, full_name, email, phone, city,
            room_number, group_name, eating_group, checked_in, staying_on_camp
       FROM participants
      WHERE edition = ?
      ORDER BY participant_code`,
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
      eating_group: string | null;
      checked_in: number;
      staying_on_camp: number;
    }>();

  return results.map((r) => ({
    code: r.participant_code,
    name: r.full_name,
    email: r.email,
    phone: r.phone,
    city: r.city,
    room: r.room_number,
    group: r.group_name,
    eating: r.eating_group,
    checkedIn: !!r.checked_in,
    stayingOnCamp: !!r.staying_on_camp,
  }));
}

// Admin update of assignment fields for one participant.
export async function updateAssignment(
  code: string,
  fields: {
    room?: string | null;
    group?: string | null;
    eating?: string | null;
    checkedIn?: boolean;
  },
): Promise<boolean> {
  const res = await env.DB.prepare(
    `UPDATE participants
        SET room_number = ?, group_name = ?, eating_group = ?, checked_in = ?,
            updated_at = datetime('now')
      WHERE edition = ? AND participant_code = ?`,
  )
    .bind(
      fields.room ?? null,
      fields.group ?? null,
      fields.eating ?? null,
      fields.checkedIn ? 1 : 0,
      edition.id,
      code,
    )
    .run();

  return res.success;
}
