<?php

namespace App\Providers;

use App\Contracts\AccountProvisioner;
use Illuminate\Support\ServiceProvider;

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
        //
    }
}
