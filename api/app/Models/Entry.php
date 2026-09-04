<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Entry extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = ['id', 'household_id', 'user_id', 'baby_id', 'type', 't', 'detail', 'deleted', 'rev'];

    protected $casts = [
        't' => 'integer',
        'baby_id' => 'integer',
        'rev' => 'integer',
        'deleted' => 'boolean',
    ];
}
