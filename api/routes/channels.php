<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('household.{id}', function ($user, $id) {
    return (int) $user->household_id === (int) $id;
});
