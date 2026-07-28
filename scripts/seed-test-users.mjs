#!/usr/bin/env node
/**
 * Seed test users across every app role, to exercise the Permissions tab.
 *
 *   node scripts/seed-test-users.mjs           # create
 *   node scripts/seed-test-users.mjs --undo    # delete every seeded user
 *
 * Requires a service-role key (Dashboard → Settings → API → service_role).
 * That key bypasses RLS — keep it out of git and never ship it to a client.
 *
 *   export SUPABASE_URL="https://<ref>.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="<service_role key>"
 *
 * Every seeded address ends in @example.com (RFC 2606 reserved, so these can
 * never reach a real inbox) and --undo matches on exactly that suffix.
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n');
  console.error('  export SUPABASE_URL="https://<ref>.supabase.co"');
  console.error('  export SUPABASE_SERVICE_ROLE_KEY="<service_role key>"');
  process.exit(1);
}

const EMAIL_SUFFIX = '@example.com';
const PASSWORD = 'TestPass123!';

/** [full_name, role] — 24 users spanning all eight roles. */
const USERS = [
  ['Abel Tesfaye',      'super_admin'],
  ['Marta Gebre',       'admin'],
  ['Daniel Bekele',     'admin'],
  ['Sara Alemu',        'main_leader'],
  ['Yohannes Kebede',   'main_leader'],
  ['Ruth Haile',        'core_team'],
  ['Nathan Girma',      'core_team'],
  ['Hanna Tadesse',     'core_team'],
  ['Samuel Desta',      'team_leader'],
  ['Bethel Mekonnen',   'team_leader'],
  ['Eyob Assefa',       'team_leader'],
  ['Lidya Solomon',     'minister'],
  ['Kaleb Worku',       'minister'],
  ['Tigist Abera',      'minister'],
  ['Henok Mulugeta',    'minister'],
  ['Selam Negash',      'member'],
  ['Yared Fikru',       'member'],
  ['Meron Tesfa',       'member'],
  ['Dawit Legesse',     'member'],
  ['Rahel Getachew',    'member'],
  ['Simon Yilma',       'newcomer'],
  ['Eden Berhanu',      'newcomer'],
  ['Nahom Tilahun',     'newcomer'],
  ['Feven Ayele',       'newcomer'],
];

const admin = createClient(URL, KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** "Abel Tesfaye" → "abel.tesfaye@example.com" */
const emailFor = (name) =>
  name.toLowerCase().replace(/\s+/g, '.') + EMAIL_SUFFIX;

/** Page through every auth user; the admin API caps out at 1000 per page. */
async function allUsers() {
  const out = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    out.push(...data.users);
    if (data.users.length < 1000) return out;
  }
}

async function create() {
  const existing = new Map(
    (await allUsers()).map((u) => [u.email?.toLowerCase(), u.id]),
  );

  let created = 0;
  let reused = 0;
  let failed = 0;

  for (const [fullName, role] of USERS) {
    const email = emailFor(fullName);
    let id = existing.get(email);

    if (id) {
      reused++;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: PASSWORD,
        email_confirm: true, // skip the confirmation mail — these must log in immediately
        user_metadata: { full_name: fullName },
      });
      if (error) {
        console.error(`  ✗ ${email} — ${error.message}`);
        failed++;
        continue;
      }
      id = data.user.id;
      created++;
    }

    // handle_new_user() (schema.sql) creates the profile row on insert into
    // auth.users, so this is an update — set the fields that trigger can't know.
    const { error: pErr } = await admin
      .from('profiles')
      .update({
        full_name: fullName,
        role,
        account_approved: true,
        is_active: true,
      })
      .eq('id', id);

    if (pErr) {
      console.error(`  ✗ ${email} — profile: ${pErr.message}`);
      failed++;
      continue;
    }
    console.log(`  ✓ ${role.padEnd(12)} ${email}`);
  }

  console.log(`\n${created} created, ${reused} already existed, ${failed} failed.`);
  if (created || reused) console.log(`Password for all seeded users: ${PASSWORD}`);
}

async function undo() {
  const targets = (await allUsers()).filter((u) =>
    u.email?.toLowerCase().endsWith(EMAIL_SUFFIX),
  );

  if (!targets.length) {
    console.log('No seeded users found.');
    return;
  }

  let deleted = 0;
  for (const u of targets) {
    // profiles.id is ON DELETE CASCADE, so the profile row goes with the user.
    const { error } = await admin.auth.admin.deleteUser(u.id);
    if (error) console.error(`  ✗ ${u.email} — ${error.message}`);
    else {
      console.log(`  ✓ deleted ${u.email}`);
      deleted++;
    }
  }
  console.log(`\n${deleted} of ${targets.length} deleted.`);
}

const undoing = process.argv.includes('--undo');
console.log(
  undoing
    ? `Deleting every *${EMAIL_SUFFIX} user…\n`
    : `Seeding ${USERS.length} test users…\n`,
);

(undoing ? undo() : create()).catch((e) => {
  console.error(`\nFailed: ${e.message}`);
  process.exit(1);
});
