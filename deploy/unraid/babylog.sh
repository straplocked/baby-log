#!/bin/sh
# Baby Log — Unraid install/update script.
#
# First run:  installs to /mnt/user/appdata/baby-log, generates secrets, starts the stack.
# Re-run:     pulls latest main from GitHub and rebuilds. Data survives in ./data.
#
#   curl -fsSL https://raw.githubusercontent.com/straplocked/baby-log/main/deploy/unraid/babylog.sh | sh
set -e

BASE="${BABYLOG_BASE:-/mnt/user/appdata/baby-log}"
# BABYLOG_REF pins a tag or commit (e.g. v1.0.0) — tracking main is the
# testing default; releases should pin tags.
REF="${BABYLOG_REF:-main}"
case "$REF" in
  v*) TARBALL="https://github.com/straplocked/baby-log/archive/refs/tags/$REF.tar.gz" ;;
  *)  TARBALL="https://github.com/straplocked/baby-log/archive/$REF.tar.gz" ;;
esac

command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found"; exit 1; }
docker compose version >/dev/null 2>&1 || {
  echo "ERROR: docker compose v2 not found — install the 'Docker Compose Manager' plugin from Community Apps first"
  exit 1
}

mkdir -p "$BASE/data"
cd "$BASE"

if [ ! -f .env ]; then
  cat > .env <<EOF
APP_KEY=base64:$(openssl rand -base64 32)
REVERB_APP_ID=babylog
REVERB_APP_KEY=$(openssl rand -hex 16)
REVERB_APP_SECRET=$(openssl rand -hex 24)
APP_PORT=3500
DATA_DIR=$BASE/data
EOF
  echo "==> generated fresh secrets in $BASE/.env"
fi

echo "==> downloading $REF…"
curl -fsSL "$TARBALL" -o src.tar.gz
rm -rf src.new
mkdir src.new
tar xzf src.tar.gz -C src.new --strip-components=1
rm -f src.tar.gz
rm -rf src
mv src.new src

echo "==> building + starting…"
docker compose -p baby-log --env-file "$BASE/.env" -f "$BASE/src/deploy/unraid/docker-compose.yml" up -d --build
docker image prune -f >/dev/null 2>&1 || true

PORT=$(sed -n 's/^APP_PORT=//p' "$BASE/.env")
echo "==> done — Baby Log is on port ${PORT:-3500}. Re-run this script any time to update."
