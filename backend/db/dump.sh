#!/usr/bin/env bash
# A copy of dash's database before anything touches it.
#
#   backend/db/dump.sh prod      → ~/dash-backups/dash-prod-YYYYMMDD-HHMM.dump
#   backend/db/dump.sh dev       → ~/dash-backups/dash-dev-YYYYMMDD-HHMM.dump
#
# The rule (Nod Sheet "Nightly Backups", call 5, nodded 2026-11-08): no
# migration runs on prod or dev without a dump from the same session. On
# 2026-11-08 a column was dropped under the live server and restored from
# memory; the per-table CSVs taken until then would not have restored a dropped
# table's constraints, indexes or policies. This does: schema public, every
# table, custom format, restorable anywhere with pg_restore.
#
# Reads DATABASE_URL from backend/.env (prod) or backend/.env.development (dev)
# and never prints it. Refuses a client older than the server (pg_dump must be
# at least the server's major), and refuses to keep a dump that holds fewer
# tables than the schema — a short dump is deleted, not filed.
set -Eeuo pipefail

env="${1:-}"
case "${env}" in
  prod|dev) ;;
  *) echo "usage: backend/db/dump.sh prod|dev"; exit 2 ;;
esac

# The env files live only in the main checkout (they are gitignored), so a
# worktree has none: look beside this script first, then in the main
# checkout's backend/. The first run of this script, from a worktree, found
# no env and the migration ran anyway — never again: no env, no dump, and the
# message names both places it looked.
name=".env"
[ "${env}" = dev ] && name=".env.development"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
main_backend="${DASH_MAIN_BACKEND:-${HOME}/projects/dash/backend}"
envfile=""
for dir in "${here}" "${main_backend}"; do
  if [ -r "${dir}/${name}" ]; then envfile="${dir}/${name}"; break; fi
done
[ -n "${envfile}" ] || { echo "no ${name} in ${here} or ${main_backend} — nothing to dump"; exit 2; }

url="$(grep -E '^DATABASE_URL=' "${envfile}" | head -1 | cut -d= -f2- | tr -d '"'"'"'"')"
[ -n "${url}" ] || { echo "DATABASE_URL is not set in ${envfile##*/}"; exit 2; }

export PGCONNECT_TIMEOUT=15
out_dir="${DASH_BACKUPS:-${HOME}/dash-backups}"
mkdir -p "${out_dir}"
stamp="$(date +%Y%m%d-%H%M)"
out="${out_dir}/dash-${env}-${stamp}.dump"

# The client must be at least the server's major version, or pg_dump refuses.
server_num="$(psql "${url}" -Atc "show server_version_num")"
server_major=$(( server_num / 10000 ))
client_major="$(pg_dump --version | grep -oE '[0-9]+' | head -1)"
if [ "${client_major}" -lt "${server_major}" ]; then
  echo "pg_dump ${client_major} is older than the server (Postgres ${server_major}) — not dumping. Install a ${server_major}+ client."
  exit 3
fi

tables="$(psql "${url}" -Atc "select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'")"

pg_dump "${url}" -Fc -n public --no-owner --no-privileges -f "${out}.tmp"

with_data="$(pg_restore --list "${out}.tmp" | grep -c 'TABLE DATA' || true)"
if [ "${with_data}" -lt "${tables}" ]; then
  rm -f "${out}.tmp"
  echo "the dump has ${with_data} tables, the schema has ${tables} — not kept"
  exit 4
fi
mv "${out}.tmp" "${out}"

migrations="$(psql "${url}" -Atc "select count(*) from public.migrations")"
last="$(psql "${url}" -Atc "select max(filename) from public.migrations")"
size="$(du -h "${out}" | cut -f1)"

echo "dash ${env} · ${tables} tables · ${migrations} migrations (last ${last}) · ${size} · ${out}"
echo "restore: createdb dash_restore && pg_restore --no-owner --no-privileges -d dash_restore '${out}'"
