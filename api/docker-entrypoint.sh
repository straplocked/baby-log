#!/bin/sh
set -e

if [ "$1" = "reverb" ]; then
  exec php artisan reverb:start --host=0.0.0.0 --port=8080
fi

: "${DB_DATABASE:=/data/database.sqlite}"
[ -f "$DB_DATABASE" ] || touch "$DB_DATABASE"

php artisan migrate --force
exec php artisan serve --host=0.0.0.0 --port=8000
