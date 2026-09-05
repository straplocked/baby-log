<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TimerService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The live nursing/pump/sleep timer. Only the running state lives here — when
 * the timer stops, the client writes the resulting entry through the normal
 * outbox, so the log stays the single source of truth (the server stores facts,
 * not in-flight guesses).
 */
class TimerController extends Controller
{
    /** Start (or replace) the household's running timer. */
    public function start(Request $request, TimerService $timers): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'in:nurse,pump,sleep'],
            'baby_id' => ['nullable', 'integer'],
        ]);

        $timer = $timers->start(
            $request->user(),
            $data['type'],
            isset($data['baby_id']) ? (int) $data['baby_id'] : null,
        );

        return response()->json(['ok' => true, 'timer' => $timer]);
    }

    /** Stop the running timer. The entry itself is logged client-side. */
    public function stop(Request $request, TimerService $timers): JsonResponse
    {
        $timers->stop($request->user());

        return response()->json(['ok' => true]);
    }
}
