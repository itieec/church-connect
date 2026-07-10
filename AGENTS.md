# AGENTS.md

## Cursor Cloud specific instructions

### What this is
Single-package **Expo (React Native + TypeScript)** app, "Church Connect". Everything lives at the
repo root (`App.tsx`, `index.ts`, `src/`). The README describes an `app/` subfolder — that layout is
stale; there is no `app/` directory.

### Backend
- The app talks to a **live hosted Supabase** project. Credentials are committed in
  `app.json` → `expo.extra` (`supabaseUrl`, `supabaseAnonKey`). There is **no local backend** and no
  local Supabase config (no `config.toml`/`seed.sql`); the SQL in `supabase/*.sql` was applied to the
  live project and has since **diverged** from it (e.g. the app reads/writes a `newcomers` table that
  exists live but the repo only defines `new_comers`). Treat `supabase/*.sql` as historical, not the
  source of truth.

### Running (headless VM → use the web target)
- Dev server: `npx expo start --web` (serves on port 8081). This is the only runnable target here —
  there is no iOS/Android emulator.
- Standard commands are in `package.json`: `npm run typecheck` (= `tsc --noEmit`),
  `npm run build:web` (= `expo export --platform web`). There is **no ESLint config and no test
  suite** in this repo.
- `npm run typecheck` passes clean. (`@types/leaflet` is a required dev dependency — without it the
  `react-leaflet` map component in `src/components/ChurchMap.web.tsx` fails to type-check.)

### Backend gotchas (important for end-to-end testing)
- **Auth requires email confirmation**, and the project uses Supabase's built-in email service, which
  has a very low hourly quota. Repeated sign-ups quickly return
  `429 over_email_send_rate_limit` ("email rate limit exceeded"), and even a successful sign-up
  cannot sign in until the emailed link is clicked. There is no inbox access from the VM.
- The README's seeded logins (`test1@ieecya.test` … `test20@ieecya.test` / `Test1234!`) currently
  fail on the live project with `500 "Database error querying schema"` on the password grant (the
  seeded `auth.users` rows appear corrupt). Fresh sign-ins for *other* users return the normal
  `email_not_confirmed`, so the token endpoint itself works — only these seeded rows are broken.
- Anonymous public registration (`/register` route → insert into `newcomers`) is **RLS-blocked** on
  the live project (the anon insert policy is on the old `new_comers` table, not `newcomers`).
- Net effect: the frontend dev environment runs fully and reaches the backend (REST reads return
  `200`), but **doing an authenticated or write action in-app needs owner intervention** — a working
  confirmed+approved test login, a Supabase `service_role` key, or dashboard access to disable email
  confirmation / repair the seeded users. Without that, only unauthenticated screens can be exercised.

### Dependency note
- Install with `npm install --legacy-peer-deps` (plain `npm install` hits peer-dependency conflicts).
  This is what the startup update script runs.
