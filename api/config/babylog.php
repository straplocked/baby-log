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
    | How many grown-ups (parents + caregivers) one log holds; pending invites
    | count against the cap. Six covers two parents plus night nurses, doulas,
    | and grandparents — raise BABYLOG_MAX_USERS if your village is bigger.
    */

    'max_household_users' => env('BABYLOG_MAX_USERS', 6),

    /*
    |--------------------------------------------------------------------------
    | Children
    |--------------------------------------------------------------------------
    | How many children one household can track.
    */

    'max_children' => 10,

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
