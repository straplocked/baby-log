FROM composer:2 AS deps
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction
COPY . .
RUN composer dump-autoload --optimize --no-dev

FROM php:8.4-cli-alpine
# gmp speeds up the Web Push EC crypto (pure-PHP fallback works but is slow)
RUN apk add --no-cache gmp gmp-dev \
    && docker-php-ext-install pcntl gmp bcmath \
    && apk del gmp-dev
WORKDIR /var/www/html
COPY --from=deps /app /var/www/html
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && mkdir -p /data
EXPOSE 8000 8080
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["api"]
