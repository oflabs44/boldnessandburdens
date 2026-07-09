# Boldness and Burdens Conference 2026

Event website for BBC'26 - a youth prayer conference.

## Stack

- **Framework**: Astro
- **Styling**: Vanilla CSS with CSS custom properties
- **Package Manager**: pnpm

## Commands

```bash
pnpm dev      # Start dev server (localhost:4321)
pnpm build    # Build for production
pnpm preview  # Preview production build
```

## Structure

```
src/
├── layouts/
│   └── BaseLayout.astro    # Shared HTML wrapper
├── pages/
│   ├── index.astro         # Info/landing page
│   └── register.astro      # Registration form
└── styles/
    └── global.css          # Design tokens & global styles
```

## Design System

- **Fonts**: Fraunces (display), Outfit (body)
- **Colors**: Warm cream bg, deep brown text, burnt orange accent (#d4873a) - derived from flyer
- **Approach**: Minimalist, mobile-first responsive

## Key Variables

```css
--color-cream: #faf6f0
--color-charcoal: #1e1610
--color-accent: #d4873a
--font-display: 'Fraunces'
--font-body: 'Outfit'
```

## Email System

Sends branded emails to registrants via SMTP. Runs locally with Bun.

### Commands

```bash
# Preview confirmation emails (no send)
bun scripts/send-email.ts --template registration-confirmation --dry-run

# Send to one person
bun scripts/send-email.ts --template registration-confirmation --to "email@example.com"

# Send to all (skips already-sent)
bun scripts/send-email.ts --template registration-confirmation

# Force resend to all (ignores sent log)
bun scripts/send-email.ts --template registration-confirmation --force

# Custom subject
bun scripts/send-email.ts --template registration-confirmation --subject "Custom Subject"
```

### Structure

```
emails/
├── base.html                          # Branded layout (header, footer, styles)
├── templates/
│   └── registration-confirmation.html # Confirmation body content
├── sent-log.json                      # Tracks who received what (gitignored)
└── preview.html                       # Last dry-run preview (gitignored)

scripts/
└── send-email.ts                      # CLI send script

data/
└── archive/                           # Archived raw form exports (csv/xlsx/pdf) — superseded by D1
```

### Adding new email templates

1. Create `emails/templates/<name>.html` with the body content
2. Use `{{name}}`, `{{email}}`, `{{city}}`, `{{code}}`, `{{codes}}`, etc. for dynamic fields
3. Add default subject to `defaultSubjects` in `scripts/send-email.ts`
4. Send with `bun scripts/send-email.ts --template <name>`

### Per-language sends (auto-routing)

Each participant has a `preferred_language` column in D1 (`en` | `de`, defaults
to `en`; editable in `/bb26/admin`). A template `foo` may have a German sibling
`foo-de.html`. When you run `--template foo`, the script sends each recipient the
variant matching their `preferred_language` (English `foo`, German `foo-de`);
subject follows the resolved variant via `defaultSubjects`. So author both files,
add both subjects, and send once with the **base** name — no need to split
recipients. Templates with no `-de` sibling go to everyone unchanged. The
sent-log tracks per resolved template, so `foo` and `foo-de` are independent.

### SMTP config

Copy `.env.example` to `.env` and fill in SMTP credentials.

### Registrant data

The curated roster lives in the D1 database `bb-conference` (binding `DB`,
edition `bb26`) — the same DB that powers the `/bb26` conference app. One row
per person in `participants`; families share an email and children have
`is_child=1` with no email. `send-email.ts` reads the roster directly from D1
via `npx wrangler d1 execute bb-conference --remote --json`, deduped by email
(one send per unique address; children with no email are excluded). Archived
raw form exports are under `data/archive/`.

## Notes

- Registration is closed; the form no longer posts to a third-party forms service (site runs on Cloudflare Workers)
- Images from Unsplash (prayer/worship theme)
- Contact: info@boldnessandburdens.com
