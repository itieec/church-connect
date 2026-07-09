# Church Connect — IEEC YA Ministry System

Member management and follow-up app. React Native (Expo) mobile app + Supabase backend (Postgres, Auth, Row Level Security).

## What's included (Phase 1 — core flow)

- **Auth & roles** — sign up / sign in via Supabase Auth. Roles: super_admin, admin, main_leader, core_team, team_leader, minister, member, newcomer. Role-based tabs (Follow Up tab only shows for leaders/ministers).
- **Newcomer registration** — leaders register newcomers (no account needed). If the newcomer later signs up with the same email, their record auto-links to their account.
- **Weekly follow-up** — assignments list ("My Assignments" / "All"), weekly updates (contacted, came to church, needs prayer, interested in Bible study, notes, next action), full history per newcomer.
- **Approval to Member** — leaders approve a newcomer → status becomes MEMBER, recorded in an audit table (`status_changes`). Enforced server-side via a Postgres function.
- **G5 & Bible Study groups** — create groups, add/remove members (long-press to remove), G5 size limit enforced (default 1 leader + 5 members, changeable).
- **Home dashboard** — live counts of newcomers, members, and groups for leaders.

## Phase 2 (included)

- **Member directory (People tab)** — search everyone, view details; admins change roles (via `set_user_role` RPC), Core Team+ promote to Minister (`promote_to_minister` RPC — enforces G5 membership first).
- **Attendance** — pick date + service type, tap to mark present, saves as upsert so it can be corrected.
- **Ministry teams** — all 13 teams with member counts; assign/remove people (long-press to remove).
- **Contributions** — leaders record monthly giving manually; members see their own history and total. (Online payments via Stripe/PayPal still deferred.)
- **Announcements** — leaders post church-wide announcements; everyone reads them under More.
- **Web-safe dialogs** — alerts/confirms work on web too (`src/lib/notify.ts`).

## Phase 3 (included)

- **Admin page** (More → Admin, admin roles only) — roles overview, activate/deactivate users, status-change audit log, create new ministry teams.
- **Reports & Analytics** (More → Reports, leaders) — member journey snapshot, attendance per service, newcomer growth by month, weekly follow-up activity, recent group reports.
- **READY status** — follow-up leaders mark committed newcomers READY (orange badge) before Core Team approves them as Members. Full flow: Newcomer → Follow Up → Ready → Member → Minister.
- **Group management** — edit group name, leader, meeting day/time; G5 size limit; Bible Study book + location.
- **Weekly group reports** — G5/Bible Study leaders submit attendance count, lesson, and notes per week (visible in group detail and Reports).
- **Profile editing** — members update their own phone, address, gender, age group.

Migrations live in `supabase/schema.sql`, `migration_phase2.sql`, `migration_phase3.sql` (all already applied to the live project).

## Phase 4 (included)

- **Needs Attention alerts** — Home screen warns leaders about newcomers with no follow-up in 14+ days (tap to open) and your own assignments due for a weekly update.
- **Auto-assignment** — new registrations are assigned to the least-loaded active member of the "Follow Up" ministry team (server-side `assign_followup_leader()`); falls back to the registering leader. Add people to the Follow Up team (More → Ministry Teams) to activate balancing.
- **QR self-registration** — public `/register` web route (no sign-in needed; anonymous insert policy). More → Registration QR generates the QR code. While testing on shared Wi-Fi use `http://<your-lan-ip>:8081/register`; for real use, host the web build and set `publicRegistrationUrl` in app.json.
- **Consistency signal** — follow-up detail shows "came to church X of last N check-ins" + Bible study interest, backing the READY decision with data.

Migration: `supabase/migration_phase4.sql` (applied).

## Phase 5 (included)

- **Announcements on Home** — latest 3 announcements at the top for everyone, with "See all".
- **Events & RSVP** (More → Events) — leaders create events; everyone RSVPs Going/Maybe/No with live counts; long-press to cancel.
- **Prayer** (More → Prayer) — anyone submits requests; Prayer team/leaders see the queue, plus newcomers flagged "needs prayer" in follow-ups (last 14 days), and mark items prayed.
- **Contribution upgrades** — month selector with collected total, contributed-vs-not member counts, "not yet contributed" list, and CSV export (web).
- **Minister training tracker** — Core Team+ check off training items (Foundations, Doctrine, Leadership, etc.) on each person in People, with automatic 6-month tenure check next to the Promote button.

Migration: `supabase/migration_phase5.sql` (applied).

## Phase 6 (included)

- **Follow-up detail** — contact method (call/text/visit/other) on each update, "next follow-up date" that drives overdue alerts on Home alongside the 14-day rule.
- **Duplicate detection** — leader registration warns when the same name/phone/email already exists ("Register anyway?"). CSV import auto-skips duplicates.
- **Spiritual milestones** — baptism (leaders toggle in People), salvation date and birthday (self-service in Profile).
- **Activity timeline** — each person in People shows their journey: registered → first attendance → status changes → joined G5/Bible Study/teams → baptized.
- **Growth path** — 9-step checklist (Newcomer → … → Minister) on every person in People and on each member's own Profile.
- **Reports additions** — inactive members (no attendance in 3+ weeks) and birthdays this month.
- **Admin CSV** — import newcomers from CSV and export the full member list (web).

Migration: `supabase/migration_phase6.sql` (applied).

## Phase 7 (included)

- **QR check-in** (More → QR Check-In, leaders, mobile) — scan members' digital cards with the camera; each scan records attendance for the selected service type. Duplicate scans in a session are ignored.
- **Digital member card** (More → My Member Card) — every member gets a QR badge (payload `cc:person:<id>`).
- **Profile photos** — tap your avatar on My Profile to pick a photo; stored in Supabase Storage (`avatars` bucket, one file per user).
- **Push notifications (scaffolded)** — token registration on sign-in (stored in `profiles.push_token`), `eas.json` ready. Requires a dev build (see below); silently skipped in Expo Go and on web.
- **Offline-lite** — `src/lib/cache.ts` caching helper (network-first, cache fallback).

Migration: `supabase/migration_phase7.sql` (applied). After pulling these changes run `npm install --legacy-peer-deps` (new packages: expo-camera, expo-image-picker, expo-notifications, expo-device, expo-constants).

## Phase 8 (included)

- **Group chat** — every G5 group, Bible Study group, and ministry team has a real-time chat (Supabase Realtime). Open any group/team → "💬 Group Chat". Only that group's members (plus leaders) can read or post; long history capped at last 100 messages.
- **One-to-One requests** (More → One-to-One) — members request private time for counseling, prayer, mentorship, or Bible questions with preferred times. Visible only to the requester and leadership. Leaders schedule (free-text date/time), decline, or mark completed.

Migration: `supabase/migration_phase8.sql` (applied). Note: `app/dist-new` is the currently deployed build; the old `app/dist` can be deleted.

## Phase 9 (included)

- **Push notifications from the database** — pg_net triggers call Expo's push API directly: new announcements → everyone, chat messages → group members (not the sender), one-to-one confirmations/declines → the requester. Activates automatically once devices register tokens (requires the EAS dev build).
- **Unread badges** — red counts on the Groups tab and on each group/team row; opening a chat marks it read (`chat_reads`).
- **Chat moderation** — long-press deletes your own message (leaders: any message); leaders can Lock a chat to leaders-only mode (🔒 banner, enforced by RLS).
- **Counseling privacy tier** — counseling requests visible only to super_admin/admin/main_leader; prayer/mentorship/other visible to all leaders.
- **Amharic (አማርኛ)** — language toggle on the sign-in screen and My Profile; covers tabs, More menu, auth, chat, and common actions. Extend via `src/lib/i18n.tsx`.
- **Volunteer scheduling** — each ministry team has a Serving Schedule: leaders assign person + date + duty; members Confirm or request a Swap; leaders reassign.
- **Weekly Leadership Digest** — top of Reports: last-7-days newcomers, follow-ups, attendance, READY approvals waiting, pending one-to-ones, open prayer requests.

Migration: `supabase/migration_phase9.sql` (applied).

## Phase 10 — UX overhaul (included)

- **🔔 Notification bell** in every header with a live badge (unread chats + new announcements + leader queues). Opens a Notifications feed: unread chats (tap to jump into the chat), READY approvals, swap requests, one-to-one updates, upcoming events, recent announcements. Opening the feed marks things seen.
- **Home quick actions** — a shortcut grid right under the welcome card: members get My Card / Events / Prayer / One-to-One; leaders additionally get Register / Attendance / Check-In / Reports. Most tasks are now one tap from Home.
- **Events tab** for members (leaders keep their 5 tabs and reach Events via Home/More).
- **Sectioned More menu** — grouped into Community, Serving, Leadership, and Me.

## Phase 11 — account approval (included)

- **Signup approval gate** — new accounts start unapproved (`profiles.account_approved`, existing users grandfathered). After signing in, unapproved users see a "Waiting for approval" page with sign-out; it unlocks automatically (realtime + 15s poll) the moment an admin approves.
- **Admin approval UI** — Admin → Users shows a "Waiting for Approval" section; only super_admin/admin can approve. New-account items also appear in the 🔔 feed and badge for admins.
- **Approval notification** — DB trigger pushes "🎉 Account approved!" to the user's device (needs the EAS build for delivery; the waiting page unlocks regardless). Real *email* on approval needs an email provider (e.g. free Resend API key) — trigger can be added once a key exists.
- **Bell navigation fix** — bell and feed items now navigate via a root `navigationRef`, so they always land on the right screen.

Migration: `supabase/migration_phase10.sql` (applied).

## Phase 12 — account deletion + seed data (included)

- **Delete my account** — bottom of My Profile, double-confirmed, removes the auth user (everything cascades) via `delete_my_account()` RPC.
- **Admin signup push** — trigger from Phase 11 applied: admins' devices get "🔑 New account waiting" pushes (post-EAS build).
- **Seeded test data** — 20 users (`test1@ieecya.test` … `test20@ieecya.test`, password `Test1234!`, all pre-approved): 2 core team, 2 team leaders, 3 ministers, members and newcomers with baptism/birthday data; 2 G5 groups + 2 Bible Study groups with members and chat history; ministry team assignments incl. a staffed Follow Up team (auto-assign now balances); 6 newcomers with follow-up histories (one READY, one overdue); 3 Saturdays of attendance (2 members left inactive on purpose); 3 events with RSVPs; 3 announcements; prayer requests; 2 months of contributions; next-Saturday serving rota (incl. a swap request); a minister-training candidate; 2 one-to-one requests. Re-running the seed is safe (it skips if applied).

## Live deployment

**The web app is live at https://church-connect-murex.vercel.app** (Vercel project `church-connect`).
Public newcomer registration: https://church-connect-murex.vercel.app/register — this URL is set as the QR default (`publicRegistrationUrl` in app.json) and as the Supabase Auth Site URL.

To redeploy after making changes:

The static web build lives in `app/dist` (`npx expo export --platform web` regenerates it). `app/vercel.json` handles SPA routing so `/register` works.

```bash
cd app
npm i -g vercel        # once
vercel login           # once — sign in with your Vercel account
vercel deploy dist --prod --yes
```

Vercel prints your public URL (e.g. `https://church-connect-xyz.vercel.app`). Then:

1. Set `publicRegistrationUrl` in `app.json` → `expo.extra` to `https://YOUR-URL/register` so the QR screen defaults to it.
2. In Supabase → Authentication → URL Configuration, set the Site URL to your Vercel URL so email confirmation links redirect there.

## Push notifications (dev build)

```bash
npm i -g eas-cli
eas login              # your Expo account
eas init               # creates the project + adds projectId to app.json
eas build --profile development --platform android   # or ios
```

Install the produced build on your phone; push tokens then register automatically at sign-in. Sending pushes (e.g. on new announcements) is a small follow-up: a Supabase Edge Function that reads `profiles.push_token` and calls the Expo push API.

## Still deferred

Public hosting for the web app (enables QR at scale), push notifications (needs an Expo dev build), online payments (Stripe/PayPal).

## Setup

### 1. Supabase (backend)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor** → paste the contents of `supabase/schema.sql` → Run.
3. In **Authentication → Providers**, make sure Email is enabled. (Optionally disable "Confirm email" while testing.)
4. Copy your **Project URL** and **anon public key** from **Settings → API**.

### 2. Mobile app

```bash
cd app
npm install
```

Edit `app.json` → `expo.extra`:

```json
"extra": {
  "supabaseUrl": "https://YOUR-PROJECT.supabase.co",
  "supabaseAnonKey": "YOUR-ANON-KEY"
}
```

Run it:

```bash
npm start        # scan QR with Expo Go on your phone
```

### 3. Make yourself admin

Sign up in the app, then run in the Supabase SQL Editor:

```sql
update profiles set role = 'super_admin' where email = 'you@example.com';
```

## Architecture notes

- **No custom Node server needed.** Supabase's auto-generated API + Row Level Security replaces it. Authorization lives in the database (RLS policies + the `approve_to_member` function), so it can't be bypassed by a modified client.
- **Newcomers vs profiles.** `new_comers` holds people registered by leaders before they have an account (`person_id` nullable). A signup trigger auto-links by email.
- If you later need custom server logic (scheduled reminders, payment webhooks), add **Supabase Edge Functions** instead of standing up a separate Node server.

## Project structure

```
church-connect/
├── supabase/schema.sql        # full DB: tables, RLS, approval RPC, seed teams
└── app/                       # Expo React Native (TypeScript)
    ├── App.tsx
    └── src/
        ├── lib/supabase.ts    # client
        ├── context/AuthContext.tsx
        ├── navigation/index.tsx  # role-based tabs + stacks
        ├── components/ui.tsx
        ├── theme.ts / types.ts
        └── screens/           # SignIn, SignUp, Home, NewcomerRegistration,
                               # FollowUpList, FollowUpDetail, Groups, GroupDetail, Profile
```
