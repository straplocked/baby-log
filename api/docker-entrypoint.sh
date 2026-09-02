#!/bin/sh
set -e

if [ "$1" = "reverb" ]; then
  exec php artisan reverb:start --host=0.0.0.0 --port=8080
fi

: "${DB_DATABASE:=/data/database.sqlite}"
[ -f "$DB_DATABASE" ] || touch "$DB_DATABASE"

php artisan migrate --force
# the built-in server is single-threaded per worker — fork enough for two
# phones polling + writing concurrently
export PHP_CLI_SERVER_WORKERS="${PHP_CLI_SERVER_WORKERS:-8}"
exec php artisan serve --host=0.0.0.0 --port=8000
