# All-in-one image for Unraid Community Apps: nginx (PWA + /api + /app ws
# proxy), the Laravel API (artisan serve, 8 workers), Reverb, and
# schedule:work — one container, supervised by supervisord (one small,
# boring package; we don't need s6's service graph for four flat processes).
#
# Build from the repo root:
#   docker build -f deploy/aio/Dockerfile -t mybabynotes-aio .
#
# All state (SQLite + the generated .env) lives under the /data volume.

# ---- PWA build (mirrors the root Dockerfile) ----
FROM node:22-alpine AS webbuild
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.js index.html ./
COPY public ./public
COPY src ./src
# A placeholder gets baked into the bundle; the entrypoint stamps this
# instance's generated REVERB_APP_KEY over it on boot (the Pusher app key is
# public by design — it ships in the JS of every Pusher-protocol app — but
# per-instance keys keep strangers' clients from even handshaking).
ENV VITE_REVERB_APP_KEY=__BABYLOG_REVERB_KEY__
RUN npm run build

# ---- API deps (mirrors api/Dockerfile) ----
FROM composer:2 AS deps
WORKDIR /app
COPY api/composer.json api/composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction
COPY api/ .
RUN composer dump-autoload --optimize --no-dev

# ---- Runtime ----
FROM php:8.4-cli-alpine
# gmp speeds up the Web Push EC crypto (pure-PHP fallback works but is slow)
RUN apk add --no-cache gmp gmp-dev nginx supervisor openssl \
    && docker-php-ext-install pcntl gmp bcmath \
    && apk del gmp-dev
WORKDIR /var/www/html
COPY --from=deps /app /var/www/html
COPY --from=webbuild /app/dist /usr/share/nginx/html
COPY deploy/aio/nginx.conf /etc/nginx/http.d/default.conf
COPY deploy/aio/supervisord.conf /etc/supervisord.conf
COPY deploy/aio/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /data /run/nginx

# Static wiring for the single-container layout (parity with
# deploy/unraid/docker-compose.yml). Secrets are NOT here — they are
# generated into /data/.env on first boot. Anything below can still be
# overridden per-container (real env beats the .env file in Laravel).
ENV APP_NAME="mybabynotes" \
    APP_ENV=production \
    APP_DEBUG=false \
    LOG_CHANNEL=stderr \
    DB_CONNECTION=sqlite \
    DB_DATABASE=/data/database.sqlite \
    SESSION_DRIVER=cookie \
    CACHE_STORE=file \
    QUEUE_CONNECTION=sync \
    BROADCAST_CONNECTION=reverb \
    REVERB_HOST=127.0.0.1 \
    REVERB_PORT=8080 \
    REVERB_SCHEME=http \
    REVERB_APP_MAX_CONNECTIONS=100 \
    REVERB_APP_RATE_LIMITING_ENABLED=true \
    PHP_CLI_SERVER_WORKERS=8

EXPOSE 80
VOLUME /data
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO /dev/null http://127.0.0.1/ || exit 1
ENTRYPOINT ["entrypoint.sh"]
