// Generates a printable A4 signage pack for the conference: dorm door signs,
// QR info-point signs, and a help sign. Built on the official B&B brand system
// (the "School of the Spirit" tag/print direction from the brand kit):
//
//   [ torn ember band + B&B flame logo ]
//   [ white middle · Champion Gothic display ]
//   [ torn dune band · School of the Spirit · QR · Sponsored by GeTu ]
//
// The two textured bands are extracted straight from the official attendee tag
// (signage/assets/band-top.png, band-bottom.png), so the grain, torn edges,
// logo and lockup are the real artwork. Per-sign QR (inline SVG) is overlaid
// where the tag's QR sits; the GeTu sponsor credit is added bottom-left.
//
// Output: signage/signage.html — open in a browser and Print -> Save as PDF
// (A4, margins: none, background graphics: on). On screen each sheet is
// captioned "Page N / total" and separated by a gutter; print strips that.
//
// Requires the commercial Champion Gothic Heavyweight TTF at
// signage/assets/ChampionGothic-Heavyweight.ttf (from the B&B brand kit). It is
// git-ignored — falls back to Arial Narrow if absent.
//
// Run: bun scripts/generate-signage.ts

import QRCode from "qrcode";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const BASE = "https://boldnessandburdens.com";

// --- Sign definitions -------------------------------------------------------

// Dorm door signs use the EXACT room code stored on each participant record.
type Dorm = { code: string; note?: string };

const dorms: Dorm[] = [
  { code: "DORM-01" },
  { code: "DORM-02" },
  { code: "DORM-03" },
  { code: "DORM-04" },
  { code: "DORM-05" },
  { code: "DORM-06" },
  { code: "FZH-001" },
];

// Wayfinding station signs — big labels marking physical points.
const stations = ["Registration", "Main Hall", "Dining"];

const commandant = { name: "Oladayo Fagbemi", phone: "+49 162 1940237" };

// --- Rendering helpers ------------------------------------------------------

async function qr(url: string, px = 460): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 2, // quiet zone (modules) so codes scan reliably
    width: px,
    errorCorrectionLevel: "M",
    color: { dark: "#1e1610", light: "#ffffff" },
  });
}

const sponsor = `
      <div class="sponsor">
        <img class="sponsor__logo" src="assets/getu-logo.png" alt="GeTu Prospects e.V." />
        <span class="sponsor__txt"><span class="sponsor__lead">Sponsored by</span>GeTu Prospects e.V.</span>
      </div>`;

// The shared branded bottom band: authentic dune artwork + per-sign QR overlaid
// on the tag's QR position + the GeTu sponsor credit added bottom-left.
async function bottomBand(url: string): Promise<string> {
  const svg = await qr(url);
  return `
    <div class="bottom">
      <img class="band band--bottom" src="assets/band-bottom.png" alt="" />
      ${sponsor}
      <div class="qr">
        <div class="qr__tile">${svg}</div>
      </div>
    </div>`;
}

// Bottom band with the corner QR removed — used when the QR is the hero in the
// middle (scan signs), so there's only one code on the sheet.
function cleanBottomBand(): string {
  return `
    <div class="bottom">
      <img class="band band--bottom" src="assets/band-bottom-noqr.png" alt="" />
      ${sponsor}
    </div>`;
}

// A scan sign — the QR is the hero in the middle (its whole job is to be
// scanned), with a short title above it.
async function scanSign(title: string, path: string): Promise<string> {
  const svg = await qr(`${BASE}${path}`, 620);
  return `
    <img class="band band--top" src="assets/band-top.png" alt="Boldness &amp; Burdens Conference 2026" />
    <div class="mid">
      <h1 class="title title--scan">${title}</h1>
      <div class="heroqr"><div class="heroqr__tile">${svg}</div></div>
    </div>
    ${cleanBottomBand()}`;
}

async function dormSign(d: Dorm): Promise<string> {
  return `
    <img class="band band--top" src="assets/band-top.png" alt="Boldness &amp; Burdens Conference 2026" />
    <div class="mid">
      <h1 class="code">${d.code}</h1>
      ${d.note ? `<p class="note">${d.note}</p>` : ""}
    </div>
    ${await bottomBand(`${BASE}/bb26`)}`;
}

// A wayfinding station sign — a big label marking a physical point (e.g. the
// registration stand). QR goes to the given path (defaults to the /bb26 hub).
async function stationSign(label: string, path = "/bb26"): Promise<string> {
  return `
    <img class="band band--top" src="assets/band-top.png" alt="Boldness &amp; Burdens Conference 2026" />
    <div class="mid">
      <h1 class="title">${label}</h1>
    </div>
    ${await bottomBand(`${BASE}${path}`)}`;
}

async function helpSign(): Promise<string> {
  return `
    <img class="band band--top" src="assets/band-top.png" alt="Boldness &amp; Burdens Conference 2026" />
    <div class="mid">
      <h1 class="title">Need Help?</h1>
      <p class="contact"><span class="contact__name">${commandant.name}</span><span class="contact__phone">${commandant.phone}</span><span class="contact__wa">WhatsApp</span></p>
    </div>
    ${await bottomBand(`${BASE}/bb26`)}`;
}

// --- Build ------------------------------------------------------------------

type Built = { label: string; body: string };
const built: Built[] = [];

for (const d of dorms) built.push({ label: d.code, body: await dormSign(d) });
for (const s of stations) built.push({ label: s, body: await stationSign(s) });
built.push({ label: "Find Your Badge", body: await scanSign("Find Your Badge", "/bb26/participant") });
built.push({ label: "Giving", body: await scanSign("Giving", "/bb26/giving") });
built.push({ label: "Need Help?", body: await helpSign() });

const total = built.length;
const pages = built
  .map((b, i) => {
    const n = i + 1;
    const banner = `\n<!-- ${"=".repeat(22)} PAGE ${n} / ${total} · ${b.label} ${"=".repeat(22)} -->`;
    return `${banner}\n<section class="sign" data-label="Page ${n} / ${total} · ${b.label}">${b.body}\n</section>`;
  })
  .join("\n");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>BB26 Signage Pack</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>
  @font-face {
    font-family: 'Champion Gothic';
    src: url('assets/ChampionGothic-Heavyweight.ttf') format('truetype');
    font-weight: 800;
    font-display: swap;
  }

  :root {
    --ink: #1e1610;
    --muted: #4a3f35;
    --ember: #d4873a;
    --ember-dark: #a86520;
    --cream: #faf6f0;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Outfit', system-ui, sans-serif;
    color: var(--ink);
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  @page { size: A4 portrait; margin: 0; }

  /* --- The sheet: top band / white middle / bottom band ------------------- */
  .sign {
    width: 210mm;
    height: 297mm;
    background: #fff;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    page-break-after: always;
  }
  .sign:last-child { page-break-after: auto; }

  .band { display: block; width: 100%; height: auto; }
  .band--top { margin-top: -1mm; }      /* bleed the torn art to the edge */
  .band--bottom { margin-bottom: -1mm; }

  /* --- White middle: the Champion Gothic hero ---------------------------- */
  .mid {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 8mm 14mm;
    min-height: 0;
  }

  .code {
    font-family: 'Champion Gothic', 'Arial Narrow', sans-serif;
    font-weight: 800;
    font-size: 86pt;
    line-height: 0.82;
    letter-spacing: 0.01em;
    margin: 0;
    color: var(--ink);
    white-space: nowrap;
  }
  .note {
    font-size: 14pt;
    color: var(--muted);
    max-width: 130mm;
    margin: 12mm auto 0;
    line-height: 1.5;
  }

  .title {
    font-family: 'Champion Gothic', 'Arial Narrow', sans-serif;
    font-weight: 800;
    font-size: 52pt;
    line-height: 0.9;
    letter-spacing: 0.01em;
    text-transform: uppercase;
    margin: 0;
    color: var(--ink);
    max-width: 175mm;
    text-wrap: balance;
  }

  /* Scan sign — smaller title over a hero QR */
  .title--scan { font-size: 32pt; margin-bottom: 8mm; }
  .heroqr { line-height: 0; }
  .heroqr__tile {
    display: inline-block;
    background: #fff;
    padding: 5mm;
    border-radius: 3mm;
  }
  .heroqr__tile svg { display: block; width: 58mm; height: 58mm; }

  .contact { display: flex; flex-direction: column; gap: 1mm; margin: 10mm 0 0; }
  .contact__name { font-family: 'Champion Gothic', sans-serif; font-weight: 800; font-size: 34pt; letter-spacing: 0.02em; text-transform: uppercase; }
  .contact__phone { font-size: 22pt; font-weight: 700; }
  .contact__wa { font-size: 11pt; letter-spacing: 0.24em; text-transform: uppercase; color: var(--ember-dark); }

  /* --- Bottom band overlays: QR + GeTu sponsor --------------------------- */
  .bottom { position: relative; }

  .qr {
    position: absolute;
    right: 5%;
    bottom: 9%;
    width: 19%;
  }
  .qr__tile { background: #fff; padding: 3mm; border-radius: 2mm; line-height: 0; }
  .qr__tile svg { display: block; width: 100%; height: auto; }

  .sponsor {
    position: absolute;
    left: 6%;
    bottom: 11%;
    display: flex;
    align-items: center;
    gap: 2.5mm;
    max-width: 42%;
  }
  .sponsor__logo {
    height: 11mm;
    width: auto;
    display: block;
    background: #fff;
    padding: 1mm;
    border-radius: 1.5mm;
  }
  .sponsor__txt {
    display: flex;
    flex-direction: column;
    text-align: left;
    font-family: 'Outfit', sans-serif;
    font-weight: 600;
    font-size: 10.5pt;
    letter-spacing: 0.01em;
    line-height: 1.2;
    color: var(--cream);
  }
  .sponsor__lead {
    font-weight: 600;
    font-size: 7pt;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--ember);
    margin-bottom: 1.2mm;
  }

  /* --- Screen preview: make page boundaries obvious ---------------------- */
  @media screen {
    body { background: #2a2622; padding: 46px 0 20px; }
    .sign { margin: 0 auto 46px; position: relative; box-shadow: 0 12px 44px rgba(0,0,0,0.45); }
    .sign::before {
      content: attr(data-label);
      position: absolute;
      top: -26px; left: 2px;
      font-size: 12px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase;
      color: #c9b492;
    }
  }
  @media print {
    body { background: none; }
    .sign { margin: 0; box-shadow: none; }
    .sign::before { display: none; }
  }
</style>
</head>
<body>
${pages}
</body>
</html>`;

await mkdir(join(ROOT, "signage"), { recursive: true });
await Bun.write(join(ROOT, "signage", "signage.html"), html);
console.log(`Wrote signage/signage.html — ${total} signs (${dorms.length} dorms, ${stations.length} stations, 1 help).`);
console.log("Open in a browser and Print -> Save as PDF (A4, margins: none, background graphics: on).");
