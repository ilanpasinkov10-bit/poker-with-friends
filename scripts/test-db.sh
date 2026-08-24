#!/usr/bin/env bash
#
# Applies every migration to a throwaway PostgreSQL instance and runs the
# database test suite against it. Verifies the SQL layer — money, locking,
# authorization and RLS — without needing a Supabase project.
#
#   npm run test:db
#
# Requires a local PostgreSQL installation (initdb/pg_ctl/psql). On Debian or
# Ubuntu: sudo apt-get install postgresql. On macOS: brew install postgresql.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PGTEST_PORT:-54329}"
PGDATA="$(mktemp -d)/pwf-test"
SOCKET="$(mktemp -d)"

# Locate the server binaries, which are usually not on PATH on Debian/Ubuntu.
if command -v initdb > /dev/null 2>&1; then
  PGBIN="$(dirname "$(command -v initdb)")"
else
  PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
fi
if [ -z "${PGBIN:-}" ] || [ ! -x "$PGBIN/initdb" ]; then
  echo "error: could not find a PostgreSQL installation (initdb)." >&2
  echo "       install PostgreSQL, or set PATH to include its bin directory." >&2
  exit 1
fi

# PostgreSQL refuses to run as root; fall back to the postgres system user.
RUN=""
if [ "$(id -u)" = "0" ] && id postgres > /dev/null 2>&1; then
  PGDATA="/var/lib/postgresql/pwf-test-$$"
  SOCKET="/tmp/pwf-test-$$"
  mkdir -p "$SOCKET" && chown postgres:postgres "$SOCKET"
  mkdir -p "$(dirname "$PGDATA")" && chown postgres:postgres "$(dirname "$PGDATA")"
  RUN="su postgres -c"
fi

cleanup() {
  if [ -n "$RUN" ]; then
    $RUN "$PGBIN/pg_ctl -D $PGDATA stop -m immediate" > /dev/null 2>&1 || true
    rm -rf "$PGDATA" "$SOCKET" 2>/dev/null || true
  else
    "$PGBIN/pg_ctl" -D "$PGDATA" stop -m immediate > /dev/null 2>&1 || true
    rm -rf "$PGDATA" "$SOCKET" 2>/dev/null || true
  fi
}
trap cleanup EXIT

run() { if [ -n "$RUN" ]; then $RUN "$*"; else eval "$*"; fi; }

echo "› initialising a temporary PostgreSQL cluster"
run "$PGBIN/initdb -D $PGDATA -U postgres --auth=trust -E UTF8 --locale=C" > /dev/null
run "$PGBIN/pg_ctl -D $PGDATA -o '-p $PORT -k $SOCKET -c listen_addresses=' -w start" > /dev/null

PSQL="psql -h $SOCKET -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"

echo "› applying Supabase shims"
$PSQL -f "$ROOT/supabase/tests/shim.sql" > /dev/null 2>&1

echo "› applying migrations"
for file in "$ROOT"/supabase/migrations/*.sql; do
  printf '    %s' "$(basename "$file")"
  $PSQL -f "$file" > /dev/null 2>&1
  printf '  ok\n'
done

echo "› running database tests"
echo
$PSQL -f "$ROOT/supabase/tests/database.test.sql" 2>&1 | sed 's/^psql:.*NOTICE:  //; s/^psql:.*ERROR:  /ERROR: /'
