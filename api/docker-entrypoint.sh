#!/bin/sh
set -e

if [ "$1" = "reverb" ]; then
  exec php artisan reverb:start --host=0.0.0.0 --port=8080
fi

: "${DB_DATABASE:=/data/database.sqlite}"
[ -f "$DB_DATABASE" ] || touch "$DB_DATABASE"

# fpm workers run as www-data (artisan serve ran as root): the SQLite file +
# its transient journal (dir write!), and storage/ for compiled mail views
# and the file cache, must be theirs — re-done each boot to catch strays
chown -R www-data:www-data /data storage bootstrap/cache

php artisan migrate --force
# reminder pushes (feed gap / wake window / meds) ride the scheduler; per-minute
# chatter goes to /dev/null but errors stay on stderr
php artisan schedule:work >/dev/null &
# nginx self-daemonizes and just translates HTTP→FastCGI; php-fpm is the
# process that matters, so it keeps the foreground — if it dies, the
# container dies and docker's restart policy brings the pair back
nginx
exec php-fpm
