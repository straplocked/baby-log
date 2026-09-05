<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// rides the schedule:work process the api container starts alongside artisan serve
Schedule::command('babylog:reminders')->everyMinute();

// each login adds a token row — reap ones dead for over a week. Not
// sanctum:prune-expired: that reaps by created_at age alone, which deletes
// actively-used sliding tokens and no-expiry personal access tokens.
Schedule::command('babylog:prune-tokens --hours=168')->daily();
