<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Baby extends Model
{
    protected $fillable = ['household_id', 'name', 'age_label', 'birthdate', 'archived'];

    protected $casts = ['archived' => 'boolean'];

    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
    }
}
