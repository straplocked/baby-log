<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Open registration
    |--------------------------------------------------------------------------
    | When false (the default), sign-up is allowed only for the very first
    | account on the instance and for emails with a pending household invite.
    | Set BABYLOG_OPEN_REGISTRATION=true to allow anyone to register.
    */

    'open_registration' => env('BABYLOG_OPEN_REGISTRATION', false),

    /*
    |--------------------------------------------------------------------------
    | Household size
    |--------------------------------------------------------------------------
    | Baby Log is built for two grown-ups per log.
    */

    'max_household_users' => 2,

    /*
    |--------------------------------------------------------------------------
    | Web Push (VAPID)
    |--------------------------------------------------------------------------
    | Left unset, a keypair is generated once into the database (zero config
    | for self-hosters, survives in the /data backup). Set both to pin your
    | own keys — e.g. shared across instances behind one hosted origin.
    */

    'vapid_public' => env('VAPID_PUBLIC_KEY'),
    'vapid_private' => env('VAPID_PRIVATE_KEY'),

    /*
    | VAPID subject (JWT `sub`): the contact URI sent to the push service.
    | MUST be an https: or mailto: URI — Apple silently drops iOS pushes
    | otherwise. Defaults to APP_URL when it's https, else a mailto. Set this
    | (e.g. mailto:you@example.com or your https public URL) if APP_URL isn't
    | your real public https origin.
    */

    'vapid_subject' => env('VAPID_SUBJECT'),

];
