<?php

namespace App\Http\Controllers\Api;

use App\Events\HouseholdTouched;
use App\Http\Controllers\Controller;
use App\Services\PushService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * The live nursing/pump timer. Only the running state lives here — when the
 * timer stops, the client writes the resulting entry through the normal outbox,
 * so the log stays the single source of truth (the server stores facts, not
 * in-flight guesses).
 */
class TimerController extends Controller
{
    private const LABELS = ['nurse' => 'nursing', 'pump' => 'pumping'];

    /** Start (or replace) the household's running timer. */
    public function start(Request $request): JsonResponse
    {
        $data = $request->validate(['type' => ['required', 'in:nurse,pump']]);

        $user = $request->user();
        $household = $user->household;
        $timer = [
            'id' => (string) Str::uuid(),
            'type' => $data['type'],
            'started_at' => now()->getTimestampMs(),
            'user_id' => $user->id,
        ];
        $household->update(['active_timer' => $timer]);

        HouseholdTouched::send($household->id, 'timer');

        // let the other parent know they're occupied — informational, so it
        // honors quiet hours (unlike a direct handoff ask)
        $partner = $household->partnerOf($user);
        if ($partner && $partner->notifyPrefs()['timer'] && ! $partner->inQuietHours()) {
            app(PushService::class)->notify(
                $partner,
                'timer',
                $user->name.' started '.self::LABELS[$data['type']],
                'Timer running in Baby Log.',
            );
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
