#!/usr/bin/env bash
#
# Apply every pending Supabase migration, in order.
#
#   export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
#   ./scripts/apply-migrations.sh
#
# Get the URL from Supabase → Project Settings → Database → Connection string → URI.
# It contains your database password, so keep it in your shell only: it is read
# from the environment and never written to the repo.
#
#   --dry-run   list what would run, connect to nothing
#
# Every migration here is idempotent, so re-running is safe.

set -euo pipefail

cd "$(dirname "$0")/.."

# Applied in this order. Later files may depend on earlier ones.
MIGRATIONS=(
  "supabase/migration_role_permissions.sql"
  "supabase/migration_followup_autoassign.sql"
)

if [[ "${1:-}" == "--dry-run" ]]; then
  echo "Would apply, in order:"
  for m in "${MIGRATIONS[@]}"; do
    [[ -f "$m" ]] && echo "  ✓ $m" || echo "  ✗ $m (missing)"
  done
  exit 0
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql not found. Install it with:  brew install libpq && brew link --force libpq" >&2
  exit 1
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  cat >&2 <<'EOF'
SUPABASE_DB_URL is not set.

  1. Supabase dashboard → Project Settings → Database
  2. Connection string → URI, and copy it
  3. export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@<host>:5432/postgres'
  4. ./scripts/apply-migrations.sh
EOF
  exit 1
fi

echo "Connecting…"
if ! psql "$SUPABASE_DB_URL" -qtAc 'select 1' >/dev/null 2>&1; then
  echo "Could not connect. Check the URL, and that your IP is allowed under Database → Network Restrictions." >&2
  exit 1
fi
echo "Connected."
echo

failed=0
for m in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$m" ]]; then
    echo "  ✗ $m — not found"
    failed=1
    continue
  fi

  printf '  %s … ' "$m"
  # ON_ERROR_STOP so a failure surfaces here instead of scrolling past.
  if out=$(psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -q -f "$m" 2>&1); then
    echo "ok"
    # Surface NOTICEs — this is how pg_cron reports it is not enabled.
    echo "$out" | grep -i "NOTICE" | sed 's/^/      /' || true
  else
    echo "FAILED"
    echo "$out" | sed 's/^/      /'
    failed=1
    break
  fi
done

echo
if [[ $failed -eq 0 ]]; then
  echo "All migrations applied."
  echo
  echo "Verifying:"
  psql "$SUPABASE_DB_URL" -qtA -c "
    select '  role_permissions table  : ' ||
           case when to_regclass('public.role_permissions') is not null then 'ok' else 'MISSING' end
    union all select '  team_leaders view       : ' ||
           case when to_regclass('public.team_leaders') is not null then 'ok' else 'MISSING' end
    union all select '  auto-assign function    : ' ||
           case when exists (select 1 from pg_proc where proname = 'auto_assign_overdue_newcomers')
                then 'ok' else 'MISSING' end
    union all select '  newcomer alert trigger  : ' ||
           case when exists (select 1 from pg_trigger where tgname = 'newcomers_notify_leaders')
                then 'ok' else 'MISSING' end;"

  # cron.job is queried separately: Postgres resolves every relation in a
  # statement at parse time, so naming it inside an unreachable CASE branch
  # still errors when pg_cron is absent.
  if [[ "$(psql "$SUPABASE_DB_URL" -qtA -c \
        "select exists (select 1 from pg_extension where extname='pg_cron')")" == "t" ]]; then
    psql "$SUPABASE_DB_URL" -qtA -c "
      select '  pg_cron scheduled job   : ' ||
             case when exists (select 1 from cron.job where jobname = 'auto-assign-newcomers')
                  then 'ok' else 'MISSING' end;"
  else
    echo "  pg_cron scheduled job   : NOT ENABLED — turn on pg_cron in Database → Extensions, then re-run this script"
  fi
else
  echo "Stopped on failure. Nothing after the failed file was applied." >&2
  exit 1
fi
