# WOD Assistant

Constraint-aware training companion: generates CrossFit-style workouts that respect your
equipment and your body's active impediments, logs results, detects PRs automatically, and
tells you what your programming is quietly avoiding. Also carries 5/3/1, StrongLifts,
running plans, and bodybuilding splits.

The domain engine — movement library, generator, constraint/substitution/scaling engines,
warm-up and session builders, PR/volume/bias/fatigue analyzers, framework modules — is
ported from the `wod-assistant` CLI and lives in `src/lib/domain/`. Its behavior is
unchanged; only its persistence boundary moved (see *Judgment calls*).

## Stack

Next.js 16 (App Router, RSC, Turbopack) · React 19 · TypeScript · Tailwind CSS v4 (CSS-first)
· Drizzle ORM + `pg` · better-auth (email/password) · lucide-react · sonner · Vitest.

## Setup

```bash
docker compose up -d          # Postgres 17 on localhost:5433
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:migrate            # apply drizzle/ migrations
npm run db:seed               # 17 benchmarks + a demo athlete with 8 weeks of history
npm run dev                   # http://localhost:3000
```

Sign in with the seeded account — **demo@wod.app / demo12345** — or create your own and
walk the onboarding flow.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build + type check |
| `npm run lint` | ESLint |
| `npm test` | Vitest — domain suites plus DB integration tests (**needs Postgres up**) |
| `npm run db:generate` | Generate a migration from `src/lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed benchmarks + demo data (idempotent) |

### Environment

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | Postgres connection string. Local Docker by default; a Neon pooled URL in production. |
| `BETTER_AUTH_SECRET` | 32-byte random string used to sign sessions. |
| `BETTER_AUTH_URL` | Public origin of the app (`http://localhost:3000` locally). |

## Deploying to Neon + Vercel

1. **Neon** — create a project, copy the *pooled* connection string
   (`postgres://…-pooler.…neon.tech/neondb?sslmode=require`). No code change is needed: the
   app uses the standard `pg` Pool and enables TLS whenever the URL carries `sslmode=require`.
2. **Migrate** — point `DATABASE_URL` at Neon locally and run `npm run db:migrate`, then
   `npm run db:seed` if you want the benchmark library in place (recommended — the
   benchmarks page reads from the `workouts` table).
3. **Vercel** — import the repo and set `DATABASE_URL`, `BETTER_AUTH_SECRET`, and
   `BETTER_AUTH_URL` (your deployment origin, e.g. `https://wod.vercel.app`) for
   Production/Preview. Deploy.
4. Everything that touches the database runs in server components, route handlers, or
   server actions, so nothing needs a long-lived process.

## How it fits together

```
src/
  app/(auth)/            sign-in, sign-up
  app/onboarding/        athlete profile: equipment presets, impediments
  app/(app)/             the shell — dashboard, generate, history, movements,
                         benchmarks, progress, insights, programs
  lib/domain/            ported CLI engine (pure TypeScript, no I/O)
  lib/db/                drizzle schema, mappers, migrate + seed scripts
  lib/data/              read-side queries and the per-request athlete snapshot
  lib/training/          the write paths (log a result, create a profile), auth-free
  lib/actions/           "use server" wrappers: auth + validation + revalidation
  components/            shell, charts, workout card, log side pane, primitives
```

Design system and tokens: `docs/design/` in the `wod-assistant` repo — dark charcoal with a
volt-lime accent, DM Sans for language and JetBrains Mono strictly for data.

## Judgment calls

- **Trackers were decoupled from SQLite, not rewritten.** `PRTracker`, `VolumeTracker`,
  `BiasDetector` and `FatigueTracker` took a `better-sqlite3` handle in the CLI; they now
  take the data they analyze (`new VolumeTracker(results)`, `new BiasDetector(results,
  workouts)`). `PRTracker.detectAndSavePRs` became `detectPRs` — detection returns records,
  the caller persists them. The algorithms are untouched and their ported tests still pass.
- **Two CLI gaps are fixed**: impediments and training sessions are now persisted
  (`rowToAthlete` in the CLI hardcoded `impediments: []`), so constraints survive a reload.
- **Impediment constraints are always re-derived server-side** from category/severity/regions
  via the constraint builders. The client never supplies a constraint object.
- **ACWR** (the dashboard's load-ratio ring) is computed in `lib/data/analysis.ts` as 7-day
  volume over the trailing 28-day weekly average — the CLI reported RPE trends but no ratio.
- **The Unicode charts are gone**; `components/charts` reimplements sparkline, ring gauge,
  bar, line and distribution as inline SVG on the token palette. No chart library.
- **One athlete per user.** `athletes.user_id` is unique; there's no coach/multi-athlete mode.
- **Benchmarks are seeded into `workouts`** rather than resolved from static data at write
  time, so results can FK to them like any other workout.
- **Movement and benchmark libraries stay static TypeScript** (78 movements, 17 WODs) and are
  hydrated onto prescriptions at read time.
- `npm test` includes integration tests that write to the database in `DATABASE_URL` and
  clean up after themselves. Point it at a scratch database, not production.

## Verified

`npm test` (167 tests), `npm run build`, and `npm run lint` (0 errors) pass. Against a
running dev server: sign-up redirects a new user to onboarding; the seeded athlete's
dashboard, generate, history, result detail, movements, movement detail, benchmarks,
benchmark detail, progress, insights and programs pages all render with real data; signed-out
requests redirect to `/sign-in`. The log path (persist workout → log result → detect PR →
read back through history and the analyzers) is covered end-to-end against Postgres in
`src/lib/training/log.test.ts`.
