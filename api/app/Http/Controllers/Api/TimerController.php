<?php

namespace App\Http\Controllers\Api;

use App\Events\HouseholdTouched;
use App\Http\Controllers\Controller;
use App\Services\PushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The live nursing/pump/sleep timer. Only the running state lives here — when
 * the timer stops, the client writes the resulting entry through the normal
 * outbox, so the log stays the single source of truth (the server stores facts,
 * not in-flight guesses).
 */
class TimerController extends Controller
{
    private const LABELS = ['nurse' => 'nursing', 'pump' => 'pumping', 'sleep' => 'a sleep timer'];

    /** Start (or replace) the household's running timer. */
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:nurse,pump,sleep'],
            'baby_id' => ['nullable', 'integer'],
        ]);

        $user = $request->user();
        $household = $user->household;
        // the timer's child must be one of ours — a foreign id is dropped, and
        // clients read a null baby_id as the primary child
        $babyId = isset($data['baby_id'])
            ? $household->children()->whereKey((int) $data['baby_id'])->value('id')
            : null;
        $timer = [
            'id' => (string) Str::uuid(),
            'type' => $data['type'],
            'started_at' => now()->getTimestampMs(),
            'user_id' => $user->id,
            'baby_id' => $babyId,
        ];
        $household->update(['active_timer' => $timer]);

        HouseholdTouched::send($household->id, 'timer');

        // with 2+ unarchived children the push names the timer's child (a null
        // baby_id reads as the primary, same rule clients use) — the partner's
        // lock screen shouldn't have to guess which twin is nursing
        $childName = null;
        if ($household->children()->where('archived', false)->count() > 1) {
            $childName = $babyId !== null
                ? $household->children()->whereKey($babyId)->value('name')
                : $household->children()->value('name'); // children() is id-ordered, so first = primary
        }
        $title = $user->name.' started '.self::LABELS[$data['type']].($childName ? ' for '.$childName : '');

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

        return response()->json(['ok' => true, 'timer' => $timer]);
    }

    /** Stop the running timer. The entry itself is logged client-side. */
    public function stop(Request $request): JsonResponse
    {
        $household = $request->user()->household;
        $household->update(['active_timer' => null]);

        HouseholdTouched::send($household->id, 'timer');

        return response()->json(['ok' => true]);
    }
}
