<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Household extends Model
{
    protected $fillable = ['invite_email', 'invite_code_hash', 'on_duty_user_id', 'settings'];

    protected $hidden = ['invite_code_hash'];

    protected $casts = ['settings' => 'array'];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function baby(): HasOne
    {
        return $this->hasOne(Baby::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(Entry::class);
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(Shift::class);
    }

    public function partnerOf(User $user): ?User
    {
        return $this->users->firstWhere('id', '!=', $user->id);
    }
}
