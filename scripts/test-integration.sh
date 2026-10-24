#!/usr/bin/env bash
# Runs every integration suite against its own disposable database. Each suite
# insists on a specific localhost database name, so they can never touch dev or
# production data. PG_BASE is the server URL without a database name.
set -euo pipefail
PG_BASE="${PG_BASE:-postgresql://localhost:5432}"
status=0
for file in tests/*.integration.test.ts; do
  db=$(grep -o "sandar_[a-z_]*_test" "$file" | head -1 || true)
  db="${db:-sandar_test}"
  psql "$PG_BASE/postgres" -qtc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || createdb --maintenance-db="$PG_BASE/postgres" "$db"
  echo "== $(basename "$file") on $db"
  TEST_DATABASE_URL="$PG_BASE/$db" npx vitest run "$file" || status=1
done
exit $status
