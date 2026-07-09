-- Public programme registrations (post-accommodation phase).
-- Registration for accommodation has closed; these are self-service signups for
-- the PROGRAMME only (attending the sessions, no bed/room). Kept separate from
-- the curated `participants` roster so room allocation, headcounts, and the
-- email sends stay clean — this table is where public /register submissions land.
CREATE TABLE IF NOT EXISTS programme_registrations (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  edition                TEXT    NOT NULL DEFAULT 'bb26',

  full_name              TEXT    NOT NULL,
  email                  TEXT    NOT NULL,
  phone                  TEXT,
  gender                 TEXT,
  city                   TEXT,

  wants_tshirt           TEXT,
  tshirt_size            TEXT,

  photo_consent          TEXT,
  participation_consent  TEXT,
  consent_date           TEXT,

  created_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prog_reg_edition
  ON programme_registrations (edition, created_at);
