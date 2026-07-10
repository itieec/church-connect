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
- **Working dev login:** `cc.agent.demo.329d@gmail.com` (password = the project's standard test
  password, i.e. the same one the README lists for its seeded `@ieecya.test` accounts) — a confirmed +
  approved `main_leader` account created on the live project for testing. Use it to sign in and
  exercise authenticated flows (Home dashboard, My Profile edit, prayer requests, RSVPs, reports).
- **Auth requires email confirmation** and the project uses Supabase's built-in email (very low hourly
  quota), so self-service sign-up in the UI is unreliable: repeated sign-ups return
  `429 over_email_send_rate_limit`, and a fresh sign-up can't sign in until the emailed link is
  clicked (no inbox in the VM). To mint a *new* usable login, use the Auth Admin API with the
  `service_role` key: `POST /auth/v1/admin/users` with `{"email":…,"password":…,"email_confirm":true}`,
  then approve it via `PATCH /rest/v1/profiles?id=eq.<id>` `{"account_approved":true}` (optionally set
  `role`). This bypasses email confirmation and the corrupt-seed problem below.
- **The README's seeded logins are broken** (the `@ieecya.test` accounts, and the account behind the
  `CHURCH_CONNECT_TEST_*` secret, `id 00000000-…-0001`). They return
  `500 "Database error querying schema"` on the password grant — the seeded `auth.users` rows are
  corrupt (NULL token columns), and even the Auth Admin API can't load them (`500`). They can only be
  repaired with direct SQL / the DB password (not the `service_role` key). Newly created users work
  fine, so the auth service itself is healthy.
- **`newcomers` table divergence:** the app reads/writes `newcomers`, but on the live project that
  table only has a *select* policy — **inserts are RLS-blocked (`403`) for both anon and authenticated
  users**, so the in-app "Register Newcomer" / public `/register` flows fail against live (the insert
  policy exists on the stale `new_comers` table instead). Reads, profile self-updates, and prayer
  requests all work. Pick a write action other than newcomer registration for end-to-end demos.

### Dependency note
- Install with `npm install --legacy-peer-deps` (plain `npm install` hits peer-dependency conflicts).
  This is what the startup update script runs.
