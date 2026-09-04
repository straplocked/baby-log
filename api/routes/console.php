<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// rides the schedule:work process the api container starts alongside artisan serve
Schedule::command('babylog:reminders')->everyMinute();

// each login adds a token row — reap ones expired for over a week (expiry itself
// is sanctum.expiration; this just keeps the table from growing forever)
Schedule::command('sanctum:prune-expired --hours=168')->daily();
