// Per-edition config. Clone this file (e.g. bb27.ts) and copy the /bb26 route
// folder to spin up next year's conference. Plain TS so both Astro pages and
// the Bun seed script can import it.

export const edition = {
  id: "bb26",
  name: "Boldness & Burdens Conference 2026",
  shortName: "B&B '26",
  theme: "School of the Spirit",
  codePrefix: "BB26",
  dates: "July 16 – 19, 2026",
  // Conference days, used for per-day attendance check-in.
  days: [
    { date: "2026-07-16", label: "Thu 16", long: "Thursday 16 July" },
    { date: "2026-07-17", label: "Fri 17", long: "Friday 17 July" },
    { date: "2026-07-18", label: "Sat 18", long: "Saturday 18 July" },
    { date: "2026-07-19", label: "Sun 19", long: "Sunday 19 July" },
  ],
  venue: {
    name: "Conference Venue",
    address: "Krimnitzer Weg 25, 12527 Berlin, Germany",
  },
  links: {
    site: "https://boldnessandburdens.com",
    donate: "https://boldnessandburdens.com",
  },
} as const;

export type Edition = typeof edition;
