<?php

namespace App\Providers;

use App\Contracts\AccountProvisioner;
use Illuminate\Support\ServiceProvider;
use Laravel\Sanctum\PersonalAccessToken;
use Laravel\Sanctum\Sanctum;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // resolved at request time so config overrides win regardless of
        // provider registration order
        $this->app->bind(
            AccountProvisioner::class,
            fn ($app) => $app->make(config('babylog.account_provisioner')),
        );
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // sanctum.expiration counts from login, which would log a daily-use
        // phone out every ~90 days anyway. Slide the window instead: a token
        // stays live while its last use is inside the window, so only a
        // genuinely idle device ever re-sees the login screen. (Sanctum
        // stamps last_used_at on every authenticated request.)
        Sanctum::authenticateAccessTokensUsing(function (PersonalAccessToken $token, bool $isValid) {
            if ($isValid) {
                return true;
            }
            $minutes = config('sanctum.expiration');

            return $minutes !== null && (bool) $token->last_used_at?->gt(now()->subMinutes($minutes));
        });
    }
}
