<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Shift extends Model
{
    protected $fillable = [
        'household_id', 'state', 'requester_id', 'user_id', 'note', 'plan', 'until',
        'requested_at', 'started_at', 'ended_at', 'handback_note',
    ];

    protected $casts = [
        'plan' => 'array',
        'requested_at' => 'integer',
        'started_at' => 'integer',
        'ended_at' => 'integer',
    ];
}
