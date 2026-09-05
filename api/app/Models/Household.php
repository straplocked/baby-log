<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Collection;

class Household extends Model
{
    protected $fillable = ['on_duty_user_id', 'settings', 'active_timer', 'former_members', 'mqtt_config'];

    // mqtt_config is encrypted (broker credentials) and must NEVER appear in
    // /state — SyncController returns `settings` verbatim to every member,
    // which is exactly why this is its own column
    protected $casts = [
        'settings' => 'array',
        'active_timer' => 'array',
        'former_members' => 'array',
        'mqtt_config' => 'encrypted:array',
    ];

    protected $hidden = ['mqtt_config'];

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }

    public function children(): HasMany
    {
        return $this->hasMany(Baby::class)->orderBy('id');
    }

    /**
     * The primary (oldest) child — kept for clients that predate multi-child.
     * A plain ordered HasOne (not oldestOfMany) so setBaby's updateOrCreate
     * still writes through it.
     */
    public function baby(): HasOne
    {
        return $this->hasOne(Baby::class)->orderBy('id');
    }

    public function invites(): HasMany
    {
        return $this->hasMany(Invite::class);
    }

    public function entries(): HasMany
    {
        return $this->hasMany(Entry::class);
    }

    public function shifts(): HasMany
    {
        return $this->hasMany(Shift::class);
    }

    /** Every member except the given one, in id order. */
    public function othersFor(User $user): Collection
    {
        return $this->users->where('id', '!=', $user->id)->sortBy('id')->values();
    }

    /** Legacy accessor: "the other grown-up" — now simply the first other member. */
    public function partnerOf(User $user): ?User
    {
        return $this->othersFor($user)->first();
    }
}
