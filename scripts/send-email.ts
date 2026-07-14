import { createTransport } from "nodemailer";
import { parseArgs } from "util";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";

const ROOT = resolve(import.meta.dirname, "..");
const EMAILS_DIR = join(ROOT, "emails");
const TEMPLATES_DIR = join(EMAILS_DIR, "templates");
const SENT_LOG_PATH = join(EMAILS_DIR, "sent-log.json");

// Single source of truth: the curated D1 roster (the same DB the /bb26 app
// uses) — no local CSVs and no per-send address corrections.
const EDITION = "bb26";
const D1_DATABASE = "bb-conference";

// --- CLI args ---

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    template: { type: "string", short: "t" },
    to: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    subject: { type: "string", short: "s" },
    emails: { type: "string" },
    codes: { type: "string" },
  },
  strict: true,
});

// --- Validate template ---

if (!values.template) {
  console.error("Usage: bun scripts/send-email.ts --template <name> [--to email] [--emails a@x,b@x] [--codes BB26-001,BB26-007] [--dry-run] [--force]");
  console.error("");
  console.error("Templates available:");

  const templates = new Bun.Glob("*.html").scanSync(TEMPLATES_DIR);

  for (const t of templates) {
    console.error(`  - ${t.replace(".html", "")}`);
  }

  process.exit(1);
}

const templateName = values.template;
const templatePath = join(TEMPLATES_DIR, `${templateName}.html`);

if (!existsSync(templatePath)) {
  console.error(`Template not found: ${templatePath}`);
  process.exit(1);
}

// --- Load templates ---

const baseHtml = readFileSync(join(EMAILS_DIR, "base.html"), "utf-8");

// Language-variant routing: a template `foo` may have a German sibling
// `foo-de.html`. When the requested template is the base and the sibling
// exists, each D1 recipient is sent the variant matching their
// preferred_language; otherwise the requested template goes to everyone.
const baseTemplate = templateName.replace(/-de$/, "");
const routeByLanguage =
  !templateName.endsWith("-de") &&
  existsSync(join(TEMPLATES_DIR, `${baseTemplate}-de.html`));

// The template a given recipient's language resolves to.
function templateFor(lang: string): string {
  return routeByLanguage && lang === "de" ? `${baseTemplate}-de` : templateName;
}

const contentCache = new Map<string, string>();

function contentFor(tpl: string): string {
  let cached = contentCache.get(tpl);

  if (cached === undefined) {
    cached = readFileSync(join(TEMPLATES_DIR, `${tpl}.html`), "utf-8");
    contentCache.set(tpl, cached);
  }

  return cached;
}

// --- Load recipients (single source: the D1 `participants` roster) ---

interface Registrant {
  full_name: string;
  email: string;
  phone: string;
  city: string;
  gender: string;
  wants_tshirt: string;
  tshirt_size: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  // Language for this address's mail; picks the template variant (en/de).
  // Shared-email families share one address, so the group's first row wins.
  preferred_language: string;
  // Everyone sharing this email address (families share one address), each
  // with their own BB26 ID — needed for templates that show the participant
  // their conference ID (badge lookup needs ID + last name).
  members: { name: string; code: string }[];
}

// Pull the curated roster straight from D1 via wrangler, grouped by email
// (families share one address, so one send per address, but each member
// keeps their own participant_code). Children have no email and are
// excluded by the `email IS NOT NULL` filter.
function fetchFromD1(): Registrant[] {
  const sql =
    "SELECT participant_code, full_name, email, phone, city, gender, wants_tshirt, tshirt_size, " +
    "emergency_contact_name, emergency_contact_phone, preferred_language " +
    "FROM participants " +
    `WHERE edition = '${EDITION}' AND email IS NOT NULL AND trim(email) != '' ` +
    "ORDER BY participant_code";

  const raw = execSync(
    `npx wrangler d1 execute ${D1_DATABASE} --remote --json --command ${JSON.stringify(sql)}`,
    { cwd: ROOT, encoding: "utf-8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 10 * 1024 * 1024 },
  );

  const start = raw.indexOf("[");

  if (start === -1) {
    throw new Error(`Unexpected wrangler output:\n${raw}`);
  }

  const rows = (JSON.parse(raw.slice(start))[0]?.results ?? []) as Record<string, string | null>[];

  const byEmail = new Map<string, Registrant>();

  for (const row of rows) {
    const email = (row.email ?? "").trim().toLowerCase();

    if (!email) {
      continue;
    }

    const member = { name: row.full_name ?? "Participant", code: row.participant_code ?? "" };

    const existing = byEmail.get(email);

    if (existing) {
      existing.members.push(member);
      continue;
    }

    byEmail.set(email, {
      full_name: row.full_name ?? "Participant",
      email,
      phone: row.phone ?? "",
      city: row.city ?? "",
      gender: row.gender ?? "",
      wants_tshirt: row.wants_tshirt ?? "no",
      tshirt_size: row.tshirt_size ?? "",
      emergency_contact_name: row.emergency_contact_name ?? "",
      emergency_contact_phone: row.emergency_contact_phone ?? "",
      preferred_language: row.preferred_language ?? "en",
      members: [member],
    });
  }

  return [...byEmail.values()];
}

function blankRegistrant(email: string): Registrant {
  return {
    full_name: "Friend",
    email: email.trim().toLowerCase(),
    phone: "",
    city: "",
    gender: "",
    wants_tshirt: "no",
    tshirt_size: "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    preferred_language: "en",
    members: [{ name: "Friend", code: "BB26-000" }],
  };
}

let registrants: Registrant[];

if (values.emails) {
  // Ad-hoc override: send to an explicit comma-separated list (still deduped).
  // Uses placeholder data (name "Friend", no real code) — not sourced from D1.
  registrants = values.emails.split(",").map((e) => blankRegistrant(e));
} else {
  console.log(`Loading roster from D1 (${D1_DATABASE}, edition ${EDITION})...`);
  registrants = fetchFromD1();
  console.log(`Loaded ${registrants.length} unique recipients.`);

  if (values.codes) {
    // Target specific participants (by their real BB26 code) while keeping
    // real D1 data. Also trims each registrant's `members` down to just the
    // requested codes, so a shared-email family member's own code doesn't
    // leak the rest of their household's codes into the email.
    const wanted = new Set(values.codes.split(",").map((c) => c.trim().toUpperCase()));

    registrants = registrants
      .map((r) => ({ ...r, members: r.members.filter((m) => wanted.has(m.code.toUpperCase())) }))
      .filter((r) => r.members.length > 0);

    console.log(`Filtered to ${registrants.length} recipient(s) matching --codes.`);
  }
}

// --- Sent log ---

function loadSentLog(): Record<string, string[]> {
  if (!existsSync(SENT_LOG_PATH)) {
    return {};
  }

  return JSON.parse(readFileSync(SENT_LOG_PATH, "utf-8"));
}

function saveSentLog(log: Record<string, string[]>) {
  writeFileSync(SENT_LOG_PATH, JSON.stringify(log, null, 2));
}

function alreadySent(email: string, template: string): boolean {
  const log = loadSentLog();

  return log[email]?.includes(template) ?? false;
}

function markSent(email: string, template: string) {
  const log = loadSentLog();

  if (!log[email]) {
    log[email] = [];
  }

  log[email].push(template);
  saveSentLog(log);
}

// --- Template rendering ---

function render(template: string, vars: Record<string, string>): string {
  let result = template;

  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }

  return result;
}

// --- Header (default branded masthead; opt-out for image-led templates) ---

const defaultHeader = `<div class="email-header">
              <img src="https://boldnessandburdens.com/logo-black.png" alt="Boldness & Burdens Conference" />
              <h1>School of the Spirit</h1>
            </div>

            <div class="divider"></div>`;

// Templates that lead with their own branded graphic skip the text header.
const noHeaderTemplates = new Set(["30-day-countdown", "20-day-countdown", "5-day-countdown", "3-day-countdown"]);

function headerFor(tpl: string): string {
  return noHeaderTemplates.has(tpl) ? "" : defaultHeader;
}

// --- Inline images embedded via CID (referenced as src="cid:<cid>") ---

const inlineImages: Record<string, { filename: string; path: string; cid: string }[]> = {
  "30-day-countdown": [
    { filename: "countdown-30.jpg", path: join(ROOT, "public", "countdown-30.jpg"), cid: "countdown30" },
  ],
  "20-day-countdown": [
    { filename: "countdown-20.jpg", path: join(ROOT, "public", "countdown-20.jpg"), cid: "countdown20" },
  ],
  "5-day-countdown": [
    { filename: "countdown-5.jpg", path: join(ROOT, "public", "countdown-5.jpg"), cid: "countdown5" },
  ],
  "3-day-countdown": [
    { filename: "countdown-3.jpg", path: join(ROOT, "public", "countdown-3.jpg"), cid: "countdown3" },
  ],
};

function attachmentsFor(tpl: string) {
  return inlineImages[tpl] || [];
}

// --- Subject lines per template ---

const defaultSubjects: Record<string, string> = {
  "registration-confirmation": "Your BBC'26 Registration is Confirmed",
  "invitation": "You're Invited to BBC'26",
  "general-invitation": "BBC 2026: A Gathering for Everyone Seeking More of God",
  "90-day-countdown": "90 Days Until We Meet the King!",
  "preparation-guide": "How to Prepare for BBC 2026",
  "tshirt-signup": "B&B Conference T-Shirt Sign Up is Open!",
  "venue-change": "Important Update: B&B Conference 2026 Venue Change",
  "30-day-countdown": "30 Days to Go — Boldness & Burdens Conference 2026",
  "20-day-countdown": "20 Days to Go: The Meeting is Near!",
  "5-day-countdown": "5 Days to Go: Are You Ready?",
  "3-day-countdown": "Finally — 3 Days to Go!",
  "tshirt-closing-reminder": "BBC 2026 T-Shirt Orders Close Tomorrow!",
  "badge-onboarding": "Your BB26 Digital Badge Is Ready",
  "badge-onboarding-de": "Dein BB26 Digital-Ausweis ist bereit",
};

// --- SMTP setup ---

const transporter = createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: (Number(process.env.SMTP_PORT) || 465) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const fromAddress = process.env.SMTP_FROM || "info@boldnessandburdens.com";

// --- Filter recipients ---

let recipients = registrants;

if (values.to) {
  const target = values.to.trim().toLowerCase();
  recipients = registrants.filter((r) => r.email === target);

  if (recipients.length === 0) {
    console.error(`No registrant found with email: ${values.to}`);
    process.exit(1);
  }
}

// --- Send ---

// Per-recipient subject: the override wins, else the resolved template's default.
function subjectFor(tpl: string): string {
  return values.subject || defaultSubjects[tpl] || `BBC'26 Update`;
}

console.log(`\nTemplate: ${templateName}${routeByLanguage ? " (auto-routing en/de by preferred_language)" : ""}`);
console.log(`From:     ${fromAddress}`);
console.log(`Mode:     ${values["dry-run"] ? "DRY RUN" : "LIVE"}`);
console.log(`Recipients: ${recipients.length}`);
console.log("");

let sent = 0;
let skipped = 0;
let errors = 0;

const previewed = new Set<string>();

for (const registrant of recipients) {
  const email = registrant.email?.toLowerCase();

  if (!email) {
    continue;
  }

  // Resolve everything for this recipient's language (falls back to the
  // requested template when there's no variant / no routing).
  const tpl = templateFor(registrant.preferred_language);
  const subject = subjectFor(tpl);

  if (!values.force && alreadySent(email, tpl)) {
    console.log(`  SKIP  ${email} (already sent: ${tpl})`);
    skipped++;

    continue;
  }

  // Most addresses cover one person, but families share an address — each
  // member keeps their own BB26 ID, so templates that need to show the
  // conference ID render one line per code (`codes`), plus a single `code`
  // for the common one-person case. No names: recipients already know
  // whose email this is.
  const codes = registrant.members
    .map((m) => `<p style="margin: 0 0 4px;"><span class="highlight">${m.code}</span></p>`)
    .join("\n");

  const vars: Record<string, string> = {
    name: registrant.full_name || "Participant",
    email: registrant.email,
    phone: registrant.phone || "",
    city: registrant.city || "",
    gender: registrant.gender || "",
    wants_tshirt: registrant.wants_tshirt || "no",
    tshirt_size: registrant.tshirt_size || "",
    emergency_contact_name: registrant.emergency_contact_name || "",
    emergency_contact_phone: registrant.emergency_contact_phone || "",
    code: registrant.members[0]?.code || "",
    codes,
    subject,
  };

  const content = render(contentFor(tpl), vars);
  const html = render(baseHtml, { ...vars, header: headerFor(tpl), content });

  if (values["dry-run"]) {
    console.log(`  WOULD SEND  ${email} (${registrant.full_name}) [${tpl}]`);

    // One preview per distinct resolved template, so mixed-language runs show
    // both variants. First variant keeps the canonical preview.html name.
    if (!previewed.has(tpl)) {
      const name = previewed.size === 0 ? "preview.html" : `preview-${tpl}.html`;
      const previewPath = join(ROOT, "emails", name);
      writeFileSync(previewPath, html);
      execSync(`open "${previewPath}"`);
      console.log(`\n  Preview saved & opened: ${previewPath}\n`);
      previewed.add(tpl);
    }

    sent++;

    continue;
  }

  try {
    await transporter.sendMail({
      from: `"Boldness & Burdens" <${fromAddress}>`,
      to: email,
      subject,
      html,
      attachments: attachmentsFor(tpl),
    });

    markSent(email, tpl);
    console.log(`  SENT  ${email} (${registrant.full_name}) [${tpl}]`);
    sent++;
  } catch (err) {
    console.error(`  FAIL  ${email}: ${(err as Error).message}`);
    errors++;
  }
}

console.log(`\nDone. Sent: ${sent}, Skipped: ${skipped}, Errors: ${errors}`);
