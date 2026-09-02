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

];
