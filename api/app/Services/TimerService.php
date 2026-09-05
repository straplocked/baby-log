<?php

namespace App\Services;

use App\Events\HouseholdTouched;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * The one write path for the household's live timer, shared by the internal
 * endpoints, /api/v1, MCP tools, and the MQTT command handler. Only running
 * state lives on the household — stopping never writes an entry (the server
 * stores facts, not in-flight guesses); producers log the resulting entry
 * themselves via EntryWriter, exactly like the PWA does.
 */
class TimerService
{
    private const LABELS = ['nurse' => 'nursing', 'pump' => 'pumping', 'sleep' => 'a sleep timer'];

    /** Start (or replace) the running timer acting as $user. */
    public function start(User $user, string $type, ?int $babyId = null): array
    {
        $household = $user->household;
        // the timer's child must be one of ours — a foreign id is dropped, and
        // clients read a null baby_id as the primary child
        $validBabyId = $babyId !== null
            ? $household->children()->whereKey($babyId)->value('id')
            : null;
        $timer = [
            'id' => (string) Str::uuid(),
            'type' => $type,
            'started_at' => now()->getTimestampMs(),
            'user_id' => $user->id,
            'baby_id' => $validBabyId,
        ];
        $household->update(['active_timer' => $timer]);

        HouseholdTouched::send($household->id, 'timer');

        // with 2+ unarchived children the push names the timer's child (a null
        // baby_id reads as the primary, same rule clients use) — the partner's
        // lock screen shouldn't have to guess which twin is nursing
        $childName = null;
        if ($household->children()->where('archived', false)->count() > 1) {
            $childName = $validBabyId !== null
                ? $household->children()->whereKey($validBabyId)->value('name')
                : $household->children()->value('name'); // children() is id-ordered, so first = primary
        }
        $title = $user->name.' started '.self::LABELS[$type].($childName ? ' for '.$childName : '');

        // let the rest of the household know they're occupied — informational,
        // so it honors quiet hours (unlike a direct handoff ask)
        foreach ($household->othersFor($user) as $other) {
            if ($other->notifyPrefs()['timer'] && ! $other->inQuietHours()) {
                app(PushService::class)->notify(
                    $other,
                    'timer',
                    $title,
                    'Timer running in mybabynotes.',
                );
            }
        }

        return $timer;
    }

    /** Stop the running timer, returning what was running (null if nothing). */
    public function stop(User $user): ?array
    {
        $household = $user->household;
        $timer = $household->active_timer;
        $household->update(['active_timer' => null]);

        HouseholdTouched::send($household->id, 'timer');

        return $timer;
    }
}
