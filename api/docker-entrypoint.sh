#!/bin/sh
set -e

if [ "$1" = "reverb" ]; then
  exec php artisan reverb:start --host=0.0.0.0 --port=8080
fi

: "${DB_DATABASE:=/data/database.sqlite}"
[ -f "$DB_DATABASE" ] || touch "$DB_DATABASE"

php artisan migrate --force
# reminder pushes (feed gap / wake window / meds) ride the scheduler; per-minute
# chatter goes to /dev/null but errors stay on stderr
php artisan schedule:work >/dev/null &
# the built-in server is single-threaded per worker — fork enough for two
# phones polling + writing concurrently (--no-reload is required for the
# workers to actually spawn, and nothing edits .env at runtime anyway)
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-8}"
exec php artisan serve --host=0.0.0.0 --port=8000 --no-reload
